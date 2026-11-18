import type { NetSession } from '../NetSession';
import type { JsonData } from '../../data/loadFreeData';
import type {
    ChallengeConfig,
    ChallengePeakConfig,
    ChallengePeakBossConfig,
    ChallengePeakGroupConfig,
    ChallengeTierceConfig,
    MazePlane,
} from './config_mgr';
import { isFirstChallengeNode } from '../scene/commands/value';

/**
 * Challenge state and builders — the port of pearl-sr's
 * `manager/challenge_mgr.zig` (`ChallengeManager`, `ChallengeLineupManager`) plus
 * the `Logic.Challenge()` block of `utils/logic.zig`.
 *
 * See `docs/spec-battle-challenge.md` §14.0 for the reference behaviour and
 * §14.20 for the quirk list; every quirk the client can observe is reproduced on
 * purpose and called out in a comment where it looks like a bug (because it is
 * one, and the client depends on it).
 *
 * PER-SESSION STATE: `Logic.Challenge()` is a set of Zig process-globals, so two
 * players would fight over one challenge. Here it lives in a WeakMap keyed by the
 * session (PORTING-GUIDE "Per-session state owned by your module"), which keeps
 * the observable behaviour identical for a single connection and sane for many.
 * `Logic.CustomMode()` (`/node`, `/id`) is the command module's per-session state
 * and is read through its accessors, exactly as the reference shares it.
 *
 * LINEUPS: the reference's `ChallengeLineupManager` is a separate builder that
 * only differs from `LineupManager.createLineup()` in the `extra_lineup_type` it
 * writes (1 for the first node / Peak, 3 for the second node) and in taking the
 * avatar list as an argument. It is rebuilt here — `manager/lineup_mgr.ts` is
 * another module's file and the challenge roster is this module's own concern.
 */

// ---- constants (origin: pearl-sr manager/challenge_mgr.zig, logic.zig) ------

/** `ChallengeStatus.CHALLENGE_DOING` — the only status ever written. */
const CHALLENGE_STATUS_DOING = 1;
/** `ExtraLineupType_LineupChallenge` / `ExtraLineupType_LineupChallenge2`. */
const LINEUP_CHALLENGE = 1;
const LINEUP_CHALLENGE_2 = 3;
/** `AvatarType_AvatarFormalType`. */
const AVATAR_FORMAL_TYPE = 3;

/** `CurChallenge.score_id` in the Pure Fiction band (`20000 < id < 30000`). */
const PF_SCORE_ID = 40000;
/** Pure Fiction / Apocalyptic Shadow band bounds (Zig `challengeID > 20000`). */
const PF_MIN_ID = 20000;
const PF_MAX_ID = 30000;
const AS_MIN_ID = 30000;

/** `buildLineup` defaults; 7 for the two high-cost ults (same rule as the others). */
const LINEUP_MP = 5;
const LINEUP_MP_EXTENDED = 7;
const LINEUP_MP_EXTENDED_AVATAR_IDS = [1408, 1510];
const LINEUP_AVATAR_HP = 10000;
const LINEUP_SP = 10000;
/** `LineupInfo.index` is never written by `buildLineup`, so every lineup is 0. */
const LINEUP_INDEX = 0;

/**
 * `LoadStageInfo`'s fallback rosters for a challenge id the client never saved a
 * line-up for — indexed by `stage_index`; `> 2` leaves the roster untouched.
 */
const TIERCE_DEFAULT_ROSTERS: number[][] = [[1508], [1509], [1510]];

// ---- per-session challenge state (utils/logic.zig Logic.Challenge()) --------

/** One saved Tierce stage: the roster and the blessing the player picked. */
export interface ChallengeStageInfo {
    lineup: number[];
    buffId: number;
}

/**
 * `Logic.Challenge()`, per connection.
 *
 * Field names mirror the Zig statics so this can be diffed against
 * `utils/logic.zig` one-to-one. `challenge_stageID` is `challenge_eventID`
 * (the setters assign one from the other), so it is not stored twice.
 */
