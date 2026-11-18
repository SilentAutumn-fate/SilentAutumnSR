import { CmdID } from '../../proto/cmdId';
import { starrail } from '../../proto/starrail';
import type { NetSession } from '../NetSession';
import type { HandlerEntry } from './types';
import { createLineup as createSavedLineup, defaultLineupAvatar, hasExtendedLineupMp } from '../manager/lineup_mgr';
import { PositionJson, SceneJson } from '../../data/loadDataInGame';
import { DEFAULT_ENTRY_ID, SERVER_NAME } from '../../common/constants';
import { gridFightProfile } from '../../data/grid-fight-profile';
import { completedPropState, propStateKey, applySavedPropStates } from '../manager/map-exploration';
import {
    BuiltScene,
    LIGHTEN_SECTION_RANGES,
    buildScene,
    collectEntityIds,
    collectMonsterEvents,
    createScene,
    getAnchorMotion,
    leaderMotion,
    setLeaderMotion,
} from '../manager/scene_mgr';

/**
 * Scene service — port of pearl-sr's `services/scene.zig`
 * (see `docs/spec-scene-config.md` Part C).
 *
 * Pearl-sr has no persistence at all: it answers `GetCurSceneInfo` with one
 * hard-coded scene and forgets every position it is told. This server keeps a
 * save file (`src/data/data-in-game.json`), so four handlers deviate and are
 * marked `// DEVIATION:` below. Everything else — including the field values
 * and the order of notifies vs responses — matches the Zig exactly.
 *
 * pearl-sr's `onActivateFarmElement` is deliberately NOT ported: it is not in
 * `handlers.zig` (unreachable) and does not even compile there (the message
 * names it uses do not exist). See spec C.18/C.19.
 */

/** `onGetNpcTakenReward`'s literal event list — order is significant. */
const NPC_TALK_EVENT_LIST = [2136, 2134];

/** The one scene request whose "handled" debug line pearl-sr suppresses. */
function sceneDebug(message: string): void {
    // pearl-sr's log.debug is compiled out of release builds; the POSITION line
    // fires on every movement packet, so gate it behind an env flag.
    if (process.env.SASR_SCENE_DEBUG === '1') console.log(message);
}

// ---- shared helpers ---------------------------------------------------------

/** Every player-window entity: 100000 < id < 1000000, or the 0 "unknown" id. */
function isPlayerWindowEntity(entityId: number): boolean {
    return (entityId > 99999 && entityId < 1000000) || entityId === 0;
}

/** The persisted lineup, as the actor list handed to the scene builder. */
export function lineupAvatarIds(session: NetSession): number[] {
    const lineup = createSavedLineup(session);
    // Scene builders select the first actor as leader; LineupInfo keeps its
    // original slots and is constructed separately from this actor ordering.
    return lineup.avatarList
        .sort((a, b) => Number(b.slot === lineup.leaderSlot) - Number(a.slot === lineup.leaderSlot) || a.slot - b.slot)
        .map((avatar) => avatar.id);
}

/**
 * Mirror of `LineupManager.createLineup()`.
 *
 * DEVIATION: pearl-sr builds this from the hard-coded four avatars of
 * `config.json`; this server has no such file and already persists the player's
 * lineup in data-in-game.json, so the persisted lineup is used instead. The
 * per-avatar values (hp 10000, sp 10000/10000, satiety 0, formal type) and the
 * mp rule (5, or 7 when the lineup contains 1408/1510) are unchanged.
 */
export function createLineup(avatarIds: number[]): any {
    const mp = hasExtendedLineupMp(avatarIds) ? 7 : 5;
    const avatarList: ReturnType<typeof defaultLineupAvatar>[] = [];
    avatarIds.forEach((id, slot) => avatarList.push(defaultLineupAvatar(id, slot)));
    return {
        name: SERVER_NAME,
        mp,
        maxMp: mp,
        avatarList,
    };
}

