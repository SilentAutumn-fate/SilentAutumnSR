import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import type { HandlerEntry } from './types';
import { starrail } from '../../proto/starrail';
import { createLineup, lineupAt, savedSlots } from '../manager/lineup_mgr';
import { currentPathId } from '../manager/avatar_mgr';
import type { SavedLineup } from '../../data/loadDataInGame';

const E = starrail.Retcode;
function indexOf(req: any, session: NetSession): number {
    return req?.index ?? session.data.getDataInGame().currentLineupIndex;
}
function validIndex(index: number): boolean { return Number.isInteger(index) && index >= 0 && index < 100; }
function editable(req: any, session: NetSession): number {
    if (req?.extraLineupType || req?.isVirtual) return E.RET_LINEUP_TYPE_NOT_MATCH;
    if (session.battle || session.challengeId || session.challengePeakId || session.challengeTierceId) return E.RET_LINEUP_NOT_ALLOW_EDIT;
    return validIndex(indexOf(req, session)) ? 0 : E.RET_LINEUP_INVALID_INDEX;
}
function validateSlots(slots: Record<string, number>, session: NetSession): number {
    const entries = Object.entries(slots);
    if (!entries.length) return E.RET_LINEUP_IS_EMPTY;
    if (entries.some(([slot]) => !Number.isInteger(Number(slot)) || Number(slot) < 0 || Number(slot) > 3)) return E.RET_LINEUP_INVALID_MEMBER_POS;
    const owned = new Set(session.data.getDataJson().avatarIds().map((id) => currentPathId(session, id)));
    const ids = entries.map(([, id]) => currentPathId(session, id));
    if (entries.some(([, id]) => !Number.isInteger(id) || !owned.has(currentPathId(session, id)))) return E.RET_AVATAR_NOT_EXIST;
    if (new Set(ids).size !== ids.length) return E.RET_LINEUP_AVATAR_ALREADY_IN;
    return 0;
}
function teamAt(session: NetSession, index: number): SavedLineup {
    const team = session.data.getDataInGame().team(index);
    return { ...team, slots: Object.fromEntries(savedSlots(session, index)) };
}
async function commit(session: NetSession, index: number, team: SavedLineup): Promise<void> {
    if (!team.slots[team.leaderSlot]) team.leaderSlot = Number(Object.keys(team.slots).sort((a,b)=>Number(a)-Number(b))[0]);
    session.data.getDataInGame().setTeam(index, team);
    await session.data.saveDataInGame();
    if (index === session.data.getDataInGame().currentLineupIndex) createLineup(session);
    await session.sendMessage(CmdID.CmdSyncLineupNotify, { lineup: lineupAt(session, index) });
}
export async function onGetCurLineupDataCsReq(_req: unknown, session: NetSession): Promise<void> {
    await session.sendRsp(CmdID.CmdGetCurLineupDataScRsp, { retcode: 0, lineup: createLineup(session) });
}
export async function onGetAllLineupDataCsReq(_req: unknown, session: NetSession): Promise<void> {
    const saved = session.data.getDataInGame();
    const indices = [...new Set([saved.currentLineupIndex, ...Object.keys(saved.lineupTeams).map(Number)])].sort((a,b)=>a-b);
    createLineup(session);
    await session.sendRsp(CmdID.CmdGetAllLineupDataScRsp, { retcode: 0, curIndex: saved.currentLineupIndex,
        lineupList: indices.map((index) => lineupAt(session, index)) });
}
export async function onReplaceLineupCsReq(req: any, session: NetSession): Promise<void> {
    let retcode = editable(req, session);
    const index = indexOf(req, session), list: any[] = req?.lineupSlotList ?? [];
    const slots: Record<string, number> = {};
    for (const entry of list) {
        const slot = entry?.slot;
        if (!Number.isInteger(slot) || slot < 0 || slot > 3 || Object.prototype.hasOwnProperty.call(slots, slot)) retcode ||= E.RET_LINEUP_INVALID_MEMBER_POS;
        slots[slot] = entry?.id;
    }
    retcode ||= validateSlots(slots, session);
    const team = { ...session.data.getDataInGame().team(index), slots };
    if (req?.leaderSlot !== undefined) {
        if (!Number.isInteger(req.leaderSlot) || !slots[req.leaderSlot]) retcode ||= E.RET_LINEUP_NOT_VALID_LEADER;
        else team.leaderSlot = req.leaderSlot;
    }
    if (!retcode) await commit(session, index, team);
    await session.sendRsp(CmdID.CmdReplaceLineupScRsp, { retcode });
}
export async function onChangeLineupLeaderCsReq(req: any, session: NetSession): Promise<void> {
    const saved = session.data.getDataInGame(), index = saved.currentLineupIndex, team = teamAt(session, index);
    let retcode = editable({}, session);
    if (!Number.isInteger(req?.slot) || !team.slots[req.slot]) retcode ||= E.RET_LINEUP_NOT_VALID_LEADER;
    if (!retcode) { team.leaderSlot = req.slot; await commit(session, index, team); }
    await session.sendRsp(CmdID.CmdChangeLineupLeaderScRsp, { slot: req?.slot ?? 0, retcode });
}
export async function onSetLineupNameCsReq(req: any, session: NetSession): Promise<void> {
    const index = indexOf(req, session), saved = session.data.getDataInGame();
    let retcode = editable(req, session);
    const name = typeof req?.name === 'string' ? req.name.trim() : '';
    if (!name || [...name].length > 20 || /[\u0000-\u001f\u007f]/.test(name) || Object.entries(saved.lineupTeams).some(([i, team]) => Number(i) !== index && team.name === name)) retcode ||= E.RET_LINEUP_NAME_FORMAT_ERROR;
    const team = teamAt(session, index);
    if (!Object.keys(team.slots).length) retcode ||= E.RET_LINEUP_NOT_EXIST;
    if (!retcode) await commit(session, index, { ...team, name });
    await session.sendRsp(CmdID.CmdSetLineupNameScRsp, { retcode, index, name });
}
export async function onJoinLineupCsReq(req: any, session: NetSession): Promise<void> {
    const index = indexOf(req, session), team = teamAt(session, index);
    let retcode = editable(req, session);
    if (req?.avatarType !== undefined && req.avatarType !== 3) retcode ||= E.RET_LINEUP_AVATAR_TYPE_INVALID;
    if (!Number.isInteger(req?.slot) || req.slot < 0 || req.slot > 3) retcode ||= E.RET_LINEUP_INVALID_MEMBER_POS;
    team.slots[req?.slot] = req?.baseAvatarId;
    retcode ||= validateSlots(team.slots, session);
    if (!retcode) await commit(session, index, team);
    await session.sendRsp(CmdID.CmdJoinLineupScRsp, { retcode });
}
export async function onQuitLineupCsReq(req: any, session: NetSession): Promise<void> {
    const index = indexOf(req, session), team = teamAt(session, index);
    let retcode = editable(req, session);
    const entry = Object.entries(team.slots).find(([, id]) => currentPathId(session, id) === currentPathId(session, req?.baseAvatarId));
    if (!entry) retcode ||= E.RET_LINEUP_AVATAR_NOT_EXIST;
    else delete team.slots[entry[0]];
    retcode ||= validateSlots(team.slots, session);
    if (!retcode) await commit(session, index, team);
    await session.sendRsp(CmdID.CmdQuitLineupScRsp, { retcode });
}
export async function onSwitchLineupIndexCsReq(req: any, session: NetSession): Promise<void> {
    const index = indexOf(req, session);
    let retcode = editable(req, session);
    const team = teamAt(session, index);
    retcode ||= validateSlots(team.slots, session);
    if (!retcode) {
        session.data.getDataInGame().switchTeam(index);
        await session.data.saveDataInGame();
        await session.sendMessage(CmdID.CmdSyncLineupNotify, { lineup: createLineup(session) });
    }
    await session.sendRsp(CmdID.CmdSwitchLineupIndexScRsp, { retcode, index });
}
export async function onSwapLineupCsReq(req: any, session: NetSession): Promise<void> {
    const index = indexOf(req, session), team = teamAt(session, index);
    let retcode = editable(req, session);
    // Field mapping comes from the client send path NetworkManager.DBJGNNJPEMF
    // (RVA 0x1B410050 -> cmd 0x2D6/726): tag3/tag7 carry the two member slots and
    // tag11 carries the lineup index, matching the 4.5.54 names ENBIBCPPLDC/MPIEGFCNBEN.
    const from = req?.ENBIBCPPLDC, to = req?.MPIEGFCNBEN;
    if (!Number.isInteger(from) || !Number.isInteger(to)) retcode ||= E.RET_LINEUP_INVALID_MEMBER_POS;
    else if (from === to) retcode ||= E.RET_LINEUP_SWAP_SAME_SLOT;
    else if (!(from in team.slots) || !(to in team.slots)) retcode ||= E.RET_LINEUP_SWAP_NOT_EXIST;
    else [team.slots[from], team.slots[to]] = [team.slots[to], team.slots[from]];
    if (!retcode) await commit(session, index, team);
    await session.sendRsp(CmdID.CmdSwapLineupScRsp, { retcode });
}
export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetCurLineupDataCsReq, action: onGetCurLineupDataCsReq },
    { cmdId: CmdID.CmdGetAllLineupDataCsReq, action: onGetAllLineupDataCsReq },
    { cmdId: CmdID.CmdChangeLineupLeaderCsReq, action: onChangeLineupLeaderCsReq },
    { cmdId: CmdID.CmdReplaceLineupCsReq, action: onReplaceLineupCsReq },
    { cmdId: CmdID.CmdSetLineupNameCsReq, action: onSetLineupNameCsReq },
    { cmdId: CmdID.CmdJoinLineupCsReq, action: onJoinLineupCsReq },
    { cmdId: CmdID.CmdQuitLineupCsReq, action: onQuitLineupCsReq },
    { cmdId: CmdID.CmdSwitchLineupIndexCsReq, action: onSwitchLineupIndexCsReq },
    { cmdId: CmdID.CmdSwapLineupCsReq, action: onSwapLineupCsReq },
];