export interface ChallengeState {
    /** `challenge_blessing` — append-only until `resetChallengeState`. */
    blessings: number[];
    /** `on_challenge`, i.e. `ChallengeMode()`. */
    onChallenge: boolean;
    /** `challenge_mode`: 0 = MOC, 1 = PF, 2 = AS. STICKY (see §14.0.2). */
    mode: number;
    planeId: number;
    floorId: number;
    entryId: number;
    worldId: number;
    monsterId: number;
    eventId: number;
    groupId: number;
    mazeGroupId: number;
    /** `challenge_stageID` = `challenge_eventID`. */
    stageId: number;
    /** `challengeID` — the id from the request. */
    challengeId: number;
    /** `challenge_buffID` — the player-selected blessing. */
    buffId: number;
    /** `challenge_peak_hard`, defaults **true** and survives a reset. */
    peakHard: boolean;
    /** `on_peak_king_stage`, i.e. "started from a boss line-up". */
    onPeakKingStage: boolean;
    /** `avatar_list` — append-only until `resetChallengeState`. */
    avatarIds: number[];
    /** `saved_peak_lineups`: peak id -> roster. Survives a reset. */
    savedPeakLineups: Map<number, number[]>;
    /** `stage_map`: challenge id -> per-stage line-ups. Survives a reset. */
    stageMap: Map<number, ChallengeStageInfo[]>;
}

function freshState(): ChallengeState {
    return {
        blessings: [],
        onChallenge: false,
        mode: 0,
        planeId: 0,
        floorId: 0,
        entryId: 0,
        worldId: 0,
        monsterId: 0,
        eventId: 0,
        groupId: 0,
        mazeGroupId: 0,
        stageId: 0,
        challengeId: 0,
        buffId: 0,
        peakHard: true,
        onPeakKingStage: false,
        avatarIds: [],
        savedPeakLineups: new Map(),
        stageMap: new Map(),
    };
}

const stateBySession = new WeakMap<NetSession, ChallengeState>();

/** This connection's `Logic.Challenge()`. */
export function challengeState(session: NetSession): ChallengeState {
    let state = stateBySession.get(session);
    if (!state) {
        state = freshState();
        stateBySession.set(session, state);
    }
    return state;
}

/**
 * `Logic.Challenge().resetChallengeState()`.
 *
 * Reproduced exactly: everything is cleared **except** `challenge_peak_hard`,
 * `on_peak_king_stage`, `saved_peak_lineups` and `stage_map`. Called only by the
 * three Leave handlers in the reference — never on login, never on Start.
 */
export function resetChallengeState(session: NetSession): void {
    const state = challengeState(session);
    state.onChallenge = false;
    state.mode = 0;
    state.planeId = 0;
    state.floorId = 0;
    state.entryId = 0;
    state.worldId = 0;
    state.monsterId = 0;
    state.eventId = 0;
    state.groupId = 0;
    state.mazeGroupId = 0;
    state.stageId = 0;
    state.challengeId = 0;
    state.buffId = 0;
    state.blessings = [];
    state.avatarIds = [];
    // The shared NetSession fields mirror the same lifecycle; keep them in step
    // so other modules (battle, scene) cannot see a challenge that just ended.
    session.challengeId = 0;
    session.challengePeakId = 0;
    session.challengeTierceId = 0;
}

// ---- read side (the reference's Logic.Challenge() predicates) ---------------

/** `ChallengeMode()`. */
export function isChallengeMode(session: NetSession): boolean {
    return challengeState(session).onChallenge;
}

/** `SetChallenge()`. */
export function enterChallengeMode(session: NetSession): void {
    challengeState(session).onChallenge = true;
}

/** `FoundStage()` — the id looked up in StageConfig.json for the battle. */
export function challengeStageId(session: NetSession): number {
    return challengeState(session).stageId;
}

/** `GetChallengeBlessingID()` — appended into the battle buff list. */
export function challengeBlessings(session: NetSession): number[] {
    return challengeState(session).blessings;
}

/** `GetAvatarIDs()` — the challenge roster, in append order. */
export function challengeAvatarIds(session: NetSession): number[] {
    return challengeState(session).avatarIds;
}

/** `SetChallengeBuffID` — the blessing the player selected in the client. */
export function setChallengeBuffId(session: NetSession, buffId: number): void {
    challengeState(session).buffId = buffId;
}

/** `GetChallengeBuffID()`. */
export function challengeBuffId(session: NetSession): number {
    return challengeState(session).buffId;
}

