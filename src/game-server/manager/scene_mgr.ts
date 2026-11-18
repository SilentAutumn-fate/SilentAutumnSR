import { configManager, SceneConfig, Vec3 } from './config_mgr';
import { completedPropState } from './map-exploration';
import { MC_AVATAR_IDS, M7_AVATAR_IDS, PLAYER_ENTITY_OFFSET } from '../../common/constants';

/**
 * Scene construction — port of pearl-sr's `manager/scene_mgr.zig`
 * (`SceneManager`, `ChallengeSceneManager`, `MazeMapManager`).
 *
 * See `docs/spec-scene-config.md` Part B for the exact algorithm; every quirk
 * documented there is reproduced on purpose and called out in a comment where
 * it looks like a bug (because it is one, and the client's behaviour depends on
 * it):
 *
 *   - spawn anchors are resolved on the destination floor, and player entities
 *     use the base avatar ID,
 *   - prop entity ids are `1000 + counter`, monster entity ids are either the
 *     raw monster id or the bare counter (no offset),
 *   - `opened_chest_id_list` is filled with GROUP ids,
 *   - plane 10000 suppresses both the saved values and the prop/monster scan.
 *
 * Everything here is pure design-data work: no NetSession, no persisted state,
 * so battle/challenge code can build a scene for any entry id.
 */

// ---- constants (origin: pearl-sr manager/scene_mgr.zig) ----------------------

/** `SceneManager.createScene` hard-codes world_id 501 for free roam. */
const FREE_ROAM_WORLD_ID = 501;
/** Hard-coded `world_level` of every monster in both builders. */
const MONSTER_WORLD_LEVEL = 6;
/** Prop entity ids start at 1001 (`1000 + first counter value`). */
const PROP_ENTITY_ID_OFFSET = 1000;
const FREE_ROAM_GAME_MODE_TYPE = 1;
/** `ChallengeSceneManager.createBaseScene` always sets game_mode_type = 4. */
const CHALLENGE_GAME_MODE_TYPE = 4;
/** `uid` field of challenge actors is the literal 1 (not the player's uid). */
const CHALLENGE_ACTOR_UID = 1;
/** Free-roam actors carry uid 0. */
const FREE_ROAM_ACTOR_UID = 0;
/** Town plane: no props/monsters and no floor saved values are emitted. */
const TOWN_PLANE_ID = 10000;
/** `AvatarType_AvatarFormalType` — 3 in both pearl-sr and StarRail.proto. */
const AVATAR_FORMAL_TYPE = 3;

/**
 * `lighten_section_list` ranges, half-open on the upper bound (Zig `a..b`):
 * 101 + 51 + 1 + 20 = 173 values.
 */
export const LIGHTEN_SECTION_RANGES: ReadonlyArray<readonly [number, number]> = [
    [0, 101],
    [10000, 10051],
    [20000, 20001],
    [30000, 30020],
];

// ---- shared helpers ---------------------------------------------------------

/**
 * `getBaseAvatarId`: every Trailblazer path collapses onto 8001, March 7th's
 * alternate path (1224) onto 1001, everything else is itself.
 */
export function getBaseAvatarId(id: number): number {
    if (MC_AVATAR_IDS.includes(id)) return MC_AVATAR_IDS[0];
    if (M7_AVATAR_IDS.includes(id)) return M7_AVATAR_IDS[0];
    return id;
}

/**
 * `BaseUidGen` — a plain pre-incrementing u32 counter that is local to one
 * build call, so the first id handed out is 1.
 */
interface UidGen {
    nextId(): number;
}

function baseUidGen(): UidGen {
    let current = 0;
    return { nextId: () => ++current };
}

function toVector(v: Vec3): { x: number; y: number; z: number } {
    // `Vector` is sint32 on the wire; the configs already hold plain integers.
    return { x: v?.x ?? 0, y: v?.y ?? 0, z: v?.z ?? 0 };
}

function motionOf(pos: Vec3, rot: Vec3): any {
    return { pos: toVector(pos), rot: toVector(rot) };
}

