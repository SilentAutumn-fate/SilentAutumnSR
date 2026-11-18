import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { HandlerEntry } from './types';
import { buildScene } from '../manager/scene_mgr';
import { createLineup, lineupAvatarIds } from './scene';
import { pickTournRoom, pickTournRoomByType, TournRoom } from '../../data/rogue-tourn-rooms';
import { defaultTournArea, findTournArea, tournLayersForArea } from '../../data/rogue-tourn-areas';
import {
    advanceTournRun,
    assignCurrentRoom,
    createTournRun,
    currentLayer,
    currentRoomSlot,
    nextRoomType,
    TOURN_LAYER_PLAN,
    TOURN_LAYER_STATUS,
    TournRun,
} from './rogue-tourn-run';
import { buildPermanentTalentInfo, buildTournInfo } from './rogue-tourn-info';

/**
 * Divergent Universe (差分宇宙) entry + room-progression handlers.
 *
 * Scope: the client can open the mode, receive a scene it can load, and walk
 * through the reference server's layer/room plan. Blessings, formulas, combat
 * and settle rewards are NOT implemented — those requests keep falling back to
 * the generic empty reply instead of inventing data.
 *
 * Data provenance:
 *   - run plan (layer ids, room counts, room-type policy): ported from the
 *     2.7.51 reference server (`db_rogue_tourn.go`);
 *   - room table: `dev/tools/rogue-tourn/build-room-table.js`, external 2.7.51
 *     export cross-checked against this client's MapEntrance table;
 *   - scene: built by `scene_mgr.buildScene` from the room's MapEntrance, i.e.
 *     the plane/floor/saved-values come from the 4.6.54 client config;
 *   - `GameModeType.TournRogue` is 17 in the 4.6.54 client dump.
 *
 * Unverified: the client's acceptance of the run payloads. The `room_id` field
 * of the room-list entry survives unobfuscated in our proto (field 12), so it is
 * used directly; the room/layer index fields have no verified number and are
 * intentionally left unset.
 */

/** `GameModeType.TournRogue` — 17 in the 4.6.54 client dump. */
const TOURN_GAME_MODE_TYPE = 17;

/** First room type of a run (the reference server assigns a battle room). */
const FIRST_ROOM_TYPE = 3;

function entranceGate(session: NetSession): (entranceId: number) => boolean {
    return (entranceId) => Boolean(session.config.getEntrance(entranceId));
}

/** Pick a room the client can actually render: its MapEntrance must be known. */
function chooseRoom(session: NetSession): TournRoom | null {
    return pickTournRoom(session.config.tournRooms, entranceGate(session));
}

function chooseRoomOfType(session: NetSession, roomType: number, run?: TournRun): TournRoom | null {
    const exclude = run ? usedRoomIds(run) : new Set<number>();
    return pickTournRoomByType(session.config.tournRooms, roomType, entranceGate(session), exclude);
}

/** Room ids already assigned to a slot in this run (no room is entered twice). */
function usedRoomIds(run: TournRun): Set<number> {
    const used = new Set<number>();
    for (const layer of run.layers) {
        for (const room of layer.rooms) {
            if (room.roomId) used.add(room.roomId);
        }
    }
    return used;
}

/** Current room, when the run already has one assigned. */
function currentRoom(session: NetSession): TournRoom | null {
    const run = session.tournRun?.run;
    if (!run) return null;
    const roomId = currentRoomSlot(run).roomId;
    if (!roomId) return null;
    return session.config.tournRooms?.rooms.find((room) => room.roomId === roomId) ?? null;
}

/**
 * Build the scene for one room and record it as the run's current room.
 * `assign` is false when re-sending the current room (Enter/reconnect).
 */