/** `SetChallengeID`. */
export function setChallengeId(session: NetSession, challengeId: number): void {
    challengeState(session).challengeId = challengeId;
}

/** `GetChallengeID()`. */
export function currentChallengeId(session: NetSession): number {
    return challengeState(session).challengeId;
}

/** `GetChallengeMode()` — 0 = MOC, 1 = PF, 2 = AS. */
export function challengeMode(session: NetSession): number {
    return challengeState(session).mode;
}

/** `GameModePF()` — a pure function of the challenge id. */
export function isPureFiction(challengeId: number): boolean {
    return challengeId > PF_MIN_ID && challengeId < PF_MAX_ID;
}

/** `GameModeAS()`. */
export function isApocalypticShadow(challengeId: number): boolean {
    return challengeId > AS_MIN_ID;
}

/** `ChallengePeakHard()` = `challenge_peak_hard && on_peak_king_stage`. */
export function isChallengePeakHard(session: NetSession): boolean {
    const state = challengeState(session);
    return state.peakHard && state.onPeakKingStage;
}

/** `SetChallengePeakHard` — sticky, survives `resetChallengeState`. */
export function setChallengePeakHard(session: NetSession, hard: boolean): void {
    challengeState(session).peakHard = hard;
}

/** `SetPeakBoss` — "the player started from a boss line-up". */
export function setPeakKingStage(session: NetSession, on: boolean): void {
    challengeState(session).onPeakKingStage = on;
}

/** `GetSceneIDs()` — the 8 values in the reference's exact order. */
export function challengeSceneIds(session: NetSession): number[] {
    const state = challengeState(session);
    return [
        state.planeId,
        state.floorId,
        state.entryId,
        state.worldId,
        state.monsterId,
        state.eventId,
        state.groupId,
        state.mazeGroupId,
    ];
}

/** `GetPeakSceneIDs()` — the same minus the world id. */
export function challengePeakSceneIds(session: NetSession): number[] {
    const state = challengeState(session);
    return [
        state.planeId,
        state.floorId,
        state.entryId,
        state.monsterId,
        state.eventId,
        state.groupId,
        state.mazeGroupId,
    ];
}

/** `CalChallengePeakEventID` — the hard-mode stage id is the event id + 1. */
export function calChallengePeakEventId(session: NetSession, eventId: number): number {
    return isChallengePeakHard(session) ? eventId + 1 : eventId;
}

// ---- private state writers --------------------------------------------------

/**
 * `SetChallengeInfo(floor, world, monster, event, group, maze, plane, entry)`.
 * The argument order is the reference's, and `challenge_stageID` is always the
 * event id.
 */
function setChallengeInfo(
    session: NetSession,
    floorId: number,
    worldId: number,
    monsterId: number,
    eventId: number,
    groupId: number,
    mazeGroupId: number,
    planeId: number,
    entryId: number,
): void {
    const state = challengeState(session);
    state.floorId = floorId;
    state.worldId = worldId;
    state.monsterId = monsterId;
    state.eventId = eventId;
    state.groupId = groupId;
    state.mazeGroupId = mazeGroupId;
    state.planeId = planeId;
    state.entryId = entryId;
    state.stageId = eventId;
}

/** `SetChallengePeakInfo` — the same without a world id (left untouched). */
function setChallengePeakInfo(
    session: NetSession,
    floorId: number,
    monsterId: number,
    eventId: number,
    groupId: number,
    mazeGroupId: number,
    planeId: number,
    entryId: number,
): void {
    const state = challengeState(session);
    state.floorId = floorId;
    state.monsterId = monsterId;
    state.eventId = eventId;
    state.groupId = groupId;
    state.mazeGroupId = mazeGroupId;
    state.planeId = planeId;
    state.entryId = entryId;
    state.stageId = eventId;
}

/** `AddBlessing(ids)` — appends, never replaces or dedupes. */
function addBlessings(session: NetSession, ids: number[]): void {
    challengeState(session).blessings.push(...ids);
}

/** `SetChallengeMode(mode)` — sticky, written only by the two create* paths. */
function setChallengeMode(session: NetSession, mode: number): void {
    challengeState(session).mode = mode;
}