/** `game_config.avatar_config` equivalent: the ids the caller plays with. */
function leaderEntityIdOf(avatarIds: number[]): number {
    // Actor entities use the base ID so their identity survives path changes.
    if (!avatarIds || avatarIds.length === 0) return 0;
    return getBaseAvatarId(avatarIds[0]) + PLAYER_ENTITY_OFFSET;
}

/**
 * Floor saved values, read through the FloorID-keyed index.
 *
 * NOTE: `ConfigManager.savedValues` declares `SavedValues` as a number map, but
 * the JSON really holds an array of `{ Name, MaxValue }` rows (the same shape
 * pearl-sr parses into `Values`). The cast below is deliberate; the declared
 * type is wrong, not the data.
 */
function savedValuesFor(floorId: number): Array<{ Name?: string; MaxValue?: number }> {
    const row: any = configManager.savedValues.get(floorId);
    if (!row) return [];
    return Array.isArray(row.SavedValues) ? row.SavedValues : [];
}

// ---- free-roam builder (SceneManager) ---------------------------------------

export interface SceneBuildRequest {
    entryId: number;
    /** Lineup avatar ids; may be empty (no actor entities are produced then). */
    avatarIds: number[];
    /** Defaults to 1 (free roam). */
    gameModeType?: number;
}

export interface BuiltScene {
    /** A SceneInfo ready to hand to sendRsp / sendNotify. */
    sceneInfo: any;
    leaderEntityId: number;
    /** Every distinct entity id the client is told about, in encounter order. */
    entityIds: number[];
    planeId: number;
    floorId: number;
}

/**
 * Build the scene for one entrance id.
 *
 * `planeId` / `floorId` come from `ConfigManager.getEntrance`; an unknown
 * entrance keeps them at 0 and still produces a valid (degenerate) scene —
 * pearl-sr's miss behaviour in `onEnterScene`.
 */
export function buildScene(req: SceneBuildRequest): BuiltScene {
    const entryId = req?.entryId ?? 0;
    const avatarIds = req?.avatarIds ?? [];
    const entrance = configManager.getEntrance(entryId);
    const planeId = entrance ? entrance.PlaneID : 0;
    const floorId = entrance ? entrance.FloorID : 0;
    const sceneInfo = createScene(planeId, floorId, entryId, 0, avatarIds);
    const gameModeType = req?.gameModeType ?? FREE_ROAM_GAME_MODE_TYPE;
    if (gameModeType !== FREE_ROAM_GAME_MODE_TYPE) sceneInfo.gameModeType = gameModeType;

    return {
        sceneInfo,
        leaderEntityId: sceneInfo.leaderEntityId,
        entityIds: collectEntityIds(sceneInfo),
        planeId,
        floorId,
    };
}

/**
 * `SceneManager.createScene(plane_id, floor_id, entry_id, teleport_id)`, plus
 * the avatar list pearl-sr reads from `config.json`.
 *
 * Parameter order mirrors the Zig function so the port can be diffed against it
 * one-to-one; `avatarIds` takes the place of `game_config.avatar_config`.
 */
