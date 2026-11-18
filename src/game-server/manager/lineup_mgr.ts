import { SERVER_NAME } from '../../common/constants';
import type { NetSession } from '../NetSession';
import { currentPathId } from './avatar_mgr';

export function savedSlots(session: NetSession, index = session.data.getDataInGame().currentLineupIndex ?? 0): [number, number][] {
    const saved = session.data.getDataInGame();
    const entries = saved.lineupEntries(index);
    // Preserve the legacy fresh-account fallback only for the active team.
    return entries.length ? entries : index === (saved.currentLineupIndex ?? 0)
        ? session.data.getDataJson().avatarIds().slice(0, 4).map((id, slot) => [slot, id]) : [];
}

export function lineupAt(session: NetSession, index: number): any {
    const saved = session.data.getDataInGame(), team = saved.team?.(index) ?? { name: '', leaderSlot: 0 };
    const entries = savedSlots(session, index).map(([slot, id]): [number, number] => [slot, currentPathId(session, id)]);
    return buildLineup({ avatarIds: entries.map(([, id]) => id), slots: entries.map(([slot]) => slot),
        index, name: team.name || SERVER_NAME,
        leaderSlot: entries.some(([slot]) => slot === team.leaderSlot) ? team.leaderSlot : entries[0]?.[0] ?? 0 });
}

export function createLineup(session: NetSession): any {
    const lineup = lineupAt(session, session.data.getDataInGame().currentLineupIndex ?? 0);
    const ids = Array(4).fill(0);
    for (const avatar of lineup.avatarList) ids[avatar.slot] = avatar.id;
    // Legacy battle/scene users read slot zero as the active roster.
    session.lineups[lineup.index] = [...ids];
    session.lineups[0] = ids;
    return lineup;
}

export function hasExtendedLineupMp(avatarIds: number[]): boolean {
    return avatarIds.some((id) => id === 1408 || id === 1510);
}

export function defaultLineupAvatar(id: number, slot: number) {
    return { id, slot, satiety: 0, hp: 10000, spBar: { curSp: 10000, maxSp: 10000 }, avatarType: 3 };
}

export function buildLineup(opts: {
    avatarIds: number[]; extraLineupType?: number; name?: string; mp?: number;
    maxMp?: number; leaderSlot?: number; index?: number; slots?: number[];
}): any {
    const ids = Array.isArray(opts.avatarIds) ? opts.avatarIds : [];
    const extended = hasExtendedLineupMp(ids);
    const mp = extended ? 7 : opts.mp ?? opts.maxMp ?? 5;
    return { index: opts.index ?? 0, name: opts.name ?? (opts.extraLineupType === undefined ? SERVER_NAME : ''),
        extraLineupType: opts.extraLineupType ?? 0, mp, maxMp: extended ? 7 : opts.maxMp ?? mp,
        leaderSlot: opts.leaderSlot ?? 0,
        avatarList: ids.flatMap((id, index) => id ? [defaultLineupAvatar(id, opts.slots?.[index] ?? index)] : []) };
}

export function selectedAvatarIds(session: NetSession, count: number): number[] {
    const source = Array(4).fill(0);
    if ((session.challengeId || session.challengePeakId || session.challengeTierceId) && session.lineups[0]?.length) {
        session.lineups[0].slice(0, 4).forEach((id, slot) => { source[slot] = currentPathId(session, id); });
    } else for (const [slot, id] of savedSlots(session)) source[slot] = currentPathId(session, id);
    return Array.from({ length: Math.max(0, Math.floor(Number(count)) || 0) }, (_, slot) => source[slot] ?? 0);
}
