/**
 * Version-chain ("hotfix") plumbing shared by the running server and the
 * `hotfix:update` CLI.
 *
 * The version chain is the four CDN base URLs the client needs before it can
 * download a single asset: asset bundle, ex-resource (design data), lua, and
 * ifix. `/query_gateway` answers with them, so a version that is not in the
 * chain cannot start at all ("UNSUPPORTED_VERSION" on the client side).
 *
 * pearl-sr reads them from `hotfix.json` and, on a miss, asks the official
 * dispatch service. That fetch is dead for beta builds today (the live endpoint
 * answers "client version not match" for every 4.x version we probed), so the
 * chain has to be *fed* from somewhere. This module keeps every source in one
 * place so the precedence is explicit and testable:
 *
 *   1. `src/data/version.json`          - local cache, written back below
 *   2. local chain files                - pearl-sr `hotfix.json` and friends
 *   3. remote chain URLs                - any JSON published over HTTP
 *   4. official dispatch                - mirrors pearl-sr's fetchHotfixInfo
 *   5. nearest known version            - last-resort fallback (opt-out)
 *
 * Everything here is free of Nest decorators so `dev/tools/tests.js` can require
 * the compiled copy directly, and so the CLI does not boot the whole app.
 */
import * as fs from 'fs';
import { starrail } from '../proto/starrail';
import { Gateway47, usesGateway47 } from '../proto/gateway47';

/** The entry shape stored in `src/data/version.json` and answered by the gateway. */
export interface VersionEntry {
    base_asset_bundle_url?: string;
    asset_bundle_url: string;
    ex_resource_url: string;
    lua_url: string;
    lua_version: string;
    ifixUrl: string;
    ifix_version?: string;
}

/** version key (`CNBETAWin4.6.51`) -> entry. */
export type VersionChain = { [version: string]: VersionEntry };

/**
 * Sentinel URL used when nothing resolves.
 *
 * It is deliberately not a valid http URL: the client treats a non-empty
 * `asset_bundle_url` as authoritative and then fails on the first download
 * request, which is easier to diagnose than an empty field (the client shows a
 * generic network error for an empty one).
 */
export const PLACEHOLDER_VERSION = 'UNSUPPORTED_VERSION';

/** Official dispatch hosts, keyed by version prefix (parity: pearl-sr selectHost). */
export const OFFICIAL_HOSTS: [prefix: string, host: string][] = [
    ['CNPROD', 'prod-gf-cn-dp01.bhsr.com'],
    ['CNBETA', 'beta-release01-cn.bhsr.com'],
    ['OSPROD', 'prod-official-asia-dp01.starrails.com'],
    ['OSBETA', 'beta-release01-asia.starrails.com'],
];

/** The version that was last reported as unresolvable, and when. */
export interface HotfixResolution {
    version: string;
    entry: VersionEntry;
    /** `cache` | `file:<path>` | `remote:<url>` | `official` | `nearest:<key>`. */
    source: string;
    /** True when `entry` belongs to another version (see `nearestVersion`). */
    fallback: boolean;
}

export interface MergeStats {
    added: string[];
    updated: string[];
    /** Present in the incoming chain but ignored (already known and not overwritten). */
    kept: string[];
}

