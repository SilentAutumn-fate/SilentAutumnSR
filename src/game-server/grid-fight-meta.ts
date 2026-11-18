/**
 * Account-level Currency Wars meta progress shared by every connection of one
 * uid: weekly reward claims, both talent trees and the equipment track list.
 *
 * Each TCP connection owns a separate `PlayerState` restored from the same
 * save block (see `NetSession` constructor), so two connections of one account
 * would otherwise grant the same weekly reward twice, or overwrite each
 * other's freshly claimed ranks when one of them saves a stale copy.
 *
 * This module keeps one in-process ledger per uid and serialises every meta
 * mutation through a promise queue. Handlers mutate the ledger, mirror it into
 * their session state right before `saveDataInGame()`, so the persisted block
 * always carries the union of what every live connection has done.
 */

/** The slice of `PlayerState` this module reads and writes. */
export interface GridFightMetaCarrier {
    uid?: number;
    gridFightWeeklyRewardClaimed?: number[];
    gridFightPermanentTalents?: number[];
    gridFightSeasonTalents?: number[];
    gridFightEquipTrack?: number[];
}

/** Canonical per-uid meta state. */
export interface GridFightMeta {
    weeklyRewardClaimed: number[];
    permanentTalents: number[];
    seasonTalents: number[];
    equipTrack: number[];
}

/** What the helpers need from a session: its state, nothing else. */
export interface GridFightMetaSession {
    state?: GridFightMetaCarrier;
}

const ledgers = new Map<number, GridFightMeta>();
const queues = new Map<number, Promise<unknown>>();

function ledgerFor(uid: number): GridFightMeta {
    let meta = ledgers.get(uid);
    if (!meta) {
        meta = { weeklyRewardClaimed: [], permanentTalents: [], seasonTalents: [], equipTrack: [] };
        ledgers.set(uid, meta);
    }
    return meta;
}

function union(target: number[], source: number[] | undefined): number[] {
    if (!source?.length) return target;
    const merged = [...target];
    for (const value of source) if (!merged.includes(value)) merged.push(value);
    return merged;
}

/** Fold whatever a connection loaded from disk into the canonical ledger. */
function absorb(meta: GridFightMeta, state: GridFightMetaCarrier | undefined): void {
    if (!state) return;
    meta.weeklyRewardClaimed = union(meta.weeklyRewardClaimed, state.gridFightWeeklyRewardClaimed);
    meta.permanentTalents = union(meta.permanentTalents, state.gridFightPermanentTalents);
    meta.seasonTalents = union(meta.seasonTalents, state.gridFightSeasonTalents);
    if (!meta.equipTrack.length && state.gridFightEquipTrack?.length) {
        meta.equipTrack = [...state.gridFightEquipTrack];
    }
}

/** Copy the ledger into a session state so `toSave()` persists the union. */
export function writeMetaToState(session: GridFightMetaSession, meta: GridFightMeta): void {
    const state = session.state;
    if (!state) return;
    state.gridFightWeeklyRewardClaimed = [...meta.weeklyRewardClaimed];
    state.gridFightPermanentTalents = [...meta.permanentTalents];
    state.gridFightSeasonTalents = [...meta.seasonTalents];
    state.gridFightEquipTrack = [...meta.equipTrack];
}

/**
 * Refresh a session state from the ledger without mutating anything else.
 * Used by the non-meta save paths (run start, settlement) so a second
 * connection cannot persist a stale meta block over the newest one.
 */
export function syncMetaToState(session: GridFightMetaSession): void {
    const uid = session.state?.uid ?? 0;
    const meta = ledgerFor(uid);
    absorb(meta, session.state);
    writeMetaToState(session, meta);
}

/**
 * Run one meta mutation under the uid's queue. The callback mutates `meta`
 * and must call `writeMetaToState(session, meta)` before any save of its own;
 * the wrapper mirrors the final ledger again so later reads on this session
 * see the union even when the callback returned early (a rejected request).
 */
export function withGridFightMeta<T>(
    session: GridFightMetaSession,
    work: (meta: GridFightMeta) => Promise<T> | T,
): Promise<T> {
    const uid = session.state?.uid ?? 0;
    const meta = ledgerFor(uid);
    const previous = queues.get(uid) ?? Promise.resolve();
    const run = previous.then(async () => {
        absorb(meta, session.state);
        const result = await work(meta);
        writeMetaToState(session, meta);
        return result;
    });
    queues.set(uid, run.then(() => undefined, () => undefined));
    return run;
}

/** Test-only: drop every ledger and queue so cases start from a clean account. */
export function resetGridFightMetaForTests(): void {
    ledgers.clear();
    queues.clear();
}