/**
 * `.last()` on a config id list.
 *
 * The reference indexes `items[len - 1]` with no empty check, so a config with an
 * empty list crashes the whole handler. Nothing in the shipped tables is empty;
 * an unknown/empty list becomes 0 here instead of taking the connection down.
 */
function lastId(list: number[] | undefined): number {
    return list && list.length > 0 ? list[list.length - 1] : 0;
}

/** `AddAvatar(ids)` — appends to the roster without clearing it. */
export function appendChallengeAvatars(session: NetSession, ids: number[]): void {
    challengeState(session).avatarIds.push(...ids);
}

/**
 * `Logic.contains(&maze.floor_id_list, floor_id)` search, without a `break`:
 * every matching plane is visited in file order, so the **last** one wins —
 * reproduced on purpose (the shipped tables have a single match).
 */
function matchingPlanes(session: NetSession, floorId: number): MazePlane[] {
    const planes: MazePlane[] = [];
    for (const plane of session.config.mazePlane.values()) {
        if ((plane.FloorIDList ?? []).includes(floorId)) planes.push(plane);
    }
    return planes;
}

// ---- challenge line-up (LineupManager.ChallengeLineupManager) ---------------

/** `LineupAvatar` for one roster entry, using the profile's SP values. */
function lineupAvatar(json: JsonData, avatarId: number, slot: number): any {
    const avatar = json.avatar(avatarId);
    return {
        id: avatarId,
        slot,
        satiety: 0,
        hp: LINEUP_AVATAR_HP,
        // DEVIATION: pearl-sr hard-codes cur_sp/max_sp = 10000/10000 and invents
        // its roster from config.json. This server owns the real values in the
        // freesr profile, and every other lineup builder here (avatar_mgr,
        // scene) uses them, so a profile that leaves `sp_value` at 0 means
        // "unset" and the bar starts full. (`SpBarInfo`'s fields are
        // `curSp`/`maxSp`, NOT the `spCur`/`spNeed` used elsewhere.)
        spBar: {
            curSp: avatar?.sp_value || avatar?.sp_max || LINEUP_SP,
            maxSp: avatar?.sp_max || LINEUP_SP,
        },
        avatarType: AVATAR_FORMAL_TYPE,
    };
}

/**
 * `buildLineup(ids, extraType)` — the challenge-lineup half of §16.2.3.
 *
 * The roster is **not** truncated here: the reference keeps every id (only the
 * battle global `selectedAvatarID` is cut down to 4, which is `battle_mgr`'s job),
 * so a roster the client sends twice really does produce a doubled line-up —
 * see the HAZARD note in `handler/challenge.ts`.
 */
export function buildChallengeLineup(
    session: NetSession,
    avatarIds: number[],
    extraLineupType: number,
): any {
    const json = session.data.getDataJson();
    const extended = avatarIds.some((id) => LINEUP_MP_EXTENDED_AVATAR_IDS.includes(id));
    const mp = extended ? LINEUP_MP_EXTENDED : LINEUP_MP;

    const lineup: any = {
        mp,
        maxMp: mp,
        // `name` is only written when extraType is null (the default line-up);
        // challenge line-ups leave it empty.
        name: '',
        extraLineupType,
        isVirtual: false,
        leaderSlot: 0,
        avatarList: avatarIds.map((avatarId, slot) => lineupAvatar(json, avatarId, slot)),
    };

    // Remember what the client has been told, keyed by LineupInfo.index (0).
    session.lineups[LINEUP_INDEX] = [...avatarIds];
    return lineup;
}

/** `ChallengeLineupManager.createLineup`: node 1 -> 1, node 2 -> 3. */
export function createChallengeLineup(session: NetSession, avatarIds: number[]): any {
    const type = isFirstChallengeNode(session) ? LINEUP_CHALLENGE : LINEUP_CHALLENGE_2;
    return buildChallengeLineup(session, avatarIds, type);
}

/** `ChallengeLineupManager.createPeakLineup`: always the node-1 value. */
export function createPeakLineup(session: NetSession, avatarIds: number[]): any {
    return buildChallengeLineup(session, avatarIds, LINEUP_CHALLENGE);
}

// ---- ChallengeManager.createChallenge ---------------------------------------