/** Keep `session.scene` in step with the SceneInfo we just handed the client. */
function rememberScene(session: NetSession, built: BuiltScene): void {
    session.scene = {
        planeId: built.planeId,
        floorId: built.floorId,
        entryId: built.sceneInfo.entryId,
        leaderEntityId: built.leaderEntityId,
        gameModeType: built.sceneInfo.gameModeType,
        entityIds: built.entityIds,
        monsterEvents: collectMonsterEvents(built.sceneInfo),
    };
}

// ---- position persistence (module-private per-session scratch) --------------

/** At most one data-in-game.json write per second. */
const POSITION_SAVE_INTERVAL_MS = 1000;
/**
 * A movement smaller than this (10 units, summed over all axes) is ignored:
 * world coordinates are in the tens of thousands, so a couple of units is the
 * client's float jitter, not the player going anywhere.
 */
const POSITION_EPSILON = 10;

interface PositionScratch {
    lastSavedMs: number;
    lastSaved: PositionJson;
    /** Latest position seen, whether or not it reached the disk yet. */
    latest: PositionJson;
}

/**
 * DEVIATION: pearl-sr stores nothing — the client is authoritative and the
 * server-side position does not exist. We track the latest position per
 * connection here (NetSession has no position field, and it is shared) and
 * persist it, throttled, so a reconnect resumes where the player left off.
 */
const positionScratch = new WeakMap<NetSession, PositionScratch>();

function scratchOf(session: NetSession): PositionScratch {
    let scratch = positionScratch.get(session);
    if (!scratch) {
        scratch = {
            lastSavedMs: 0,
            lastSaved: new PositionJson(0, 0, 0, 0),
            latest: new PositionJson(0, 0, 0, 0),
        };
        positionScratch.set(session, scratch);
    }
    return scratch;
}

function positionDelta(a: PositionJson, b: PositionJson): number {
    return (
        Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) + Math.abs(a.rotY - b.rotY)
    );
}

/**
 * Record a position. Movement packets are written through at most once per
 * second; an explicit teleport (`force`) is written immediately.
 */
async function trackPosition(
    session: NetSession,
    position: PositionJson,
    force = false,
): Promise<void> {
    const scratch = scratchOf(session);
    const dataInGame = session.data.getDataInGame();
    scratch.latest = position;
    dataInGame.position = position;

    if (!force) {
        const now = Date.now();
        if (now - scratch.lastSavedMs < POSITION_SAVE_INTERVAL_MS) return;
        if (positionDelta(position, scratch.lastSaved) < POSITION_EPSILON) return;
    }

    scratch.lastSaved = position;
    scratch.lastSavedMs = Date.now();
    await session.data.saveDataInGame();
}

function positionOfMotion(motion: any): PositionJson | null {
    if (!motion || !motion.pos) return null;
    return new PositionJson(
        motion.pos.x ?? 0,
        motion.pos.y ?? 0,
        motion.pos.z ?? 0,
        motion.rot?.y ?? 0,
    );
}

/** MotionInfo from a design-data (pos, rot) pair. */
function motionFromVectors(pos: any, rot: any): any {
    return {
        pos: { x: pos?.x ?? 0, y: pos?.y ?? 0, z: pos?.z ?? 0 },
        rot: { x: rot?.x ?? 0, y: rot?.y ?? 0, z: rot?.z ?? 0 },
    };
}

/**
 * The motion that describes the player: the leader entity when we know it,
 * otherwise the first entity inside the window pearl-sr logs (which excludes
 * props and raw monster ids such as 5013010).
 */
function pickPlayerMotion(motions: any[], leaderEntityId: number): any | null {
    for (const entityMotion of motions) {
        if (entityMotion?.motion && leaderEntityId && entityMotion.entityId === leaderEntityId) {
            return entityMotion.motion;
        }
    }
    for (const entityMotion of motions) {
        if (entityMotion?.motion && isPlayerWindowEntity(entityMotion.entityId ?? 0)) {
            return entityMotion.motion;
        }
    }
    return null;
}