export function createScene(
    planeId: number,
    floorId: number,
    entryId: number,
    teleportId: number,
    avatarIds: number[] = [],
): any {
    const generator = baseUidGen();
    const sceneInfo: any = {
        gameModeType: FREE_ROAM_GAME_MODE_TYPE,
        planeId,
        floorId,
        entryId,
        sceneIdentifier: { floorId },
        floorSavedData: {},
        entityGroupList: [],
        entityList: [],
        openedChestIdList: [],
        customDataList: [],
        lightenSectionList: [],
        leaderEntityId: leaderEntityIdOf(avatarIds),
        worldId: configManager.getPlane(planeId)?.WorldID || FREE_ROAM_WORLD_ID,
        clientPosVersion: 1,
    };

    // (1) floor_saved_data — map<string,int32>, last write wins on duplicates.
    if (planeId !== TOWN_PLANE_ID) {
        for (const values of savedValuesFor(floorId)) {
            sceneInfo.floorSavedData[values.Name ?? ''] = values.MaxValue ?? 0;
        }
    }

    // Resolve the spawn only on the destination floor, with one actor group.
    const groupMap = new Map<number, any>();
    const anchor = configManager.findTeleport(floorId, entryId, teleportId);
    if (anchor && avatarIds.length > 0) {
        const group: any = { state: 1, groupId: 0, entityList: [], BANBECDCDHG: {} };
        addAvatarEntities(group, avatarIds, anchor.pos, anchor.rot, FREE_ROAM_ACTOR_UID);
        sceneInfo.entityGroupList.push(group);
    }
    const sceneConf = configManager.getScene(entryId);
    if (sceneConf?.planeID === planeId && planeId !== TOWN_PLANE_ID) {
        addPropEntities(groupMap, sceneConf.props ?? [], generator);
        addMonsterEntities(groupMap, sceneConf.monsters ?? [], generator);
    }

    // (3) flush the group map (insertion-ordered Map = stable, see spec B.8.7).
    for (const group of groupMap.values()) {
        sceneInfo.entityGroupList.push(group);
        for (const entity of group.entityList) sceneInfo.entityList.push(entity);
        // Misnamed in the proto: these are group ids, not chests.
        sceneInfo.openedChestIdList.push(group.groupId);
        sceneInfo.customDataList.push({ groupId: group.groupId });
    }

    // (4) lighten_section_list — appended once, after everything else.
    for (const [lo, hi] of LIGHTEN_SECTION_RANGES) {
        for (let i = lo; i < hi; i++) sceneInfo.lightenSectionList.push(i);
    }

    return sceneInfo;
}

function getOrCreateGroup(groupMap: Map<number, any>, groupId: number): any {
    let group = groupMap.get(groupId);
    if (!group) {
        group = { state: 1, groupId, entityList: [], BANBECDCDHG: {} };
        groupMap.set(groupId, group);
    }
    return group;
}

/** One actor entity per avatar; `uid` is the raw argument (0 for free roam). */
function addAvatarEntities(
    group: any,
    avatarIds: number[],
    pos: Vec3,
    rot: Vec3,
    uid: number,
): void {
    for (const avatarId of avatarIds ?? []) {
        const baseId = getBaseAvatarId(avatarId);
        group.entityList.push({
            instId: 1,
            entityId: baseId + PLAYER_ENTITY_OFFSET,
            groupId: 0,
            // NOTE: the generated SceneEntityInfo.fromObject reads oneof members
            // FLAT (`actor`, not `entity: { actor: … }`) — the wrapper is
            // silently ignored, which is why SceneEntityInfo's `entity` alias
            // must never be used when building a message by hand.
            actor: {
                baseAvatarId: baseId,
                avatarType: AVATAR_FORMAL_TYPE,
                uid,
                mapLayer: 0,
            },
            motion: motionOf(pos, rot),
        });
    }
}

function addPropEntities(
    groupMap: Map<number, any>,
    propConfigs: SceneConfig['props'],
    generator: UidGen,
): void {
    for (const propConf of propConfigs) {
        const group = getOrCreateGroup(groupMap, propConf.groupId);
        group.entityList.push({
            prop: { propId: propConf.propId, propState: completedPropState(propConf.propState) },
            groupId: group.groupId,
            instId: propConf.instId,
            entityId: PROP_ENTITY_ID_OFFSET + generator.nextId(),
            motion: motionOf(propConf.pos, propConf.rot),
        });
    }
}

function addMonsterEntities(
    groupMap: Map<number, any>,
    monsterConfigs: SceneConfig['monsters'],
    generator: UidGen,
): void {
    for (const monsConf of monsterConfigs) {
        const group = getOrCreateGroup(groupMap, monsConf.groupId);
        const monsterInfo = {
            monsterId: monsConf.monsterId,
            eventId: monsConf.eventId,
            worldLevel: MONSTER_WORLD_LEVEL,
        };
        // Integer division: monsters whose 4th digit from the right is 3 keep
        // their own id (and do NOT consume a counter value); the rest take the
        // bare counter value with no +1000 offset.
        const keepOwnId = Math.trunc(monsConf.monsterId / 1000) % 10 === 3;
        group.entityList.push({
            npcMonster: monsterInfo,
            groupId: group.groupId,
            instId: monsConf.instId,
            entityId: keepOwnId ? monsterInfo.monsterId : generator.nextId(),
            motion: motionOf(monsConf.pos, monsConf.rot),
        });
    }
}