/**
 * `ChallengeManager.createChallenge(challengeId, buffId) -> CurChallenge`.
 *
 * Also performs the side effects the reference hides in this call: it writes the
 * challenge scene coordinates (`SetChallengeInfo`), appends to the global
 * blessing list and (for the two "story"/"boss" id bands) sets the sticky
 * `challenge_mode`. Those happen even when the id is unknown — only the four
 * unconditional fields are written then.
 */
export function createChallenge(
    session: NetSession,
    challengeId: number,
    buffId: number,
): any {
    const firstNode = isFirstChallengeNode(session);
    const curChallenge: any = {
        challengeId,
        scoreId: isPureFiction(challengeId) ? PF_SCORE_ID : 0,
        scoreTwo: 0,
        status: CHALLENGE_STATUS_DOING,
        extraLineupType: firstNode ? LINEUP_CHALLENGE : LINEUP_CHALLENGE_2,
    };

    const challengeConf = session.config.getChallenge(challengeId) as ChallengeRow | undefined;
    if (!challengeConf) return curChallenge;

    const entranceId = firstNode ? challengeConf.MapEntranceID : challengeConf.MapEntranceID2;
    const entrance = session.config.getEntrance(entranceId);
    if (!entrance) return curChallenge;

    for (const plane of matchingPlanes(session, entrance.FloorID)) {
        if (firstNode) {
            if (isPureFiction(challengeId)) {
                const buffList = [buffId, challengeConf.MazeBuffID ?? 0];
                addBlessings(session, buffList);
                curChallenge.stageInfo = { curStoryBuffs: { buffList } };
                setChallengeMode(session, 1);
            } else if (isApocalypticShadow(challengeId)) {
                const buffList = [buffId, challengeConf.MazeBuffID ?? 0];
                addBlessings(session, buffList);
                // `challenge_boss_const` is hard-coded 1 in both variants.
                curChallenge.stageInfo = {
                    curBossBuffs: { buffList, challengeBossConst: 1 },
                };
                setChallengeMode(session, 2);
            }
            setChallengeInfo(
                session,
                entrance.FloorID,
                plane.WorldID,
                lastId(challengeConf.NpcMonsterIDList1),
                lastId(challengeConf.EventIDList1),
                challengeConf.MazeGroupID1,
                challengeConf.MazeGroupID1,
                plane.PlaneID,
                challengeConf.MapEntranceID,
            );
            continue;
        }

        // Node 2: everything is gated on the config actually having a second maze
        // group; otherwise the reference prints a warning and does nothing.
        const mazeGroupId2 = challengeConf.MazeGroupID2;
        if (mazeGroupId2 === undefined || mazeGroupId2 === null) {
            console.warn(
                `[challenge] challenge id ${challengeId} does not support the 2nd node; ` +
                    'switch back with /node',
            );
            continue;
        }

        if (isPureFiction(challengeId)) {
            // Node 2 REVERSES the blessing order: stage buff first, selection second.
            const buffList = [challengeConf.MazeBuffID ?? 0, buffId];
            addBlessings(session, buffList);
            curChallenge.stageInfo = { curStoryBuffs: { buffList } };
            setChallengeMode(session, 1);
        } else if (isApocalypticShadow(challengeId)) {
            const buffList = [challengeConf.MazeBuffID ?? 0, buffId];
            addBlessings(session, buffList);
            curChallenge.stageInfo = { curBossBuffs: { buffList, challengeBossConst: 1 } };
            setChallengeMode(session, 2);
        }
        setChallengeInfo(
            session,
            entrance.FloorID,
            plane.WorldID,
            lastId(challengeConf.NpcMonsterIDList2),
            lastId(challengeConf.EventIDList2),
            mazeGroupId2,
            mazeGroupId2,
            plane.PlaneID,
            challengeConf.MapEntranceID2,
        );
    }

    return curChallenge;
}

/**
 * `ChallengeMazeConfig.json` rows declare `MazeGroupID2` but the shared
 * `ConfigManager` interface omits it (like `Floor`, which the command module also
 * reads through an alias). Read it through this type rather than editing the
 * shared file — see the final report.
 */
type ChallengeRow = ChallengeConfig & { MazeGroupID2?: number };

// ---- ChallengeManager.createChallengePeak -----------------------------------

/**
 * `ChallengeManager.createChallengePeak(peakId, buffId)` — returns nothing: the
 * reference assigns the result to a `CurChallenge` it never sends (§14.20.4).
 *
 * Blessing order: the selected buff, then either the boss' hard tags (hard mode)
 * or the peak's own tag list.
 */
