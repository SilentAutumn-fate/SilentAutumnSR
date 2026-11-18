import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DATA_DIR } from '../../common/constants';
import { starrail } from '../../proto/starrail';

/**
 * On-disk form of one currency-war run.
 *
 * The run itself lives in `MPIMAEMCEFH` (`GridFightGameInfo` list) and is what
 * the client gets back from `GridFightGetData` / `GridFightResumeGamePlay`.
 * Everything else in this record is server bookkeeping the client cannot
 * rebuild: the next ids to hand out and the short-lived phase flags.
 */
export interface GridFightRunRecord {
    run: starrail.MPIMAEMCEFH;
    nextRunId: number;
    nextRoleId: number;
    nextBattleId: number;
    bonfireHealed: boolean;
    awaitingPrepare: boolean;
    savedAt: number;
}

interface StoreFile {
    version: number;
    runs: Record<string, GridFightRunRecord>;
}

const STORE_VERSION = 1;
const STORE_NAME = 'grid-fight-runs.json';

/** Location of the run store; `dir` is injectable so tests stay off the real data dir. */
export function storeFile(dir: string = DATA_DIR): string {
    return path.join(dir, STORE_NAME);
}

function emptyStore(): StoreFile {
    return { version: STORE_VERSION, runs: {} };
}

function readStore(dir: string): StoreFile {
    try {
        const parsed = JSON.parse(fs.readFileSync(storeFile(dir), 'utf8')) as Partial<StoreFile>;
        if (!parsed || typeof parsed !== 'object' || !parsed.runs || typeof parsed.runs !== 'object') {
            return emptyStore();
        }
        return { version: STORE_VERSION, runs: parsed.runs as Record<string, GridFightRunRecord> };
    } catch {
        // Missing or unreadable file: a fresh install simply has no runs.
        return emptyStore();
    }
}

function writeStore(dir: string, store: StoreFile): void {
    // A partially written file would strand every saved run, so the write goes
    // through a sibling temp file and an atomic rename.
    fs.mkdirSync(dir, { recursive: true });
    const target = storeFile(dir);
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(store));
    fs.renameSync(temp, target);
}

/** Saved run for one player uid, or undefined when none was persisted. */
export function loadRun(uid: string | number, dir: string = DATA_DIR): GridFightRunRecord | undefined {
    const record = readStore(dir).runs[String(uid)];
    if (!record || typeof record !== 'object' || !record.run) return undefined;
    return record;
}

/** Persist a run, replacing any earlier save for the same uid. */
export function saveRun(uid: string | number, record: GridFightRunRecord, dir: string = DATA_DIR): void {
    const store = readStore(dir);
    store.runs[String(uid)] = { ...record, savedAt: Math.floor(Date.now() / 1000) };
    writeStore(dir, store);
}

/** Drop the saved run for a uid (settled, abandoned, or never started). */
export function removeRun(uid: string | number, dir: string = DATA_DIR): void {
    const store = readStore(dir);
    const key = String(uid);
    if (!(key in store.runs)) return;
    delete store.runs[key];
    writeStore(dir, store);
}

/** Test helper: a throwaway directory that never touches the shipped data files. */
export function temporaryStoreDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sasr-grid-fight-'));
}