// ---- handlers ---------------------------------------------------------------

/** 1458 -> 1456. */
export async function onGetCurSceneInfoCsReq(_req: unknown, session: NetSession): Promise<void> {
    const dataInGame = session.data.getDataInGame();
    // DEVIATION: pearl-sr answers with the hard-coded
    // `createScene(20503, 20503001, 2050301, 1029)` — the same scene for every
    // player, for ever. The scene is taken from the save file instead; when it
    // is unset we fall back to the DEFAULT_* spawn of common/constants.ts
    // (plane 20313 / floor 20313001 / entry 2031301), which is exactly the
    // plane/floor that `ConfigManager.getEntrance(DEFAULT_ENTRY_ID)` resolves.
    const entryId = dataInGame.scene?.entry_id || DEFAULT_ENTRY_ID;
    const avatarIds = lineupAvatarIds(session);
    const built = buildScene({ entryId, avatarIds });
    applySavedPropStates(built.sceneInfo, dataInGame.propStates);

    // DEVIATION: resume the persisted position instead of always snapping the
    // party to the spawn anchor. Only applied when that position was saved for
    // the very scene we are rebuilding.
    const saved = dataInGame.position;
    if (saved && !saved.isEmpty() && dataInGame.scene?.entry_id === entryId) {
        setLeaderMotion(built.sceneInfo, saved);
    }

    rememberScene(session, built);
    await session.sendRsp(CmdID.CmdGetCurSceneInfoScRsp, {
        retcode: 0,
        scene: built.sceneInfo,
    });
}

/** 1434 -> 1425. */
export async function onSceneEntityMoveCsReq(req: any, session: NetSession): Promise<void> {
    const motions: any[] = req?.entityMotionList ?? [];

    for (const entityMotion of motions) {
        if (entityMotion?.motion && isPlayerWindowEntity(entityMotion.entityId ?? 0)) {
            sceneDebug(
                `[POSITION] entity_id: ${entityMotion.entityId}, motion: ${JSON.stringify(
                    entityMotion.motion,
                )}`,
            );
        }
    }

    // Response first: the client is never delayed by a disk write.
    await session.sendRsp(CmdID.CmdSceneEntityMoveScRsp, {
        retcode: 0,
        entityMotionList: motions,
    });

    // DEVIATION: pearl-sr only echoes the list, so the server never learns where
    // the player is. Track and (throttled) persist the player's position.
    const motion = pickPlayerMotion(motions, session.scene?.leaderEntityId ?? 0);
    const position = positionOfMotion(motion);
    if (position) await trackPosition(session, position);
}