export interface MergeOptions {
    /** Replace an existing usable entry when the incoming one differs. Default false. */
    overwrite?: boolean;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** First non-empty string value among `keys` (accepts undefined/null/objects). */
function pickString(source: Record<string, any>, keys: string[]): string {
    for (const key of keys) {
        const value = source?.[key];
        if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
    return '';
}

/**
 * Coerce one JSON object into a `VersionEntry`.
 *
 * Accepts every spelling that exists in the wild: pearl-sr's `hotfix.json` uses
 * `ifix_url` while SilentAutumnSR's `version.json` uses `ifixUrl`; camelCase
 * variants appear in copy-pasted chains. Returns null when a required URL is
 * missing — an entry with a hole in it is worse than no entry, because the
 * client caches the chain and fails later with a generic error.
 */
export function normalizeEntry(raw: unknown): VersionEntry | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const source = raw as Record<string, any>;

    const asset = pickString(source, ['asset_bundle_url', 'assetBundleUrl', 'AssetBundleUrl']);
    const resource = pickString(source, ['ex_resource_url', 'exResourceUrl', 'ExResourceUrl']);
    const lua = pickString(source, ['lua_url', 'luaUrl', 'LuaUrl']);
    if (!asset || !resource || !lua) return null;

    return {
        asset_bundle_url: asset,
        ...(pickString(source, ['base_asset_bundle_url', 'baseAssetBundleUrl'])
            ? { base_asset_bundle_url: pickString(source, ['base_asset_bundle_url', 'baseAssetBundleUrl']) } : {}),
        ex_resource_url: resource,
        lua_url: lua,
        lua_version: pickString(source, ['lua_version', 'luaVersion']),
        ifixUrl: pickString(source, ['ifix_url', 'ifixUrl', 'iFixUrl']),
        ifix_version: pickString(source, ['ifix_version', 'ifixVersion']) || '0',
    };
}

/**
 * True when `entry` can actually be served.
 *
 * The placeholder is rejected on purpose: once it has been written into
 * `version.json` by a buggy run, treating it as usable would keep answering
 * UNSUPPORTED_VERSION forever instead of retrying the fetch.
 */
export function isUsableEntry(entry: VersionEntry | undefined | null): entry is VersionEntry {
    if (!entry) return false;
    const urls = [entry.asset_bundle_url, entry.ex_resource_url, entry.lua_url];
    return urls.every(
        (url) => typeof url === 'string' && url.startsWith('http') && url !== PLACEHOLDER_VERSION,
    );
}

/**
 * Accepts a plain `{ version: entry }` map, a `{ versions: { … } }` wrapper, or a
 * single `{ version, asset_bundle_url, … }` object.
 */
export function extractChain(json: unknown): VersionChain {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return {};

    const root = json as Record<string, any>;
    const table: Record<string, any> =
        root.versions && typeof root.versions === 'object' && !Array.isArray(root.versions)
            ? root.versions
            : root;

    const chain: VersionChain = {};
    for (const [key, value] of Object.entries(table)) {
        if (key === 'version' && typeof value === 'string' && root.asset_bundle_url) {
            const single = normalizeEntry(root);
            if (single) chain[value] = single;
            continue;
        }
        const entry = normalizeEntry(value);
        if (entry) chain[key] = entry;
    }
    return chain;
}

/** Read and parse a chain file; returns {} (and never throws) on any error. */
export function readChainFile(file: string): VersionChain {
    try {
        const text = fs.readFileSync(file, 'utf-8');
        return extractChain(JSON.parse(text));
    } catch {
        return {};
    }
}

/** `CNBETAWin4.6.51` -> `{ prefix: 'CNBETAWin', major: 4, minor: 6, patch: 51 }`. */
export function parseVersionKey(key: string): {
    prefix: string;
    major: number;
    minor: number;
    patch: number;
} | null {
    const match = /^(.*?)(\d+)\.(\d+)\.(\d+)$/.exec(key ?? '');
    if (!match) return null;
    return {
        prefix: match[1],
        major: Number(match[2]),
        minor: Number(match[3]),
        patch: Number(match[4]),
    };
}

function versionScore(parts: { major: number; minor: number; patch: number }): number {
    return parts.major * 1_000_000 + parts.minor * 1_000 + parts.patch;
}

/**
 * Closest resolvable version to `version`, restricted to the same prefix.
 *
 * A 4.7 beta client served a 4.6 chain will usually still boot (the client
 * downloads only what it is missing and tolerates newer cached files), which is
 * better than UNSUPPORTED_VERSION. It is a stopgap, never a substitute for the
 * real chain — the caller logs the mismatch loudly.
 */
export function nearestVersion(version: string, chain: VersionChain): string | null {
    const target = parseVersionKey(version);
    if (!target) return null;

    const targetScore = versionScore(target);
    let best: { key: string; distance: number } | null = null;

    for (const [key, entry] of Object.entries(chain)) {
        if (!isUsableEntry(entry)) continue;
        const candidate = parseVersionKey(key);
        if (!candidate || candidate.prefix !== target.prefix) continue;
        const distance = Math.abs(versionScore(candidate) - targetScore);
        // Ties go to the lower version: a client can usually cope with a
        // slightly older asset set, not with assets that do not exist yet.
        if (!best || distance < best.distance || (distance === best.distance && key < best.key)) {
            best = { key, distance };
        }
    }
    return best?.key ?? null;
}

/**
 * Merge `incoming` into `target` in place.
 *
 * Never downgrades a usable entry unless `overwrite` is set, so a stale public
 * list cannot clobber a chain that was corrected by hand.
 */
export function mergeChain(
    target: VersionChain,
    incoming: VersionChain,
    options: MergeOptions = {},
): MergeStats {
    const stats: MergeStats = { added: [], updated: [], kept: [] };

    for (const [key, entry] of Object.entries(incoming)) {
        if (!isUsableEntry(entry)) continue;
        const existing = target[key];

        if (!existing || !isUsableEntry(existing)) {
            // Fill holes even when the same key exists but is unusable.
            const same = JSON.stringify(existing) === JSON.stringify(entry);
            target[key] = entry;
            if (!same) stats.added.push(key);
            continue;
        }

        if (JSON.stringify(existing) === JSON.stringify(entry)) continue;

        if (options.overwrite) {
            target[key] = entry;
            stats.updated.push(key);
        } else {
            stats.kept.push(key);
        }
    }

    return stats;
}

/** The entry served when a version cannot be resolved at all. */
export function placeholderEntry(_version: string): VersionEntry {
    return {
        asset_bundle_url: PLACEHOLDER_VERSION,
        ex_resource_url: PLACEHOLDER_VERSION,
        lua_url: PLACEHOLDER_VERSION,
        lua_version: '',
        ifixUrl: PLACEHOLDER_VERSION,
        ifix_version: '0',
    };
}

export function officialHostFor(version: string): string | null {
    return OFFICIAL_HOSTS.find(([prefix]) => version.startsWith(prefix))?.[1] ?? null;
}

/** The exact URL pearl-sr calls (parity: dispatch.zig constructUrl). */
export function buildOfficialUrl(host: string, version: string, dispatchSeed: string): string {
    return (
        `https://${host}/query_gateway?version=${encodeURIComponent(version)}` +
        `&dispatch_seed=${encodeURIComponent(dispatchSeed)}` +
        `&language_type=1&platform_type=${usesGateway47(version) ? 3 : 2}&channel_id=1&sub_channel_id=1` +
        '&is_need_url=1&account_type=1'
    );
}

/**
 * Ask the official dispatch service for one version's chain.
 *
 * Mirrors pearl-sr: base64 -> GateServer -> require all three URLs, 3 attempts
 * 100 ms apart. Returns null on every failure (including "client version not
 * match", which the live service answers with retcode + no URLs).
 */
export async function fetchOfficialChain(
    version: string,
    dispatchSeed: string,
    options: { timeoutMs?: number; attempts?: number } = {},
): Promise<VersionEntry | null> {
    const host = officialHostFor(version);
    if (!host) return null;

    const attempts = options.attempts ?? 3;
    const timeoutMs = options.timeoutMs ?? 8000;
    const url = buildOfficialUrl(host, version, dispatchSeed);

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'UnityPlayer/2021.3.21f1' },
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const body = (await res.text()).trim();
            if (!body) throw new Error('empty body');

            const codec = usesGateway47(version) ? Gateway47 : starrail.GateServer;
            const decoded = codec.decode(Buffer.from(body, 'base64')) as any;
            const entry = normalizeEntry({
                asset_bundle_url: decoded?.assetBundleUrl,
                base_asset_bundle_url: decoded?.baseAssetBundleUrl,
                ex_resource_url: decoded?.exResourceUrl,
                lua_url: decoded?.luaUrl,
                lua_version: decoded?.luaVersion,
                ifixUrl: decoded?.ifixUrl,
                ifix_version: decoded?.ifixVersion,
            });
            if (!entry) throw new Error('response is missing required hotfix urls');
            return entry;
        } catch {
            if (attempt < attempts) await sleep(100);
        }
    }
    return null;
}

/** Fetch a chain JSON published anywhere (gist, object storage, a friend's server). */
export async function fetchRemoteChain(
    url: string,
    options: { timeoutMs?: number } = {},
): Promise<VersionChain> {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'SilentAutumnSR/hotfix-updater' },
        signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return extractChain(await res.json());
}

/** Split a comma / newline separated env list into trimmed, non-empty parts. */
export function splitList(value: string | undefined | null): string[] {
    return (value ?? '')
        .split(/[,\n]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}