function buildTournScene(session: NetSession, room: TournRoom | null, run: TournRun, assign: boolean): any | null {
    if (!room) return null;
    const avatarIds = lineupAvatarIds(session);
    const built = buildScene({
        entryId: room.mapEntrance,
        avatarIds,
        gameModeType: TOURN_GAME_MODE_TYPE,
    });
    if (assign) assignCurrentRoom(run, room.roomId);
    session.scene = {
        planeId: built.planeId,
        floorId: built.floorId,
        entryId: room.mapEntrance,
        leaderEntityId: built.leaderEntityId,
        gameModeType: TOURN_GAME_MODE_TYPE,
        entityIds: built.entityIds,
    };
    session.tournRun = { run, roomId: room.roomId, entryId: room.mapEntrance, scene: built.sceneInfo };
    return {
        scene: built.sceneInfo,
        lineup: createLineup(avatarIds),
        // FHEGNOPNICH: the map-rotation block. Only the two flags carried by the
        // room table are set; the rotate geometry stays default (not known).
        JNKLNLKHGBB: { MJIPOJPBKNB: room.isRotate, JPPMEKJGJFD: room.rotateNum },
    };
}

/**
 * Create the run and enter its first room.
 *
 * The layer plan comes from the official area table (`rogue-tourn-areas.json`);
 * the reference plan is only used when the client asks for an unknown area and
 * no area table is loaded at all.
 */
function startRun(session: NetSession, areaId: number): any | null {
    const table = session.config.tournAreas;
    const area = findTournArea(table, areaId) ?? defaultTournArea(table);
    const plan = area ? tournLayersForArea(table, area.areaId) : null;
    const run = createTournRun(area?.areaId ?? areaId, plan ?? TOURN_LAYER_PLAN);
    const room = chooseRoomOfType(session, FIRST_ROOM_TYPE, run) ?? chooseRoom(session);
    return buildTournScene(session, room, run, true);
}

/**
 * Level-info notification sent before `EnterRoomScRsp`.
 *
 * Only fields with verified meaning are written: `status` (enum order matches
 * the 2.7 reference), `BJHMFOAGMBF` (current level index) and, inside the level
 * and room entries, `status` plus the unobfuscated `room_id` field. protobufjs
 * camelCases that field on the generated object, so it is `roomId` here.
 */
function levelInfoNotify(run: TournRun, room: TournRoom | null): Record<string, any> {
    const layer = currentLayer(run);
    return {
        status: TOURN_LAYER_STATUS.processing,
        BJHMFOAGMBF: run.curLayerIndex,
        NNFFPJOLDHK: [
            {
                status: layer.status,
                JEHEILKKDEF: room ? [{ status: 2, roomId: room.roomId }] : [],
            },
        ],
    };
}

/**
 * Query: report the area roster, the handbook pools and a saturated progress
 * profile, so the lobby opens with every mode/difficulty selectable and the
 * handbook fully unlocked.
 */
export async function onRogueTournQueryCsReq(
    _req: starrail.RogueTournQueryCsReq,
    session: NetSession,
): Promise<void> {
    const info = buildTournInfo({
        areas: session.config.tournAreas,
        handbook: session.config.tournHandbook,
        talents: session.config.tournTalents,
    });
    await session.sendRsp(CmdID.CmdRogueTournQueryScRsp, { retcode: 0, LFLCDNGALME: info });
}

/** EnterRogueCocoonScene: enter the run's first room. */
export async function onRogueTournEnterRogueCocoonSceneCsReq(
    req: starrail.RogueTournEnterRogueCocoonSceneCsReq,
    session: NetSession,
): Promise<void> {
    // The four ids are echoed back by GetCurRogueCocoonInfo; they are the
    // client's own selection, stored verbatim instead of being interpreted.
    // protobufjs keeps the generated bundle in camelCase, so the wire field
    // `difficulty_level` (12) is `difficultyLevel` on the decoded object.
    session.tournCocoon = {
        areaId: req?.DCNNFJLABPL ?? 0,
        groupId: req?.HECCOBFBJFI ?? 0,
        roomId: req?.NBLMAGLGCGN ?? 0,
        difficultyLevel: req?.difficultyLevel ?? 0,
    };
    const sceneInfo = startRun(session, session.tournCocoon.areaId);
    await session.sendRsp(CmdID.CmdRogueTournEnterRogueCocoonSceneScRsp, {
        retcode: sceneInfo ? 0 : 2,
        IDCMACCPCBH: sceneInfo ?? undefined,
    });
}

