import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DataService } from './data.service';
import {
    HotfixResolution,
    MergeStats,
    VersionChain,
    fetchOfficialChain,
    fetchRemoteChain,
    isUsableEntry,
    mergeChain,
    nearestVersion,
    placeholderEntry,
    readChainFile,
    splitList,
} from './hotfix-sources';

/**
 * Resolves the client's version chain (`/query_gateway`) from every available
 * source, and keeps `src/data/version.json` up to date while doing it.
 *
 * Precedence for one version (see docs/hotfix-chain.md):
 *
 *   1. the local `version.json` cache
 *   2. local chain files — pearl-sr's `hotfix.json` is read by default, so a
 *      checkout next to the reference inherits its versions for free
 *   3. remote chain JSON URLs (`HOTFIX_REMOTE_URLS`)
 *   4. the official dispatch service (`HOTFIX_OFFICIAL=0` to disable)
 *   5. the nearest known version for the same prefix (`HOTFIX_FALLBACK=off`
 *      to disable) — a stopgap, logged as a warning
 *
 * Steps 1 and 2 are synchronous and cheap; 3 and 4 are network calls, deduped
 * per version so a reconnecting client cannot fan out a request storm.
 */
@Injectable()
export class HotfixService implements OnModuleDestroy {
    private readonly logger = new Logger(HotfixService.name);

    /** Versions that recently failed to resolve, and when they may be retried. */
    private readonly negativeCache = new Map<string, number>();
    /** In-flight lookups, so N concurrent clients cause one fetch. */
    private readonly inflight = new Map<string, Promise<HotfixResolution>>();
    /** `version|source` pairs already logged, to keep the log readable. */
    private readonly logged = new Set<string>();
    private refreshTimer: NodeJS.Timeout | null = null;

    constructor(private readonly dataService: DataService) {}

    onModuleDestroy(): void {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = null;
    }

    // ---- public API --------------------------------------------------------

    /** Resolve one client version. Never throws and never returns null. */
    public async resolve(version: string, dispatchSeed = ''): Promise<HotfixResolution> {
        const key = (version ?? '').trim();

        const cached = this.dataService.getVersionData()[key];
        if (isUsableEntry(cached)) {
            return { version: key, entry: cached, source: 'cache', fallback: false };
        }

        // Local files first: this is what makes a neighbouring pearl-sr checkout
        // work without any network access.
        const fromFile = this.pullLocalFiles(key);
        if (fromFile) return fromFile;

        const until = this.negativeCache.get(key);
        if (until && until > Date.now()) {
            return this.fallback(key, 'negative-cache');
        }

        const pending = this.inflight.get(key);
        if (pending) return pending;

        const lookup = this.lookupRemote(key, dispatchSeed).finally(() => {
            this.inflight.delete(key);
        });
        this.inflight.set(key, lookup);
        return lookup;
    }

    /**
     * Import every configured source into the chain once at startup.
     *
     * Failures are logged and swallowed: the server must start even when the
     * machine is offline, and `/query_gateway` still resolves on demand.
     */
    public async warmup(): Promise<void> {
        const chain = this.dataService.getVersionData();
        const before = Object.keys(chain).length;
        const sources: string[] = [];

        for (const file of this.importFiles()) {
            const stats = this.merge(readChainFile(file), chain);
            if (stats.added.length || stats.updated.length) {
                sources.push(`${file} (+${stats.added.length})`);
            }
        }

        for (const url of splitList(process.env.HOTFIX_REMOTE_URLS)) {
            try {
                const stats = this.merge(await fetchRemoteChain(url, this.networkOptions()), chain);
                if (stats.added.length || stats.updated.length) {
                    sources.push(`${url} (+${stats.added.length})`);
                }
            } catch (err: any) {
                this.logger.warn(`hotfix source ${url} unavailable: ${err?.message ?? err}`);
            }
        }

        const after = Object.keys(chain).length;
        if (after !== before || sources.length > 0) this.dataService.saveVersion();

        this.logger.log(
            `hotfix chain ready: ${after} version(s)` +
                (after !== before ? `, ${after - before} added` : '') +
                (sources.length > 0 ? ` [${sources.join(', ')}]` : ''),
        );

        this.scheduleRefresh();
    }

    /** Chain health, for logs and manual inspection. */
    public status(): {
        versions: number;
        resolvable: string[];
        unusable: string[];
        sources: { importFiles: string[]; remoteUrls: string[]; official: boolean; fallback: string };
    } {
        const chain = this.dataService.getVersionData();
        const resolvable: string[] = [];
        const unusable: string[] = [];
        for (const [key, entry] of Object.entries(chain)) {
            (isUsableEntry(entry) ? resolvable : unusable).push(key);
        }
        return {
            versions: Object.keys(chain).length,
            resolvable,
            unusable,
            sources: {
                importFiles: this.importFiles(),
                remoteUrls: splitList(process.env.HOTFIX_REMOTE_URLS),
                official: this.officialEnabled(),
                fallback: this.fallbackMode(),
            },
        };
    }

    // ---- sources -----------------------------------------------------------