/** 1463 -> 1409, then notify 1427. */
export async function onEnterSceneCsReq(req: any, session: NetSession): Promise<void> {
    const requestedEntryId = req?.entryId ?? 0;
    const requestedFloorId = req?.sceneIdentifier?.floorId || 0;
    const teleportId = req?.teleportId ?? 0;
    let entrance = session.config.getEntrance(requestedEntryId);
    if (!entrance && requestedFloorId && (!requestedEntryId || requestedEntryId === requestedFloorId)) {
        const scenes = session.config.scenesOnFloor(requestedFloorId, session.scene?.entryId);
        const target = scenes.find((scene) =>
            scene.teleports?.some((anchor) => anchor.teleportId === teleportId),
        ) ?? scenes[0];
        if (target) entrance = session.config.getEntrance(target.entryID);
    }
    const avatarIds = lineupAvatarIds(session);
    if (!entrance || (requestedFloorId && requestedFloorId !== entrance.FloorID)) {
        await session.sendRsp(CmdID.CmdEnterSceneScRsp, {
            retcode: starrail.Retcode.RET_SCENE_ENTRY_ID_NOT_MATCH,
            sceneIdentifier: req?.sceneIdentifier,
        });
        return;
    }
    const { ID: entryId, FloorID: floorId, PlaneID: planeId } = entrance;
    const launcher = gridFightProfile.launcher;
    const isGridFightTransfer = entryId === launcher.entryId && teleportId === launcher.teleportId;
    const sceneInfo = createScene(planeId, floorId, entryId, isGridFightTransfer ? 0 : teleportId, avatarIds);
    applySavedPropStates(sceneInfo, session.data.getDataInGame().propStates);
    if (isGridFightTransfer) {
        const launcherMotion = getAnchorMotion(entryId);
        if (launcherMotion) setLeaderMotion(sceneInfo, launcherMotion);
    }
    const spawn = positionOfMotion(leaderMotion(sceneInfo));
    if (!spawn) {
        await session.sendRsp(CmdID.CmdEnterSceneScRsp, {
            retcode: starrail.Retcode.RET_SCENE_ENTITY_POS_NOT_MATCH,
            sceneIdentifier: req?.sceneIdentifier,
        });
        return;
    }
    const sceneIdentifier = { ...req?.sceneIdentifier, floorId };
    sceneInfo.sceneIdentifier = sceneIdentifier;

    await session.sendRsp(CmdID.CmdEnterSceneScRsp, {
        retcode: 0,
        sceneIdentifier,
        isOverMap: true,
        isCloseMap: !!req?.isCloseMap,
    });

    console.log(
        `ENTER SCENE ENTRY ID: ${entryId}, PLANE ID: ${planeId}, FLOOR ID: ${floorId}, ` +
            `TELEPORT ID: ${teleportId}`,
    );

    // (3) push it.
    await session.sendMessage(CmdID.CmdEnterSceneByServerScNotify, {
        lineup: createSavedLineup(session),
        reason: 0, // EnterSceneReason.ENTER_SCENE_REASON_NONE
        scene: sceneInfo,
    });

    session.data.getDataInGame().scene = new SceneJson(planeId, floorId, entryId);

    rememberScene(session, {
        sceneInfo,
        leaderEntityId: sceneInfo.leaderEntityId,
        entityIds: collectEntityIds(sceneInfo),
        planeId,
        floorId,
    });
    // The lineup we just handed the client, keyed by the slot list it was sent
    // for (LineupInfo.index is not set by buildLineup, i.e. 0).
    createSavedLineup(session);

    await trackPosition(session, spawn, true);
}

/** 1495 -> 1437, one response packet per requested identifier. */
export async function onGetSceneMapInfoCsReq(req: any, session: NetSession): Promise<void> {
    const identifiers: any[] = req?.sceneIdentifiers ?? [];
    if (identifiers.length === 0) {
        await session.sendRsp(CmdID.CmdGetSceneMapInfoScRsp, { retcode: 0, sceneMapInfo: [] });
        return;
    }

    for (const info of identifiers) {
        const floorId = info?.floorId ?? 0;
        const mapInfo: any = {
            // entry_id is NOT looked up in MapEntrance: it is the floor id.
            entryId: floorId,
            floorId,
            curMapEntryId: floorId,
            sceneIdentifier: info,
            lightenSectionList: [],
            unlockedTeleportList: [],
            mazePropList: [],
            mazeGroupList: [],
        };

        const scenes = session.config.scenesOnFloor(floorId, session.scene?.entryId);
        if (scenes.length > 0) {
            for (const [lo, hi] of LIGHTEN_SECTION_RANGES) {
                for (let i = lo; i < hi; i++) mapInfo.lightenSectionList.push(i);
            }
        }
        const teleports = new Set<number>();
        const groups = new Set<number>();
        const props = new Set<string>();
        for (const sceneConf of scenes) {
            for (const teleConf of sceneConf.teleports ?? []) {
                if (teleConf.teleportId > 0) teleports.add(teleConf.teleportId);
            }
            for (const propConf of sceneConf.props ?? []) {
                const key = `${propConf.groupId}:${propConf.instId}`;
                if (props.has(key)) continue;
                props.add(key);
                mapInfo.mazePropList.push({
                    groupId: propConf.groupId,
                    configId: propConf.instId,
                    state: session.data?.getDataInGame().propStates?.[
                        propStateKey(floorId, propConf.groupId, propConf.instId)
                    ] ?? completedPropState(propConf.propState),
                });
                groups.add(propConf.groupId);
            }
        }
        mapInfo.unlockedTeleportList = [...teleports];
        mapInfo.mazeGroupList = [...groups].map((groupId) => ({ groupId }));

        await session.sendRsp(CmdID.CmdGetSceneMapInfoScRsp, {
            retcode: 0,
            sceneMapInfo: [mapInfo],
        });
    }
}

