/**
 * Maintenance CLI for the client version chain (`src/data/version.json`).
 *
 * The server resolves chains on demand, but that only helps while it is
 * running and only for the versions a client actually asks about. This tool
 * does the same merge ahead of time so the checkout carries a usable chain for
 * offline/first-run use:
 *
 *   npm run hotfix:update                       # import the default local files
 *   npm run hotfix:update -- --from-file X.json # import a specific chain file
 *   npm run hotfix:update -- --from-url URL     # import a published chain JSON
 *   npm run hotfix:update -- --official 4.6.51  # ask the official dispatch
 *   npm run hotfix:update -- --list             # show what is known
 *
 * `--version <key>` narrows an import to one version; `--dry-run` prints the
 * plan without touching version.json; `--json` emits machine-readable output.
 *
 * Run from the project root: `version.json` is resolved from the current
 * working directory (same convention as the server, see resolveDataPath).
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveDataPath } from './loadFreeData';
import {
    VersionChain,
    VersionEntry,
    extractChain,
    fetchOfficialChain,
    fetchRemoteChain,
    isUsableEntry,
    mergeChain,
    readChainFile,
    splitList,
} from './hotfix-sources';

const DEFAULT_IMPORT_FILES = ['hotfix.json', '../pearl-sr/hotfix.json'];

interface CliOptions {
    files: string[];
    urls: string[];
    official: string[];
    version: string | null;
    dryRun: boolean;
    json: boolean;
    list: boolean;
    file: string;
}

function usage(): void {
    console.log(
        [
            'Usage: node dist/data/hotfix-cli.js [options]',
            '',
            '  --from-file <path>   import a version chain JSON (repeatable)',
            '  --from-url <url>     import a chain JSON over HTTP (repeatable)',
            '  --official <version> ask the official dispatch for one version',
            '  --version <key>      only import this version key',
            '  --file <path>        chain file to update (default src/data/version.json)',
            '  --dry-run            print the diff, write nothing',
            '  --json               machine-readable output',
            '  --list               print the current chain and exit',
            '  --help               this text',
            '',
            'Environment: HOTFIX_REMOTE_URLS, HOTFIX_IMPORT_FILES, HOTFIX_OFFICIAL,',
            '             HOTFIX_TIMEOUT_MS, HOTFIX_OVERWRITE',
        ].join('\n'),
    );
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        files: [],
        urls: [],
        official: [],
        version: null,
        dryRun: false,
        json: false,
        list: false,
        file: resolveDataPath('version.json'),
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => {
            const value = argv[++i];
            if (value === undefined) throw new Error(`${arg} needs a value`);
            return value;
        };
        switch (arg) {
            case '--from-file':
                options.files.push(next());
                break;
            case '--from-url':
                options.urls.push(next());
                break;
            case '--official':
                options.official.push(next());
                break;
            case '--version':
                options.version = next();
                break;
            case '--file':
                options.file = path.resolve(process.cwd(), next());
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--json':
                options.json = true;
                break;
            case '--list':
                options.list = true;
                break;
            case '--help':
            case '-h':
                usage();
                process.exit(0);
                break;
            default:
                throw new Error(`unknown option ${arg}`);
        }
    }

    if (options.files.length === 0 && options.urls.length === 0 && options.official.length === 0) {
        // No explicit source: behave like the server's warmup.
        options.files = splitList(process.env.HOTFIX_IMPORT_FILES);
        if (options.files.length === 0) options.files = DEFAULT_IMPORT_FILES;
        options.urls = splitList(process.env.HOTFIX_REMOTE_URLS);
    }
    return options;
}

function readChain(file: string): VersionChain {
    if (!fs.existsSync(file)) return {};
    return extractChain(JSON.parse(fs.readFileSync(file, 'utf-8')));
}

function writeChain(file: string, chain: VersionChain): void {
    fs.writeFileSync(file, JSON.stringify(chain, null, 2) + '\n', 'utf-8');
}

function intersect(chain: VersionChain, version: string | null): VersionChain {
    if (!version) return chain;
    return chain[version] ? { [version]: chain[version] } : {};
}

async function main(): Promise<number> {
    const options = parseArgs(process.argv.slice(2));
    const chain = readChain(options.file);
    const before = Object.keys(chain).length;
    const report: Record<string, any> = {
        file: options.file,
        versionsBefore: before,
        added: [] as string[],
        updated: [] as string[],
        kept: [] as string[],
        errors: [] as string[],
    };

    if (options.list) {
        if (options.json) {
            console.log(JSON.stringify(chain, null, 2));
        } else {
            for (const [key, entry] of Object.entries(chain)) {
                const state = isUsableEntry(entry) ? 'ok  ' : 'BAD ';
                console.log(`${state}${key}  ${entry.asset_bundle_url}`);
            }
            if (before === 0) console.log('(chain is empty)');
        }
        return 0;
    }

    const merge = (incoming: VersionChain, label: string) => {
        const stats = mergeChain(chain, intersect(incoming, options.version), {
            overwrite: process.env.HOTFIX_OVERWRITE === '1',
        });
        report.added.push(...stats.added);
        report.updated.push(...stats.updated);
        report.kept.push(...stats.kept);
        const total = stats.added.length + stats.updated.length;
        console.log(`  ${total > 0 ? 'merged' : 'no change'} ${label} (+${stats.added.length})`);
    };

    for (const file of options.files) {
        if (!fs.existsSync(file)) {
            report.errors.push(`missing file ${file}`);
            console.log(`  skip   ${file} (not found)`);
            continue;
        }
        merge(readChainFile(file), file);
    }

    for (const url of options.urls) {
        try {
            merge(await fetchRemoteChain(url), url);
        } catch (err: any) {
            report.errors.push(`${url}: ${err?.message ?? err}`);
            console.log(`  failed ${url} (${err?.message ?? err})`);
        }
    }

    for (const version of options.official) {
        const entry: VersionEntry | null = await fetchOfficialChain(version, '');
        if (!entry) {
            report.errors.push(`official: ${version} did not resolve`);
            console.log(`  failed official ${version} (no chain returned)`);
            continue;
        }
        console.log(`  official ${version} resolved`);
        merge({ [version]: entry }, `official ${version}`);
    }

    const after = Object.keys(chain).length;
    report.versionsAfter = after;

    if (!options.dryRun && after !== before) writeChain(options.file, chain);

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(
            `\nchain: ${before} -> ${after} version(s)` +
                `, added ${report.added.length}, updated ${report.updated.length}` +
                (options.dryRun ? ' (dry run, not written)' : ''),
        );
        if (report.errors.length > 0) {
            console.log(`sources with errors: ${report.errors.join('; ')}`);
        }
    }

    return report.errors.length > 0 && after === before ? 1 : 0;
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        console.error(`hotfix-cli failed: ${err?.message ?? err}`);
        process.exit(1);
    });