/** GetCurRogueCocoonInfo: echo the selection stored when the scene was entered. */
export async function onRogueTournGetCurRogueCocoonInfoCsReq(
    _req: starrail.RogueTournGetCurRogueCocoonInfoCsReq,
    session: NetSession,
): Promise<void> {
    const cocoon = session.tournCocoon ?? { areaId: 0, groupId: 0, roomId: 0, difficultyLevel: 0 };
    await session.sendRsp(CmdID.CmdRogueTournGetCurRogueCocoonInfoScRsp, {
        retcode: 0,
        DCNNFJLABPL: cocoon.areaId,
        HECCOBFBJFI: cocoon.groupId,
        NBLMAGLGCGN: cocoon.roomId,
        difficultyLevel: cocoon.difficultyLevel,
    });
}

/** LeaveRogueCocoonScene: clear the bookkeeping, nothing to persist yet. */
export async function onRogueTournLeaveRogueCocoonSceneCsReq(
    _req: starrail.RogueTournLeaveRogueCocoonSceneCsReq,
    session: NetSession,
): Promise<void> {
    session.tournRun = null;
    await session.sendRsp(CmdID.CmdRogueTournLeaveRogueCocoonSceneScRsp, { retcode: 0 });
}

/** Start: create the run and enter its first room. */
export async function onRogueTournStartCsReq(
    req: starrail.RogueTournStartCsReq,
    session: NetSession,
): Promise<void> {
    const sceneInfo = startRun(session, req?.areaId ?? 0);
    await session.sendRsp(CmdID.CmdRogueTournStartScRsp, {
        retcode: sceneInfo ? 0 : 2,
        IDCMACCPCBH: sceneInfo ?? undefined,
    });
}

/** Enter: re-send the current room's scene (client reconnect / re-entry). */
export async function onRogueTournEnterCsReq(
    _req: starrail.RogueTournEnterCsReq,
    session: NetSession,
): Promise<void> {
    const run = session.tournRun?.run ?? createTournRun(0);
    const room = (session.tournRun ? currentRoom(session) : null) ??
        chooseRoomOfType(session, FIRST_ROOM_TYPE, run) ?? chooseRoom(session);
    const sceneInfo = buildTournScene(session, room, run, true);
    await session.sendRsp(CmdID.CmdRogueTournEnterScRsp, {
        retcode: sceneInfo ? 0 : 2,
        IDCMACCPCBH: sceneInfo ?? undefined,
    });
}

/**
 * EnterRoom: finish the current room, advance the plan and place the player in
 * a room of the requested type.
 *
 * The request carries two uint32s (`KHBLMAOPLLN` = 4, `JOJCPKNIJOH` = 15); which
 * one is `next_room_type` is not verified on this version, so a value in the
 * room-type range 1..12 is accepted from either field and the run plan is used
 * when neither looks like a type.
 */
export async function onRogueTournEnterRoomCsReq(
    req: starrail.RogueTournEnterRoomCsReq,
    session: NetSession,
): Promise<void> {
    const run = session.tournRun?.run ?? createTournRun(0);
    if (!session.tournRun) {
        // No run yet (e.g. re-entry): open one instead of failing.
        const sceneInfo = buildTournScene(session, chooseRoomOfType(session, FIRST_ROOM_TYPE, run) ?? chooseRoom(session), run, true);
        await session.sendRsp(CmdID.CmdRogueTournEnterRoomScRsp, {
            retcode: sceneInfo ? 0 : 2,
            IDCMACCPCBH: sceneInfo ?? undefined,
        });
        return;
    }
    const requested = [req?.KHBLMAOPLLN, req?.JOJCPKNIJOH]
        .find((value) => typeof value === 'number' && value >= 1 && value <= 12);
    const roomType = requested ?? nextRoomType(run);
    const advance = advanceTournRun(run);
    const room = advance.finished
        ? currentRoom(session)
        : chooseRoomOfType(session, roomType, run) ?? chooseRoom(session);
    const sceneInfo = buildTournScene(session, room, run, !advance.finished);
    await session.sendRsp(CmdID.CmdRogueTournLevelInfoUpdateScNotify, levelInfoNotify(run, room));
    await session.sendRsp(CmdID.CmdRogueTournEnterRoomScRsp, {
        retcode: sceneInfo ? 0 : 2,
        IDCMACCPCBH: sceneInfo ?? undefined,
    });
}