export function createChallengePeak(
    session: NetSession,
    peakId: number,
    buffId: number,
): void {
    const peak: ChallengePeakConfig | undefined = session.config.getChallengePeak(peakId);
    if (!peak) return;
    const entrance = session.config.getEntrance(peak.MapEntranceID);
    if (!entrance) return;

    if (buffId !== 0) addBlessings(session, [buffId]);
    if (isChallengePeakHard(session)) {
        for (const boss of session.config.challengePeakBossConfig.values()) {
            if (boss.ID === peakId) addBlessings(session, boss.HardTagList ?? []);
        }
    } else {
        addBlessings(session, peak.TagList ?? []);
    }

    setChallengePeakInfo(
        session,
        entrance.FloorID,
        lastId(peak.NpcMonsterIDList),
        calChallengePeakEventId(session, lastId(peak.EventIDList)),
        peak.MazeGroupID,
        peak.MazeGroupID,
        // NOTE: the Peak path uses the ENTRANCE's plane, while createChallenge
        // uses the maze plane's own `PlaneID`. Both are reproduced as they are.
        entrance.PlaneID,
        peak.MapEntranceID,
    );
}

// ---- ChallengeManager.createChallengeTierce ---------------------------------

/** Per-stage id set `createChallengeTierce` selects from the two configs. */
interface TierceStageParams {
    npcMonsterId: number;
    eventId: number;
    mazeGroupId: number;
    mapEntranceId: number;
}

/**
 * The `switch (stage_index)` of `createChallengeTierce`:
 * `0` node-1 ids, `1` node-2 ids (but node 1's maze group / entrance), `2` the
 * Tierce config's own ids; anything else leaves the scene coordinates untouched.
 */
function tierceStageParams(
    challengeConf: ChallengeRow,
    tierce: ChallengeTierceConfig,
    stageIndex: number,
): TierceStageParams | null {
    switch (stageIndex) {
        case 0:
            return {
                npcMonsterId: lastId(challengeConf.NpcMonsterIDList1),
                eventId: lastId(challengeConf.EventIDList1),
                mazeGroupId: challengeConf.MazeGroupID1,
                mapEntranceId: challengeConf.MapEntranceID,
            };
        case 1:
            return {
                npcMonsterId: lastId(challengeConf.NpcMonsterIDList2),
                eventId: lastId(challengeConf.EventIDList2),
                mazeGroupId: challengeConf.MazeGroupID1,
                mapEntranceId: challengeConf.MapEntranceID,
            };
        case 2:
            return {
                npcMonsterId: lastId(tierce.NpcMonsterIDList),
                eventId: lastId(tierce.EventIDList),
                mazeGroupId: challengeConf.MazeGroupID1,
                mapEntranceId: challengeConf.MapEntranceID,
            };
        default:
            return null;
    }
}

/**
 * `ChallengeManager.createChallengeTierce(challengeId, isSingleStage,
 * stageIndex, buffId, lineup) -> CurTierceChallenge`.
 *
 * QUIRK (reproduced): the challenge config is looked up by **challenge id minus
 * one** while the Tierce config is looked up by the id itself. The shipped tables
 * agree with that (`PreChallengeMazeID == ID - 1`), so the lookup is a straight
 * `get()` instead of the reference's nested double scan.
 */