/** 1450 -> 1499. The request is discarded: everything is "unlocked". */
export async function onGetUnlockTeleportCsReq(_req: unknown, session: NetSession): Promise<void> {
    const unlockedTeleportList = new Set<number>([gridFightProfile.launcher.teleportId]);
    for (const sceneConf of session.config.sceneConfig.values()) {
        if (!session.config.getEntrance(sceneConf.entryID)?.FloorID) continue;
        for (const teleConf of sceneConf.teleports ?? []) {
            if (teleConf.teleportId > 0) unlockedTeleportList.add(teleConf.teleportId);
        }
    }

    await session.sendRsp(CmdID.CmdGetUnlockTeleportScRsp, {
        retcode: 0,
        unlockedTeleportList: [...unlockedTeleportList],
    });
}

/** 1481 -> 1451. */
export async function onEnterSectionCsReq(req: any, session: NetSession): Promise<void> {
    console.log(`ENTER SECTION Id: ${req?.sectionId ?? 0}`);
    await session.sendRsp(CmdID.CmdEnterSectionScRsp, { retcode: 0 });
}

/** 1491 -> 1487. */
export async function onSceneEntityTeleportCsReq(req: any, session: NetSession): Promise<void> {
    const entryId = Number(req?.entryId ?? 0);
    const scene = session.scene;
    if (!scene?.leaderEntityId) {
        await session.sendRsp(CmdID.CmdSceneEntityTeleportScRsp, {
            retcode: starrail.Retcode.RET_NOT_IN_SCENE,
        });
        return;
    }
    const anchor = entryId ? session.config.findTeleport(scene.floorId, scene.entryId, entryId) : undefined;
    const motion = entryId
        ? anchor && motionFromVectors(anchor.pos, anchor.rot)
        : req?.entityMotion?.motion;
    const position = positionOfMotion(motion);
    if (!position || ![position.x, position.y, position.z, position.rotY].every(Number.isFinite)) {
        await session.sendRsp(CmdID.CmdSceneEntityTeleportScRsp, {
            retcode: starrail.Retcode.RET_SCENE_ENTITY_POS_NOT_MATCH,
        });
        return;
    }

    await session.sendRsp(CmdID.CmdSceneEntityTeleportScRsp, {
        retcode: 0,
        entityMotion: { entityId: scene.leaderEntityId, motion },
        clientPosVersion: 1,
    });

    await trackPosition(session, position, true);
}

/** 2160 -> 2116. */
export async function onGetFirstTalkNpcCsReq(req: any, session: NetSession): Promise<void> {
    const npcIdList: number[] = req?.FLJBOHAFLOK ?? [];
    await session.sendRsp(CmdID.CmdGetFirstTalkNpcScRsp, {
        retcode: 0,
        // `is_meet` is unconditionally true: no first-talk flag is ever stored.
        npcMeetStatusList: npcIdList.map((npcId) => ({
            GCBDPAFMKAN: npcId,
            OKPLPEELPBC: true,
        })),
    });
}

/** 2142 -> 2139. */
export async function onGetFirstTalkByPerformanceNpcCsReq(
    req: any,
    session: NetSession,
): Promise<void> {
    const performanceIdList: number[] = req?.performanceIdList ?? [];
    await session.sendRsp(CmdID.CmdGetFirstTalkByPerformanceNpcScRsp, {
        retcode: 0,
        npcMeetStatusList: performanceIdList.map((performanceId) => ({
            performanceId,
            OKPLPEELPBC: true,
        })),
    });
}