/** Settle: drop the run after the last room. */
export async function onRogueTournSettleCsReq(
    _req: starrail.RogueTournSettleCsReq,
    session: NetSession,
): Promise<void> {
    session.tournRun = null;
    await session.sendRsp(CmdID.CmdRogueTournSettleScRsp, { retcode: 0 });
}

/** Leave: drop the run, keep the player where the scene client is. */
export async function onRogueTournLeaveCsReq(
    _req: starrail.RogueTournLeaveCsReq,
    session: NetSession,
): Promise<void> {
    session.tournRun = null;
    await session.sendRsp(CmdID.CmdRogueTournLeaveScRsp, { retcode: 0 });
}

/**
 * PermanentTalentInfo: the 38-node permanent talent tree, reported fully
 * activated.
 *
 * The client asks for this as soon as the entrance page loads (capture:
 * `RogueTournGetPermanentTalentInfoCsReq` 6063, sent twice per session next to
 * Query 6072). Leaving it unanswered made the Lua talent tab index a `nil`
 * `StateData`, which surfaced as `HandbookRogueGotoBtnBehaviour` Lua errors and
 * the dead guidance-page entry.
 */
export async function onRogueTournGetPermanentTalentInfoCsReq(
    _req: starrail.RogueTournGetPermanentTalentInfoCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdRogueTournGetPermanentTalentInfoScRsp, {
        retcode: 0,
        DPABCOHLPLH: buildPermanentTalentInfo({ talents: session.config.tournTalents }),
    });
}

/**
 * EnablePermanentTalent: every node is already reported activated, so the
 * request is acknowledged by echoing the full tree. Sentinel nodes the client
 * cannot see are ignored instead of failing the whole tab.
 */
export async function onRogueTournEnablePermanentTalentCsReq(
    _req: starrail.RogueTournEnablePermanentTalentCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdRogueTournEnablePermanentTalentScRsp, {
        retcode: 0,
        DPABCOHLPLH: buildPermanentTalentInfo({ talents: session.config.tournTalents }),
    });
}

/** ResetPermanentTalent: no state is stored, so reply with the same maxed tree. */
export async function onRogueTournResetPermanentTalentCsReq(
    _req: starrail.RogueTournResetPermanentTalentCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdRogueTournResetPermanentTalentScRsp, {
        retcode: 0,
        DPABCOHLPLH: buildPermanentTalentInfo({ talents: session.config.tournTalents }),
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdRogueTournQueryCsReq, action: onRogueTournQueryCsReq },
    { cmdId: CmdID.CmdRogueTournGetCurRogueCocoonInfoCsReq, action: onRogueTournGetCurRogueCocoonInfoCsReq },
    { cmdId: CmdID.CmdRogueTournEnterRogueCocoonSceneCsReq, action: onRogueTournEnterRogueCocoonSceneCsReq },
    { cmdId: CmdID.CmdRogueTournLeaveRogueCocoonSceneCsReq, action: onRogueTournLeaveRogueCocoonSceneCsReq },
    { cmdId: CmdID.CmdRogueTournStartCsReq, action: onRogueTournStartCsReq },
    { cmdId: CmdID.CmdRogueTournEnterCsReq, action: onRogueTournEnterCsReq },
    { cmdId: CmdID.CmdRogueTournEnterRoomCsReq, action: onRogueTournEnterRoomCsReq },
    { cmdId: CmdID.CmdRogueTournSettleCsReq, action: onRogueTournSettleCsReq },
    { cmdId: CmdID.CmdRogueTournLeaveCsReq, action: onRogueTournLeaveCsReq },
    {
        cmdId: CmdID.CmdRogueTournGetPermanentTalentInfoCsReq,
        action: onRogueTournGetPermanentTalentInfoCsReq,
    },
    {
        cmdId: CmdID.CmdRogueTournEnablePermanentTalentCsReq,
        action: onRogueTournEnablePermanentTalentCsReq,
    },
    {
        cmdId: CmdID.CmdRogueTournResetPermanentTalentCsReq,
        action: onRogueTournResetPermanentTalentCsReq,
    },
];
