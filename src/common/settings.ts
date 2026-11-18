/**
 * SilentAutumnSR — runtime settings.
 *
 * Everything that used to be a literal in the source (ports, bind addresses,
 * the address handed to the client, the account identity, the data/log
 * directories) is resolved here, so one checkout runs unchanged on another
 * machine and on another device inside the same LAN:
 *
 *   server.config.json (repo root, optional)  ->  process.env (SASR_*)  ->  defaults
 *
 * Only *relative* paths are used by default, so the defaults already work on any
 * machine as long as the server is started from the repository root. The file
 * and the environment variables exist for the cases that are not portable:
 * several servers on one host, a host with more than one network card, or a
 * client that reaches the server through a NAT/host name.
 *
 * `publicHost: "auto"` (the default) advertises the machine's LAN address when
 * the server is bound to all interfaces, and the loopback address when the
 * server is deliberately bound to loopback only. Set it explicitly when the
 * address the client must use is not a local interface address (host name,
 * port-forwarded address, ...).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Where the optional settings file lives when `SASR_CONFIG` is not set. */
export const CONFIG_FILE_NAME = 'server.config.json';

/** Environment variable naming an alternative settings file. */
export const CONFIG_PATH_ENV = 'SASR_CONFIG';

/** One listening socket (the HTTP/dispatch side, or the TCP game side). */
export interface EndpointSettings {
    /** Address the process binds. `0.0.0.0` accepts every interface. */
    bindHost: string;
    /** TCP port the process binds. */
    port: number;
    /**
     * Address written into the protocol answer the client reads
     * (dispatch `dispatchUrl`, gateway `ip`). `auto` = derive from `bindHost`.
     */
    publicHost: string;
}

/** The account the SDK stub answers with, before the client logs in. */
export interface AccountSettings {
    /** Numeric uid handed to the client; `0` means "use the built-in default". */
    uid: number;
    /** Session token handed to the client. */
    token: string;
    /** Player name used when a save has no name yet. */
    nickname: string;
}

/** Directories the server reads and writes at runtime. */
export interface PathSettings {
    /** Static design data (`version.json`, `freesr-data.json`, `resources/`). */
    data: string;
    /** Runtime logs (`server.log`, `requests.jsonl`, captures). */
    logs: string;
}

export interface ServerSettings {
    /** Name shown in dispatch, login and lineup answers. */
    serverName: string;
    http: EndpointSettings;
    game: EndpointSettings;
    account: AccountSettings;
    paths: PathSettings;
}

/** Settings file shape; every field is optional and every section may be omitted. */
export interface ServerConfigFile {
    serverName?: string;
    http?: Partial<EndpointSettings>;
    game?: Partial<EndpointSettings>;
    account?: Partial<AccountSettings>;
    paths?: Partial<PathSettings>;
}

/** Default account: the uid/token pair the previously verified setup used. */
const DEFAULT_UID = 1337;
const DEFAULT_TOKEN = 'aa';

/** Interface names that are almost never the address a client should dial. */
const VIRTUAL_INTERFACE =
    /(loopback|vethernet|hyper-?v|vmware|virtualbox|vbox|docker|wsl|tailscale|zerotier|radmin|hamachi|npcap|bluetooth|\btap\b|\btun\b|wireguard|openvpn|nordlynx|utun)/i;

/** Scores for the private address blocks; higher wins. */
const PRIVATE_PREFIX_SCORE: ReadonlyArray<readonly [RegExp, number]> = [
    [/^192\.168\./, 30],
    [/^10\./, 20],
    [/^172\.(1[6-9]|2\d|3[01])\./, 10],
];

/** Physical-looking interface names win over everything else. */
const PHYSICAL_INTERFACE = /(wi-?fi|wlan|wireless|ethernet|以太网|无线)/i;

/** The built-in defaults: one machine, one LAN, loopback always reachable. */
export function defaultSettings(): ServerSettings {
    return {
        serverName: 'SilentAutumnSR',
        http: { bindHost: '0.0.0.0', port: 21000, publicHost: 'auto' },
        game: { bindHost: '0.0.0.0', port: 23301, publicHost: 'auto' },
        account: { uid: DEFAULT_UID, token: DEFAULT_TOKEN, nickname: 'SilentAutumnSR' },
        paths: { data: 'src/data', logs: 'logs' },
    };
}

/** Resolve the settings file path: `SASR_CONFIG`, else `./server.config.json`. */
export function configFilePath(env: NodeJS.ProcessEnv = process.env): string {
    const configured = env[CONFIG_PATH_ENV];
    if (configured && configured.trim() !== '') {
        return path.resolve(process.cwd(), configured.trim());
    }
    return path.resolve(process.cwd(), CONFIG_FILE_NAME);
}

/**
 * Read the settings file. A missing file is normal (defaults apply); a file that
 * exists but cannot be parsed is fatal, because silently ignoring it would make
 * the server listen somewhere unexpected.
 */
export function readConfigFile(
    file: string = configFilePath(),
): ServerConfigFile {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf-8');
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('root value must be an object');
        }
        return parsed as ServerConfigFile;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`cannot parse ${file}: ${msg}`);
    }
}

function section<T extends object>(value: T | undefined): Partial<T> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function port(value: unknown, fallback: number, label: string): number {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`invalid ${label}: ${String(value)} (expected 1-65535)`);
    }
    return parsed;
}

function uid(value: unknown, fallback: number): number {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
        throw new Error(`invalid account uid: ${String(value)} (expected 0-4294967295)`);
    }
    return parsed === 0 ? fallback : parsed;
}