/** 4.7: 10 -> 4 (retcode) / 5 (talk_event_list). */
export async function onGetNpcTakenRewardCsReq(req: any, session: NetSession): Promise<void> {
    await session.sendRsp(CmdID.CmdGetNpcTakenRewardScRsp, {
        retcode: 0,
        npcId: req?.npcId ?? 0,
        // A literal constant, identical for every npc id: [2136, 2134].
        talkEventList: [...NPC_TALK_EVENT_LIST],
    });
}

/** 4.7: 10 -> 4. The new property value is neither echoed nor stored beyond the ack. */
export async function onUpdateGroupPropertyCsReq(req: any, session: NetSession): Promise<void> {
    await session.sendRsp(CmdID.CmdUpdateGroupPropertyScRsp, {
        retcode: 0,
        floorId: req?.floorId ?? 0,
        groupId: req?.groupId ?? 0,
        dimensionId: req?.dimensionId ?? 0,
        propertyName: req?.propertyName ?? '',
    });
}

/** 1483 -> 1415. `timeline_info` is dropped on the floor, as in pearl-sr. */
export async function onChangePropTimelineInfoCsReq(req: any, session: NetSession): Promise<void> {
    await session.sendRsp(CmdID.CmdChangePropTimelineInfoScRsp, {
        retcode: 0,
        propEntityId: req?.propEntityId ?? 0,
    });
}

/** 1496 -> 1447. */
export async function onDeactivateFarmElementCsReq(req: any, session: NetSession): Promise<void> {
    console.log(`DEACTIVATE FARM ELEMENT ENTITY ID: ${req?.entityId ?? 0}`);
    await session.sendRsp(CmdID.CmdDeactivateFarmElementScRsp, {
        retcode: 0,
        entityId: req?.entityId ?? 0,
    });
}

/** 1455 -> notify 1420, then 1448. Notify first, response second. */
export async function onGetEnteredSceneCsReq(_req: unknown, session: NetSession): Promise<void> {
    const floors = new Map<string, { planeId: number; floorId: number }>();
    const unlock = (planeId: number, floorId: number) => {
        if (planeId > 0 && floorId > 0) floors.set(`${planeId}:${floorId}`, { planeId, floorId });
    };
    for (const entrance of session.config.mapEntrance.values()) {
        unlock(entrance.PlaneID, entrance.FloorID);
    }
    for (const plane of session.config.mazePlane.values()) {
        unlock(plane.PlaneID, plane.StartFloorID);
        for (const floorId of plane.FloorIDList ?? []) unlock(plane.PlaneID, floorId);
    }
    const enteredSceneInfoList = [...floors.values()];

    await session.sendMessage(CmdID.CmdEnteredSceneChangeScNotify, { enteredSceneInfoList });
    await session.sendRsp(CmdID.CmdGetEnteredSceneScRsp, {
        retcode: 0,
        enteredSceneInfoList,
    });
}