/** Every distinct entity id in the scene (actors included), in encounter order. */
export function collectMonsterEvents(sceneInfo: any): Map<number, number> {
    const entities = [
        ...(sceneInfo?.entityList ?? []),
        ...(sceneInfo?.entityGroupList ?? []).flatMap((group: any) => group.entityList ?? []),
    ];
    return new Map(entities.filter((entity) => entity.npcMonster).map((entity) =>
        [entity.entityId, entity.npcMonster.eventId ?? 0] as [number, number],
    ));
}

export function collectEntityIds(sceneInfo: any): number[] {
    const ids: number[] = [];
    const seen = new Set<number>();
    const push = (id: number) => {
        if (seen.has(id)) return;
        seen.add(id);
        ids.push(id);
    };
    for (const group of sceneInfo.entityGroupList ?? []) {
        for (const entity of group.entityList ?? []) push(entity.entityId);
    }
    for (const entity of sceneInfo.entityList ?? []) push(entity.entityId);
    return ids;
}

// ---- leader motion helpers (used by handler/scene.ts) -----------------------

/** True for an entity that actually carries a payload (oneof member present). */
const hasEntityBody = (entity: any): boolean =>
    !!(entity && (entity.actor || entity.prop || entity.npcMonster || entity.npc || entity.summonUnit));

const leaderEntity = (sceneInfo: any): any | null => {
    const leaderId = sceneInfo?.leaderEntityId ?? 0;
    if (!leaderId) return null;
    for (const group of sceneInfo.entityGroupList ?? []) {
        for (const entity of group.entityList ?? []) {
            if (entity.entityId === leaderId && hasEntityBody(entity)) return entity;
        }
    }
    return null;
};

/** The leader entity's MotionInfo, or null when the scene has no leader. */
export function leaderMotion(sceneInfo: any): any | null {
    return leaderEntity(sceneInfo)?.motion ?? null;
}

/**
 * Move the leader entity to `position` (a MotionInfo or PositionJson-shaped
 * object). Returns false when the scene has no leader entity.
 */
export function setLeaderMotion(
    sceneInfo: any,
    position: { x?: number; y?: number; z?: number; rotY?: number } | any,
): boolean {
    const entity = leaderEntity(sceneInfo);
    if (!entity) return false;
    entity.motion = position?.pos
        ? { pos: toVector(position.pos), rot: toVector(position.rot) }
        : motionOf(
              { x: position?.x ?? 0, y: position?.y ?? 0, z: position?.z ?? 0 },
              { x: 0, y: position?.rotY ?? 0, z: 0 },
          );
    return true;
}

// ---- challenge builders (ChallengeSceneManager) -----------------------------

/**
 * `ChallengeSceneManager.createBaseScene`: game_mode_type 4, `leader_entity_id`
 * is the RAW avatar id (no +100000), one group holding every actor at position
 * {0,0,0}, and no `entity_list` / lighten list / client position version.
 */
function createBaseScene(
    gameModeType: number,
    avatarIds: number[],
    planeId: number,
    floorId: number,
    entryId: number,
    worldId: number | null,
): any {
    const sceneInfo: any = {
        gameModeType,
        planeId,
        floorId,
        entryId,
        sceneIdentifier: { floorId },
        // Unlike the free-roam builder, there is no `plane_id != 10000` guard.
        floorSavedData: {},
        entityGroupList: [],
        leaderEntityId: avatarIds && avatarIds.length > 0 ? avatarIds[0] : 0,
        // world_id stays 0 when the caller passes null (createPeakScene).
        worldId: worldId ?? 0,
    };

    for (const values of savedValuesFor(floorId)) {
        sceneInfo.floorSavedData[values.Name ?? ''] = values.MaxValue ?? 0;
    }

    const group: any = { state: 1, groupId: 0, entityList: [], BANBECDCDHG: {} };
    addAvatarEntities(group, avatarIds ?? [], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, CHALLENGE_ACTOR_UID);
    sceneInfo.entityGroupList.push(group);

    return sceneInfo;
}