    /** Local chain files, `HOTFIX_IMPORT_FILES` first, then the defaults. */
    private importFiles(): string[] {
        const configured = splitList(process.env.HOTFIX_IMPORT_FILES);
        if (configured.length > 0) return configured;
        return ['hotfix.json', '../pearl-sr/hotfix.json'];
    }

    private officialEnabled(): boolean {
        return (process.env.HOTFIX_OFFICIAL ?? '1') !== '0';
    }

    private fallbackMode(): string {
        return (process.env.HOTFIX_FALLBACK ?? 'nearest').toLowerCase();
    }

    private negativeTtlMs(): number {
        const seconds = Number(process.env.HOTFIX_NEGATIVE_TTL_SECONDS ?? 60);
        return (Number.isFinite(seconds) ? seconds : 60) * 1000;
    }

    private networkOptions(): { timeoutMs: number } {
        const ms = Number(process.env.HOTFIX_TIMEOUT_MS ?? 8000);
        return { timeoutMs: Number.isFinite(ms) && ms > 0 ? ms : 8000 };
    }

    /** Read local files for one version; merges everything they carry. */
    private pullLocalFiles(key: string): HotfixResolution | null {
        const chain = this.dataService.getVersionData();
        for (const file of this.importFiles()) {
            const loaded = readChainFile(file);
            if (!loaded[key]) continue;
            this.merge(loaded, chain);
            if (isUsableEntry(chain[key])) {
                this.dataService.saveVersion();
                this.logOnce(key, 'file', `resolved ${key} from ${file}`);
                return { version: key, entry: chain[key], source: `file:${file}`, fallback: false };
            }
        }
        return null;
    }

    /** Network sources: remote JSON lists first, then the official dispatch. */
    private async lookupRemote(key: string, dispatchSeed: string): Promise<HotfixResolution> {
        const chain = this.dataService.getVersionData();
        const { timeoutMs } = this.networkOptions();

        for (const url of splitList(process.env.HOTFIX_REMOTE_URLS)) {
            try {
                const loaded = await fetchRemoteChain(url, { timeoutMs });
                if (!loaded[key]) continue;
                this.merge(loaded, chain);
                if (isUsableEntry(chain[key])) {
                    this.dataService.saveVersion();
                    this.logOnce(key, 'remote', `resolved ${key} from ${url}`);
                    return { version: key, entry: chain[key], source: `remote:${url}`, fallback: false };
                }
            } catch (err: any) {
                this.logger.warn(`hotfix source ${url} failed: ${err?.message ?? err}`);
            }
        }

        if (this.officialEnabled() && key) {
            const entry = await fetchOfficialChain(key, dispatchSeed, { timeoutMs });
            if (isUsableEntry(entry)) {
                chain[key] = entry;
                this.dataService.saveVersion();
                this.logOnce(key, 'official', `resolved ${key} from the official dispatch`);
                return { version: key, entry, source: 'official', fallback: false };
            }
        }

        this.negativeCache.set(key, Date.now() + this.negativeTtlMs());
        return this.fallback(key, 'no-source');
    }

    /**
     * Last resort. Serving another version's chain is a deliberate trade: the
     * client boots and can download what it lacks, instead of dying on a
     * non-URL placeholder. The mismatched chain is logged as a warning.
     */
    private fallback(key: string, reason: string): HotfixResolution {
        if (this.fallbackMode() !== 'off') {
            const near = nearestVersion(key, this.dataService.getVersionData());
            if (near) {
                this.logOnce(
                    `nearest:${near}`,
                    'nearest',
                    `no chain for ${key} (${reason}); serving ${near} as a fallback`,
                    'warn',
                );
                return {
                    version: key,
                    entry: this.dataService.getVersionData()[near],
                    source: `nearest:${near}`,
                    fallback: true,
                };
            }
        }

        this.logOnce(
            `placeholder:${key}`,
            'placeholder',
            `no chain for ${key} (${reason}); answering ${placeholderEntry(key).asset_bundle_url}`,
            'error',
        );
        return { version: key, entry: placeholderEntry(key), source: 'placeholder', fallback: true };
    }

    // ---- helpers -----------------------------------------------------------

    private merge(incoming: VersionChain, chain: VersionChain): MergeStats {
        return mergeChain(chain, incoming, {
            overwrite: process.env.HOTFIX_OVERWRITE === '1',
        });
    }

    private logOnce(key: string, kind: string, message: string, level: 'log' | 'warn' | 'error' = 'log'): void {
        const id = `${key}|${kind}`;
        if (this.logged.has(id)) return;
        this.logged.add(id);
        this.logger[level](message);
    }

    private scheduleRefresh(): void {
        if (this.refreshTimer) return;
        const minutes = Number(process.env.HOTFIX_REFRESH_MINUTES ?? 0);
        if (!Number.isFinite(minutes) || minutes <= 0) return;

        this.refreshTimer = setInterval(
            () => {
                void this.warmup().catch((err) =>
                    this.logger.warn(`hotfix refresh failed: ${err?.message ?? err}`),
                );
            },
            minutes * 60_000,
        );
        // Do not keep the process alive just for the timer.
        this.refreshTimer.unref?.();
    }
}