/**
 * Merge defaults, the settings file and the environment into one object.
 *
 * Environment variables: `SASR_SERVER_NAME`, `SASR_HTTP_HOST`,
 * `SASR_HTTP_PORT`, `SASR_HTTP_PUBLIC_HOST`, `SASR_GAME_HOST`,
 * `SASR_GAME_PORT`, `SASR_GAME_PUBLIC_HOST`, `SASR_UID`, `SASR_TOKEN`,
 * `SASR_NICKNAME`, `SASR_DATA_DIR`, `SASR_LOGS_DIR`.
 */
export function buildSettings(
    fileConfig: ServerConfigFile = {},
    env: NodeJS.ProcessEnv = process.env,
): ServerSettings {
    const base = defaultSettings();

    const http = section(fileConfig.http);
    const game = section(fileConfig.game);
    const account = section(fileConfig.account);
    const paths = section(fileConfig.paths);

    return {
        serverName: text(env.SASR_SERVER_NAME ?? fileConfig.serverName, base.serverName),
        http: {
            bindHost: text(env.SASR_HTTP_HOST ?? http.bindHost, base.http.bindHost),
            port: port(env.SASR_HTTP_PORT ?? http.port, base.http.port, 'http port'),
            publicHost: text(env.SASR_HTTP_PUBLIC_HOST ?? http.publicHost, base.http.publicHost),
        },
        game: {
            bindHost: text(env.SASR_GAME_HOST ?? game.bindHost, base.game.bindHost),
            port: port(env.SASR_GAME_PORT ?? game.port, base.game.port, 'game port'),
            publicHost: text(env.SASR_GAME_PUBLIC_HOST ?? game.publicHost, base.game.publicHost),
        },
        account: {
            uid: uid(env.SASR_UID ?? account.uid, base.account.uid),
            token: text(env.SASR_TOKEN ?? account.token, base.account.token),
            nickname: text(env.SASR_NICKNAME ?? account.nickname, base.account.nickname),
        },
        paths: {
            data: text(env.SASR_DATA_DIR ?? paths.data, base.paths.data),
            logs: text(env.SASR_LOGS_DIR ?? paths.logs, base.paths.logs),
        },
    };
}

/** True when an address only exists on the machine itself. */
export function isLoopback(host: string): boolean {
    return host === 'localhost' || host === '::1' || /^127\./.test(host);
}

/**
 * The machine's LAN address, preferring a physical adapter and a private block.
 * Returns undefined when the host has no usable IPv4 interface.
 */
export function detectLanAddress(
    interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string | undefined {
    let best: { address: string; score: number } | undefined;

    for (const [name, entries] of Object.entries(interfaces)) {
        if (!entries) continue;
        for (const entry of entries) {
            if (entry.internal) continue;
            // Node reports the family both as 'IPv4' and (older/other builds) 4.
            const family = String(entry.family);
            if (family !== 'IPv4' && family !== '4') continue;
            if (!/^\d+\.\d+\.\d+\.\d+$/.test(entry.address)) continue;

            let score = 0;
            if (VIRTUAL_INTERFACE.test(name)) score -= 100;
            if (PHYSICAL_INTERFACE.test(name)) score += 5;
            for (const [pattern, weight] of PRIVATE_PREFIX_SCORE) {
                if (pattern.test(entry.address)) {
                    score += weight;
                    break;
                }
            }
            if (!best || score > best.score) best = { address: entry.address, score };
        }
    }

    return best?.address;
}

/**
 * Turn an endpoint's `publicHost` into the literal address written into the
 * protocol answer. `auto` follows `bindHost`: a loopback bind advertises
 * loopback, an all-interfaces bind advertises the LAN address.
 */
export function resolvePublicHost(
    publicHost: string,
    bindHost: string,
    detect: () => string | undefined = detectLanAddress,
): string {
    const wanted = publicHost.trim();
    if (wanted === '' || wanted.toLowerCase() === 'auto') {
        if (isLoopback(bindHost)) return bindHost;
        return detect() ?? '127.0.0.1';
    }
    return wanted;
}

/**
 * `true` when the advertised host cannot be reached from another device, so the
 * server can warn instead of leaving the operator guessing.
 */
export function needsRemoteHint(settings: ServerSettings): boolean {
    return (
        !isLoopback(settings.game.bindHost) &&
        isLoopback(resolvePublicHost(settings.game.publicHost, settings.game.bindHost))
    );
}

/** Resolve a configured directory against the working directory. */
export function resolveDir(dir: string): string {
    return path.resolve(process.cwd(), dir);
}

/** Settings in effect for this process. */
export const settings: ServerSettings = buildSettings(readConfigFile(), process.env);

/** Absolute path of the active settings file (it may not exist). */
export const settingsFile: string = configFilePath();

/** One-line-per-item summary for the startup banner. */
export function describeSettings(current: ServerSettings = settings): string[] {
    const httpHost = resolvePublicHost(current.http.publicHost, current.http.bindHost);
    const gameHost = resolvePublicHost(current.game.publicHost, current.game.bindHost);
    return [
        `name=${current.serverName}`,
        `http=${current.http.bindHost}:${current.http.port} (advertises ${httpHost})`,
        `game=${current.game.bindHost}:${current.game.port} (advertises ${gameHost})`,
        `account=${current.account.uid}/${current.account.nickname}`,
        `data=${resolveDir(current.paths.data)}`,
        `logs=${resolveDir(current.paths.logs)}`,
        `config=${fs.existsSync(settingsFile) ? settingsFile : '(built-in defaults)'}`,
    ];
}