function addChallengeEntities(
    sceneInfo: any,
    groupId: number,
    monsterId: number,
    eventId: number,
    generator: UidGen,
): void {
    for (const sceneConf of configManager.sceneConfig.values()) {
        if (sceneConf.planeID !== sceneInfo.planeId) continue;

        for (const monsConf of sceneConf.monsters ?? []) {
            if (monsConf.groupId !== groupId) continue;
            const group: any = { state: 1, groupId, entityList: [], BANBECDCDHG: {} };
            group.entityList.push({
                // The CONFIG's monster id / event id are ignored here: the
                // caller passes the ids the challenge defines.
                npcMonster: {
                    monsterId,
                    eventId,
                    worldLevel: MONSTER_WORLD_LEVEL,
                },
                groupId,
                instId: monsConf.instId,
                entityId: generator.nextId(),
                motion: motionOf(monsConf.pos, monsConf.rot),
            });
            sceneInfo.entityGroupList.push(group);
            break; // only the first matching monster of this config
        }

        for (const propConf of sceneConf.props ?? []) {
            if (propConf.groupId !== groupId) continue;
            // One group PER matching prop — no deduplication by group id.
            const group: any = { state: 1, groupId, entityList: [], BANBECDCDHG: {} };
            group.entityList.push({
                prop: { propId: propConf.propId, propState: propConf.propState },
                groupId,
                instId: propConf.instId,
                entityId: generator.nextId(),
                motion: motionOf(propConf.pos, propConf.rot),
            });
            sceneInfo.entityGroupList.push(group);
        }
    }
}

/**
 * `ChallengeSceneManager.createScene(avatar_list, plane_id, floor_id, entry_id,
 * world_id, monster_id, event_id, group_id)`. A fresh counter per call, so
 * entity ids always start over at 1.
 */
export function createChallengeScene(
    avatarIds: number[],
    planeId: number,
    floorId: number,
    entryId: number,
    worldId: number | null,
    monsterId: number,
    eventId: number,
    groupId: number,
): any {
    const sceneInfo = createBaseScene(
        CHALLENGE_GAME_MODE_TYPE,
        avatarIds,
        planeId,
        floorId,
        entryId,
        worldId,
    );
    addChallengeEntities(sceneInfo, groupId, monsterId, eventId, baseUidGen());
    return sceneInfo;
}

/** `ChallengeSceneManager.createPeakScene` — same, with `world_id` left at 0. */
export function createPeakScene(
    avatarIds: number[],
    planeId: number,
    floorId: number,
    entryId: number,
    monsterId: number,
    eventId: number,
    groupId: number,
): any {
    return createChallengeScene(
        avatarIds,
        planeId,
        floorId,
        entryId,
        null,
        monsterId,
        eventId,
        groupId,
    );
}

/** `ChallengeSceneManager.getAnchorMotion` — first anchor of an entry, or null. */
export function getAnchorMotion(entryId: number): any | null {
    // The index is keyed by entryID and holds no duplicate codes, which matches
    // pearl-sr's first-match-wins linear scan.
    const row: any = configManager.anchorConfig.get(entryId);
    if (!row) return null;
    const anchors = row.anchor;
    if (!Array.isArray(anchors) || anchors.length === 0) return null;
    return motionOf(anchors[0].pos, anchors[0].rot);
}

// ---- map data (MazeMapManager) ----------------------------------------------

/**
 * `MazeMapManager.setMazeMapData`: one MazeGroup + MazePropState pair per prop
 * of every scene config on any plane that owns `floorId`. Group ids are NOT
 * deduplicated and the two lists stay index-aligned.
 */
export function setMazeMapData(mapInfo: any, floorId: number): void {
    const planeIds = new Set<number>();
    for (const entrance of configManager.mapEntrance.values()) {
        if (entrance.FloorID === floorId) planeIds.add(entrance.PlaneID);
    }

    mapInfo.mazeGroupList = [];
    mapInfo.mazePropList = [];
    for (const sceneConf of configManager.sceneConfig.values()) {
        if (!planeIds.has(sceneConf.planeID)) continue;
        for (const propConf of sceneConf.props ?? []) {
            mapInfo.mazeGroupList.push({ EGEKIHGOBHM: [], groupId: propConf.groupId });
            mapInfo.mazePropList.push({
                groupId: propConf.groupId,
                configId: propConf.instId,
                state: propConf.propState,
            });
        }
    }
}