export function createChallengeTierce(
    session: NetSession,
    challengeId: number,
    isSingleStage: boolean,
    stageIndex: number,
    buffId: number,
    lineup: any,
): any {
    const curTierce: any = {
        challengeId,
        isSingleStage,
        // `lineup_list` is repeated LineupInfo on the wire; the reference always
        // puts exactly one entry in it.
        lineupList: [lineup],
    };

    const challengeConf = session.config.getChallenge(challengeId - 1) as ChallengeRow | undefined;
    const tierce = session.config.getChallengeTierce(challengeId);
    if (!challengeConf || !tierce) return curTierce;

    const entrance = session.config.getEntrance(challengeConf.MapEntranceID);
    if (!entrance) return curTierce;

    for (const plane of matchingPlanes(session, entrance.FloorID)) {
        // The two id bands of a Tierce id (the shipped tierce ids are 5xxx, i.e.
        // neither) select a mode and append `[buff_id, maze_buff_id]`.
        if (isPureFiction(challengeId)) {
            addBlessings(session, [buffId, challengeConf.MazeBuffID ?? 0]);
            setChallengeMode(session, 1);
        } else if (isApocalypticShadow(challengeId)) {
            addBlessings(session, [buffId, challengeConf.MazeBuffID ?? 0]);
            setChallengeMode(session, 2);
        }

        const params = tierceStageParams(challengeConf, tierce, stageIndex);
        if (!params) continue;
        setChallengeInfo(
            session,
            entrance.FloorID,
            plane.WorldID,
            params.npcMonsterId,
            params.eventId,
            params.mazeGroupId,
            params.mazeGroupId,
            plane.PlaneID,
            params.mapEntranceId,
        );
    }

    return curTierce;
}

// ---- stage_map / saved_peak_lineups ----------------------------------------

/**
 * `SaveStageInfoList(challengeId, stageInfoList)`.
 *
 * Accepts either message that carries the list: `StartChallengeTierceCsReq`
 * (`lineup_tierce_list`) and `SetChallengeTierceLineupCsReq` are the same shape,
 * and each entry's roster field is `tierce_avatar_id_list` in this proto dump
 * (pearl-sr calls it `lineup`). The whole entry is overwritten, as `Map.put` does.
 */
export function saveStageInfoList(
    session: NetSession,
    challengeId: number,
    stageInfoList: any[],
): void {
    const stages: ChallengeStageInfo[] = (stageInfoList ?? []).map((info) => ({
        lineup: ((info?.tierceAvatarIdList ?? info?.lineup ?? []) as any[]).map(
            (avatar: any) => avatar?.id ?? 0,
        ),
        buffId: info?.buffId ?? 0,
    }));
    challengeState(session).stageMap.set(challengeId, stages);
}

/**
 * `LoadStageInfo(challengeId, stageIndex)` — REPLACES the roster (the only place
 * besides the reset that clears it) and the selected buff id.
 *
 * An unknown challenge id falls back to `[1508]`/`[1509]`/`[1510]`; a stage index
 * outside the saved list (or above 2 for an unknown id) changes nothing at all.
 */
export function loadStageInfo(session: NetSession, challengeId: number, stageIndex: number): void {
    const state = challengeState(session);
    const stages = state.stageMap.get(challengeId);

    if (!stages) {
        const defaults = TIERCE_DEFAULT_ROSTERS[stageIndex];
        if (!defaults) return;
        state.avatarIds = [...defaults];
        state.buffId = 0;
        return;
    }

    if (stageIndex >= stages.length) return;
    const stage = stages[stageIndex];
    state.avatarIds = [...stage.lineup];
    state.buffId = stage.buffId;
}

/** `SavePeakLineup(peak_id, list)` — a plain overwrite per peak id. */
export function savePeakLineup(session: NetSession, peakId: number, avatarIds: number[]): void {
    challengeState(session).savedPeakLineups.set(peakId, [...avatarIds]);
}

/** `LoadPeakLineup(peak_id)` — appends the saved roster, or is a no-op. */
export function loadPeakLineup(session: NetSession, peakId: number): void {
    const saved = challengeState(session).savedPeakLineups.get(peakId);
    if (saved) appendChallengeAvatars(session, saved);
}

// ---- config helpers used by the handlers ------------------------------------

/** `challenge_peak_group` rows joined with their boss config, in file order. */
export function peakGroupsWithBoss(session: NetSession): Array<{
    group: ChallengePeakGroupConfig;
    boss: ChallengePeakBossConfig;
}> {
    const bossById = new Map<number, ChallengePeakBossConfig>();
    for (const boss of session.config.challengePeakBossConfig.values()) bossById.set(boss.ID, boss);

    const out: Array<{ group: ChallengePeakGroupConfig; boss: ChallengePeakBossConfig }> = [];
    for (const group of session.config.challengePeakGroupConfig.values()) {
        const boss = bossById.get(group.BossLevelID);
        // Groups whose boss level has no config row are skipped (the reference's
        // `if (boss_map.get(...)) |boss|` guard).
        if (boss) out.push({ group, boss });
    }
    return out;
}
