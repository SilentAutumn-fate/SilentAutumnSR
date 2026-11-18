/**
 * Resolve the server's runtime settings for the helper scripts.
 *
 * The authoritative implementation is `src/common/settings.ts`; the server reads
 * `server.config.json` and the `SASR_*` environment variables from there. The
 * launcher scripts (run.ps1, stop.js) and the dev tools run before/around the
 * build, so they cannot import the TypeScript module — this file mirrors the
 * same precedence with the same defaults:
 *
 *   server.config.json  ->  process.env (SASR_*)  ->  built-in defaults
 *
 * Keep it small and in sync with src/common/settings.ts.
 *
 * Usage:
 *   node tools/server-config.js            human-readable summary
 *   node tools/server-config.js --json     machine-readable (run.ps1 reads this)
 *   node tools/server-config.js --health   URL the "is it up" probe should use
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
    serverName: 'SilentAutumnSR',
    http: { bindHost: '0.0.0.0', port: 21000, publicHost: 'auto' },
    game: { bindHost: '0.0.0.0', port: 23301, publicHost: 'auto' },
    account: { uid: 1337, token: 'aa', nickname: 'SilentAutumnSR' },
    paths: { data: 'src/data', logs: 'logs' },
};

const VIRTUAL_INTERFACE =
    /(loopback|vethernet|hyper-?v|vmware|virtualbox|vbox|docker|wsl|tailscale|zerotier|radmin|hamachi|npcap|bluetooth|\btap\b|\btun\b|wireguard|openvpn|nordlynx|utun)/i;
const PHYSICAL_INTERFACE = /(wi-?fi|wlan|wireless|ethernet)/i;
const PRIVATE_PREFIX_SCORE = [
    [/^192\.168\./, 30],
    [/^10\./, 20],
    [/^172\.(1[6-9]|2\d|3[01])\./, 10],
];

function configFile() {
    const configured = process.env.SASR_CONFIG;
    if (configured && configured.trim() !== '') return path.resolve(process.cwd(), configured.trim());
    return path.resolve(process.cwd(), 'server.config.json');
}

function readConfig(file = configFile()) {
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`cannot parse ${file}: root value must be an object`);
    }
    return parsed;
}

function text(value, fallback) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function port(value, fallback, label) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`invalid ${label}: ${String(value)} (expected 1-65535)`);
    }
    return parsed;
}

function uid(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
        throw new Error(`invalid account uid: ${String(value)} (expected 0-4294967295)`);
    }
    return parsed === 0 ? fallback : parsed;
}

function build(file, env = process.env) {
    const http = file.http && typeof file.http === 'object' ? file.http : {};
    const game = file.game && typeof file.game === 'object' ? file.game : {};
    const account = file.account && typeof file.account === 'object' ? file.account : {};
    const paths = file.paths && typeof file.paths === 'object' ? file.paths : {};

    return {
        serverName: text(env.SASR_SERVER_NAME ?? file.serverName, DEFAULTS.serverName),
        http: {
            bindHost: text(env.SASR_HTTP_HOST ?? http.bindHost, DEFAULTS.http.bindHost),
            port: port(env.SASR_HTTP_PORT ?? http.port, DEFAULTS.http.port, 'http port'),
            publicHost: text(env.SASR_HTTP_PUBLIC_HOST ?? http.publicHost, DEFAULTS.http.publicHost),
        },
        game: {
            bindHost: text(env.SASR_GAME_HOST ?? game.bindHost, DEFAULTS.game.bindHost),
            port: port(env.SASR_GAME_PORT ?? game.port, DEFAULTS.game.port, 'game port'),
            publicHost: text(env.SASR_GAME_PUBLIC_HOST ?? game.publicHost, DEFAULTS.game.publicHost),
        },
        account: {
            uid: uid(env.SASR_UID ?? account.uid, DEFAULTS.account.uid),
            token: text(env.SASR_TOKEN ?? account.token, DEFAULTS.account.token),
            nickname: text(env.SASR_NICKNAME ?? account.nickname, DEFAULTS.account.nickname),
        },
        paths: {
            data: text(env.SASR_DATA_DIR ?? paths.data, DEFAULTS.paths.data),
            logs: text(env.SASR_LOGS_DIR ?? paths.logs, DEFAULTS.paths.logs),
        },
    };
}

function detectLanAddress() {
    let best;
    for (const [name, entries] of Object.entries(os.networkInterfaces())) {
        for (const entry of entries || []) {
            if (entry.internal) continue;
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
    return best && best.address;
}

function isLoopback(host) {
    return host === 'localhost' || host === '::1' || /^127\./.test(host);
}

function resolvePublicHost(publicHost, bindHost) {
    const wanted = String(publicHost || '').trim();
    if (wanted === '' || wanted.toLowerCase() === 'auto') {
        if (isLoopback(bindHost)) return bindHost;
        return detectLanAddress() || '127.0.0.1';
    }
    return wanted;
}

/** Where the health probe should connect: loopback unless bound to one address. */
function probeHost(bindHost) {
    if (bindHost === '0.0.0.0' || bindHost === '::' || bindHost === '') return '127.0.0.1';
    return bindHost;
}

function healthUrl(settings) {
    return `http://${probeHost(settings.http.bindHost)}:${settings.http.port}/`;
}

function summary(settings, file) {
    const httpPublic = resolvePublicHost(settings.http.publicHost, settings.http.bindHost);
    const gamePublic = resolvePublicHost(settings.game.publicHost, settings.game.bindHost);
    return [
        `config file      : ${fs.existsSync(file) ? file : '(none - built-in defaults)'}`,
        `server name      : ${settings.serverName}`,
        `dispatch / SDK   : http://${httpPublic}:${settings.http.port} (bound ${settings.http.bindHost}:${settings.http.port})`,
        `game server      : ${gamePublic}:${settings.game.port} (bound ${settings.game.bindHost}:${settings.game.port})`,
        `account          : uid ${settings.account.uid} / ${settings.account.nickname}`,
        `data directory   : ${path.resolve(process.cwd(), settings.paths.data)}`,
        `logs directory   : ${path.resolve(process.cwd(), settings.paths.logs)}`,
    ];
}

const settings = build(readConfig());

module.exports = {
    DEFAULTS,
    settings,
    build,
    readConfig,
    detectLanAddress,
    resolvePublicHost,
    probeHost,
    healthUrl,
    summary,
    configFile,
};

if (require.main === module) {
    const file = configFile();
    const args = process.argv.slice(2);
    if (args.includes('--json')) {
        process.stdout.write(
            JSON.stringify(
                {
                    ...settings,
                    httpPublicHost: resolvePublicHost(settings.http.publicHost, settings.http.bindHost),
                    gamePublicHost: resolvePublicHost(settings.game.publicHost, settings.game.bindHost),
                    healthUrl: healthUrl(settings),
                    configFile: fs.existsSync(file) ? file : null,
                    dataDir: path.resolve(process.cwd(), settings.paths.data),
                    logsDir: path.resolve(process.cwd(), settings.paths.logs),
                },
                null,
                2,
            ) + '\n',
        );
    } else if (args.includes('--health')) {
        process.stdout.write(healthUrl(settings) + '\n');
    } else {
        console.log(summary(settings, file).join('\n'));
    }
}