/** 1405 -> 1475. */
export async function onInteractPropCsReq(req: any, session: NetSession): Promise<void> {
    console.log(`INTERACT ID ${req?.interactId2 ?? 0} on PROP ENTITY ID: ${req?.propEntityId ?? 0}`);
    // Free-roam props are emitted before monsters, sequentially from 1001.
    const props = session.scene?.gameModeType === undefined || session.scene.gameModeType === 1
        ? session.config.getScene(session.scene?.entryId ?? 0)?.props : undefined;
    const prop = props?.[Number(req?.propEntityId) - 1001];
    const interaction = session.config.interactConfig.get(Number(req?.interactId2));
    if (!prop || !interaction) {
        await session.sendRsp(CmdID.CmdInteractPropScRsp, {
            retcode: starrail.Retcode.RET_SCENE_ENTITY_POS_NOT_MATCH,
            propEntityId: req?.propEntityId ?? 0,
        });
        return;
    }
    const save = session.data.getDataInGame();
    save.propStates ??= {};
    // Free exploration ignores story/item prerequisites; the operation's
    // target is read from the client table, never inferred from its numeric ID.
    const state = interaction.TargetState;
    save.propStates[propStateKey(session.scene!.floorId, prop.groupId, prop.instId)] = state;
    await session.data.saveDataInGame();
    await session.sendRsp(CmdID.CmdInteractPropScRsp, {
        retcode: 0,
        propEntityId: req?.propEntityId ?? 0,
        propState: state,
    });
    await session.sendMessage(CmdID.CmdSceneGroupRefreshScNotify, {
        floorId: session.scene!.floorId,
        groupRefreshList: [{ groupId: prop.groupId, state: 1, refreshEntity: [{ addEntity: {
            entityId: req.propEntityId, groupId: prop.groupId, instId: prop.instId,
            prop: { propId: prop.propId, propState: state },
            motion: motionFromVectors(prop.pos, prop.rot),
        } }] }],
    });
}

/** 6566 -> 6558. The flipper payload is echoed verbatim (possibly unset). */
export async function onChangeEraFlipperDataCsReq(req: any, session: NetSession): Promise<void> {
    await session.sendRsp(CmdID.CmdChangeEraFlipperDataScRsp, {
        retcode: 0,
        data: req?.data,
    });
}

/** 1489 -> notify 1459, then 1401. Notify first, response second. */
export async function onSetTrainWorldIdCsReq(req: any, session: NetSession): Promise<void> {
    const trainWorldId = req?.trainWorldId ?? 0;
    await session.sendMessage(CmdID.CmdTrainWorldIdChangeScNotify, { trainWorldId });
    await session.sendRsp(CmdID.CmdSetTrainWorldIdScRsp, {
        retcode: 0,
        trainWorldId,
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetCurSceneInfoCsReq, action: onGetCurSceneInfoCsReq },
    { cmdId: CmdID.CmdSceneEntityMoveCsReq, action: onSceneEntityMoveCsReq },
    { cmdId: CmdID.CmdEnterSceneCsReq, action: onEnterSceneCsReq },
    { cmdId: CmdID.CmdGetSceneMapInfoCsReq, action: onGetSceneMapInfoCsReq },
    { cmdId: CmdID.CmdGetUnlockTeleportCsReq, action: onGetUnlockTeleportCsReq },
    { cmdId: CmdID.CmdEnterSectionCsReq, action: onEnterSectionCsReq },
    { cmdId: CmdID.CmdSceneEntityTeleportCsReq, action: onSceneEntityTeleportCsReq },
    { cmdId: CmdID.CmdGetFirstTalkNpcCsReq, action: onGetFirstTalkNpcCsReq },
    {
        cmdId: CmdID.CmdGetFirstTalkByPerformanceNpcCsReq,
        action: onGetFirstTalkByPerformanceNpcCsReq,
    },
    { cmdId: CmdID.CmdGetNpcTakenRewardCsReq, action: onGetNpcTakenRewardCsReq },
    { cmdId: CmdID.CmdUpdateGroupPropertyCsReq, action: onUpdateGroupPropertyCsReq },
    { cmdId: CmdID.CmdChangePropTimelineInfoCsReq, action: onChangePropTimelineInfoCsReq },
    { cmdId: CmdID.CmdDeactivateFarmElementCsReq, action: onDeactivateFarmElementCsReq },
    { cmdId: CmdID.CmdGetEnteredSceneCsReq, action: onGetEnteredSceneCsReq },
    { cmdId: CmdID.CmdInteractPropCsReq, action: onInteractPropCsReq },
    { cmdId: CmdID.CmdChangeEraFlipperDataCsReq, action: onChangeEraFlipperDataCsReq },
    { cmdId: CmdID.CmdSetTrainWorldIdCsReq, action: onSetTrainWorldIdCsReq },
];
