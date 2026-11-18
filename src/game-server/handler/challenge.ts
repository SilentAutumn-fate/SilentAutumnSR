import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import type { HandlerEntry } from './types';
import { PositionJson, SceneJson } from '../../data/loadDataInGame';
import { buildLineup as buildMainLineup } from '../manager/avatar_mgr';
import {
    collectEntityIds,
    collectMonsterEvents,
    createChallengeScene,
    createPeakScene,
    createScene,
    getAnchorMotion,
    leaderMotion,
} from '../manager/scene_mgr';
import {
    appendChallengeAvatars,
    challengeAvatarIds,
    challengeBuffId,
    challengeMode,
    challengePeakSceneIds,
    challengeSceneIds,
    createChallenge,
    createChallengeLineup,
    createChallengePeak,
    createChallengeTierce,
    createPeakLineup,
    currentChallengeId,
    enterChallengeMode,
    isApocalypticShadow,
    isChallengeMode,
    isPureFiction,
    loadPeakLineup,
    loadStageInfo,
    peakGroupsWithBoss,
    resetChallengeState,
    savePeakLineup,
    saveStageInfoList,
    setChallengeBuffId,
    setChallengeId,
    setChallengePeakHard,
    setPeakKingStage,
} from '../manager/challenge_mgr';
import {
    getCustomBuffId,
    getCustomChallengeId,
    isCustomMode,
    isFirstChallengeNode,
} from '../scene/commands/value';

/**
 * Challenge service — port of pearl-sr's `gameserver/src/services/challenge.zig`
 * (all nineteen handlers, see `docs/spec-battle-challenge.md` §14).
 *
 * The state these handlers read and write lives in `manager/challenge_mgr.ts`
 * (the port of `Logic.Challenge()` + `ChallengeManager`); nothing durable is
 * persisted by the reference, so nothing here writes a save file except where a
 * scene change has to survive a reconnect (marked `DEVIATION` below).
 *
 * Notifies, not responses, are the interesting part of this module — the exact
 * order differs per handler and is documented at each one:
 *
 *   §14.3–§14.5  QuitBattle, EnterSceneByServer, then the rsp
 *   §14.6        the rsp, then one SceneEntityMove per actor
 *   §14.12       EnterSceneByServer, the actor moves, then the rsp
 *   §14.15       ChallengePeakGroupDataUpdate, then the rsp
 *   §14.18       the actor moves, then the rsp
 *   §14.19+      (everything else is a plain request/response)
 */

/** `AvatarType_AvatarFormalType` / `AvatarType_AvatarUpgradeAvailableType`. */
const AVATAR_FORMAL_TYPE = 3;
const AVATAR_UPGRADE_AVAILABLE_TYPE = 6;
/** `BattleEndStatus.BATTLE_END_WIN` — the only status the tierce showcase sends. */
const BATTLE_END_WIN = 1;
/** `EnterSceneReason.ENTER_SCENE_REASON_NONE`. */
const ENTER_SCENE_REASON_NONE = 0;

// ---- fixed values from the reference (§14.1, §14.3–§14.5, §14.9, §14.11) ----

/** §14.1: every challenge reports 7 stars, 42 taken rewards and a maxed level. */
const SHOWCASE_STARS = 7;
const SHOWCASE_TAKEN_REWARD = 42;
const SHOWCASE_MAX_LEVEL = 12;
const SHOWCASE_REWARD_DISPLAY_TYPE = 101212;
/** §14.1: the "story"/"boss" bands (id > 20000) get a level-4 history instead. */
const STORY_MAX_LEVEL = 4;
const STORY_REWARD_DISPLAY_TYPE = 101404;
/** §14.1/§14.9(the 4000 quirk)/§14.7: the Pure Fiction showcase score. */
const PF_SCORE_ID = 40000;
/** §14.9: the Apocalyptic Shadow showcase score — 4000, NOT 40000. */
const AS_SCORE_ID = 4000;
/** §14.8 star reward. */
const REWARD_STARS_MOC = 36;
const REWARD_STARS_STORY = 12;
/** §14.9: three synthetic stages per tierce, avatar ids 1508..1510. */
const TIERCE_STAGE_COUNT = 3;
const TIERCE_TRAILER_AVATAR_ID = 1508;
/** §14.11: the Peak showcase. */
const PEAK_TARGET_KING = [3003, 3004, 3005];
const PEAK_STAR_REWARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PEAK_SHOWCASE_AVATARS = [1508];
const PEAK_COUNT_OF_PEAKS = 3;
const PEAK_OBTAINED_STARS = 9;
/** §14.15: the same two numbers on the partial group update. */
const PEAK_UPDATE_COUNT_OF_PEAKS = 3;
const PEAK_UPDATE_OBTAINED_STARS = 9;
/** §14.17: the one fake avatar every battle record is built from. */
const FRIEND_RECORD_AVATAR_ID = 1508;
const FRIEND_RECORD_AVATAR_LEVEL = 80;

/** §14.3/§14.4: the fixed exit scene (plane, floor, entry, teleport). */
const LEAVE_SCENE: [number, number, number, number] = [20503, 20503001, 2050301, 1029];
/** §14.5: the exit scene per `challenge_mode` (plane, floor, entry, teleport). */
const LEAVE_TIERCE_SCENES: [number, number, number, number][] = [
    [10000, 10000000, 100000104, 2206], // 0 = MOC / legacy
    [10202, 10202001, 102020107, 0], // 1 = Pure Fiction
    [10304, 10304001, 1030402, 0], // anything else (2 = Apocalyptic Shadow)
];

/**
 * OBFUSCATED COMMAND NAMES — READ THIS BEFORE "FIXING" THEM.
 *
 * The 4.5.54 proto ships four of this module's messages under obfuscated names,
 * and `CmdId.json` carries both the readable and the obfuscated alias for the
 * same id. `NetSession` picks whichever name resolves to a real protobuf type,
 * so at runtime:
 *
 *   CmdGetChallengeTierceDataScRsp        (8994) == CmdHFGMOFBDAON
 *   CmdGetChallengeTierceControllerScRsp  (8982) == CmdLPIHJBELIBN
 *   CmdSetChallengeTierceLineupScRsp      (8999) == CmdGGCBEKKJCJN
 *
 * `dev/tools/check-proto-fields.js` derives the protobuf type from the *command
 * name* written in the call, so returning a `sendRsp(CmdID.CmdGetChallengeTierce
 * DataScRsp, …)` here would make it report "no protobuf message named
 * GetChallengeTierceDataScRsp" and fail the build. Naming the alias instead keeps
 * that check meaningful: the field names below are validated against
 * `HFGMOFBDAON` / `LPIHJBELIBN` / `GGCBEKKJCJN`, which is what actually goes on
 * the wire. (The requests need no alias: they decode through the same rule.)
 */

// ---- shared helpers ---------------------------------------------------------

/** The `id` of every `AvatarLineup` in a request list, order preserved. */
function lineupIds(list: any[] | undefined): number[] {
    return (list ?? []).map((avatar) => avatar?.id ?? 0);
}

/** `SceneInfo.entity_group_list[*].entity_list` flattened. */
function sceneEntities(sceneInfo: any): any[] {
    const out: any[] = [];
    for (const group of sceneInfo?.entityGroupList ?? []) {
        for (const entity of group?.entityList ?? []) out.push(entity);
    }
    return out;
}

/**
 * `ChallengeSceneManager.getAnchorMotion` + the per-actor notify loop shared by
 * §14.6, §14.12 and §14.18.
 *
 * Only *actor* entities move (the reference tests the `entity` oneof). In this
 * proto the generated decoder/encoder reads that oneof **flat**, so the test is
 * `entity.actor` — `entity.entity.actor` would silently match nothing.
 * `client_pos_version` stays 0, as in the reference.
 */
async function sendActorMotions(session: NetSession, sceneInfo: any): Promise<void> {
    const motion = getAnchorMotion(sceneInfo?.entryId ?? 0);
    if (!motion) return;

    for (const entity of sceneEntities(sceneInfo)) {
        if (!entity?.actor) continue;
        await session.sendMessage(CmdID.CmdSceneEntityMoveScNotify, {
            entityId: entity.entityId,
            entryId: sceneInfo.entryId,
            motion,
        });
    }
}

/**
 * Keep `session.scene` (and, when `persist`, the save file) in step with the
 * scene we just handed the client.
 *
 * DEVIATION: pearl-sr keeps no per-connection scene at all. The scene module
 * stores what it last sent so `GetCurSceneInfo` can reproduce it, and a challenge
 * fight replaces the scene just as `EnterScene` does, so the in-memory copy is
 * updated for every challenge scene. Only the three Leave handlers *persist*
 * (`persist: true`): they are the handlers that decide where the player stands
 * outside a challenge, whereas the challenge state itself is per-connection and
 * gone after a reconnect — a save pointing into a challenge room nobody is
 * fighting in would be worse than useless.
 */
async function rememberScene(
    session: NetSession,
    sceneInfo: any,
    planeId: number,
    floorId: number,
    entryId: number,
    persist: boolean,
): Promise<void> {
    session.scene = {
        planeId,
        floorId,
        entryId,
        leaderEntityId: sceneInfo?.leaderEntityId ?? 0,
        gameModeType: sceneInfo?.gameModeType ?? 1,
        entityIds: collectEntityIds(sceneInfo),
        monsterEvents: collectMonsterEvents(sceneInfo),
    };
    if (!persist) return;

    // Only remember a real challenge room. A malformed request (challenge id 0)
    // resolves to a degenerate entry, and saving that would strand the player in
    // a room they never entered after a restart.
    const dataInGame = session.data.getDataInGame();
    if (!planeId || !entryId || !session.challengeId) return;
    dataInGame.scene = new SceneJson(planeId, floorId, entryId);
    const spawn = leaderMotion(sceneInfo);
    dataInGame.position = spawn?.pos
        ? new PositionJson(
              spawn.pos.x ?? 0,
              spawn.pos.y ?? 0,
              spawn.pos.z ?? 0,
              spawn.rot?.y ?? 0,
          )
        : new PositionJson(0, 0, 0, 0);
    await session.data.saveDataInGame();
}

/**
 * The body §14.3/§14.4/§14.5 share: rebuild the main line-up and a plain scene,
 * tell the client the battle is over and that it is being moved, reset the
 * challenge state, then answer.
 *
 * Order matters and is the reference's: `QuitBattleScNotify` first, then
 * `EnterSceneByServerScNotify`, then `resetChallengeState()`, then the response.
 */
async function leaveChallenge(
    session: NetSession,
    scene: [number, number, number, number],
    responseCmdId: number,
): Promise<void> {
    const [planeId, floorId, entryId, teleportId] = scene;
    // The reference calls `LineupManager.createLineup()` here, which ALSO
    // rewrites the battle roster (`selectedAvatarID`); our main-lineup builder is
    // `avatar_mgr.buildLineup`, the port's equivalent of that call.
    const lineup = buildMainLineup(session);
    const avatarIds = (lineup.avatarList ?? []).map((avatar: any) => avatar.id);
    const sceneInfo = createScene(planeId, floorId, entryId, teleportId, avatarIds);

    await session.sendMessage(CmdID.CmdQuitBattleScNotify, {});
    await session.sendMessage(CmdID.CmdEnterSceneByServerScNotify, {
        reason: ENTER_SCENE_REASON_NONE,
        lineup,
        scene: sceneInfo,
    });

    // The battle the client was in is over; drop the shared battle context too.
    session.battle = null;
    resetChallengeState(session);

    await session.sendRsp(responseCmdId, { retcode: 0 });
    await rememberScene(session, sceneInfo, planeId, floorId, entryId, true);
}

// ---- §14.1 / §14.2: the challenge list and its statistics -------------------

/** 1734 -> 1725. A static "everything cleared" showcase, in config file order. */
export async function onGetChallengeCsReq(_req: unknown, session: NetSession): Promise<void> {
    const challengeList: any[] = [];
    const maxLevelList: any[] = [];

    for (const challengeConf of session.config.challengeConfig.values()) {
        const challenge: any = {
            challengeId: challengeConf.ID,
            star: SHOWCASE_STARS, // hard-coded
            takenReward: SHOWCASE_TAKEN_REWARD, // hard-coded
            scoreId: 0,
            scoreTwo: 0,
        };
        const history: any = {
            level: SHOWCASE_MAX_LEVEL,
            rewardDisplayType: SHOWCASE_REWARD_DISPLAY_TYPE,
        };

        if (challengeConf.ID > 20000) {
            history.level = STORY_MAX_LEVEL;
            history.rewardDisplayType = STORY_REWARD_DISPLAY_TYPE;
            if (challengeConf.ID < 30000) {
                // Pure Fiction: both score fields carry the mode's fake score.
                challenge.scoreId = PF_SCORE_ID;
                challenge.scoreTwo = PF_SCORE_ID;
            }
        }

        maxLevelList.push(history);
        challengeList.push(challenge);
    }

    // `challenge_list[i]` and `max_level_list[i]` are index-aligned; the group
    // list and `KKIAFPFKLGE` are never filled.
    await session.sendRsp(CmdID.CmdGetChallengeScRsp, { retcode: 0, challengeList, maxLevelList });
}

/** 1721 -> 1712. A pure echo: every statistics submessage is left empty. */
export async function onGetChallengeGroupStatisticsCsReq(
    req: any,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetChallengeGroupStatisticsScRsp, {
        retcode: 0,
        groupId: req?.groupId ?? 0,
    });
}

// ---- §14.3 / §14.4 / §14.5: leaving ----------------------------------------

/** 1760 -> 1716, preceded by QuitBattleScNotify (183) and EnterSceneByServer (1427). */
export async function onLeaveChallengeCsReq(_req: unknown, session: NetSession): Promise<void> {
    await leaveChallenge(session, LEAVE_SCENE, CmdID.CmdLeaveChallengeScRsp);
}

/** 8929 -> 8932. Identical to §14.3, only the response id differs. */
export async function onLeaveChallengePeakCsReq(_req: unknown, session: NetSession): Promise<void> {
    await leaveChallenge(session, LEAVE_SCENE, CmdID.CmdLeaveChallengePeakScRsp);
}

/**
 * 8998 -> 8997. The exit plane is chosen by the **current** `challenge_mode`,
 * read before the reset — so the *previous* challenge decides where the player
 * lands (0 MOC / 1 PF / else AS).
 */
export async function onLeaveChallengeTierceCsReq(_req: unknown, session: NetSession): Promise<void> {
    // Read BEFORE `resetChallengeState()` clears it (that happens inside
    // `leaveChallenge`), so the previous challenge decides the exit plane.
    const mode = challengeMode(session);
    const scene = LEAVE_TIERCE_SCENES[mode] ?? LEAVE_TIERCE_SCENES[2];
    await leaveChallenge(session, scene, CmdID.CmdLeaveChallengeTierceScRsp);
}

// ---- §14.6 / §14.7: the MOC-PF-AS challenge ---------------------------------

/**
 * 1705 -> 1775, then one `SceneEntityMoveScNotify` (1442) per actor.
 *
 * HAZARD (reproduced): the roster is append-only. Two Start requests without a
 * Leave in between produce a doubled roster, the scene gets one actor entity per
 * entry, and the line-up handed to the client lists every id — the reference's
 * `buildLineup` only truncates the *battle* roster to four, never this list.
 */
export async function onStartChallengeCsReq(req: any, session: NetSession): Promise<void> {
    if (isCustomMode(session)) {
        // `/id …` selected the challenge: the request's ids are ignored.
        setChallengeId(session, getCustomChallengeId(session));
        setChallengeBuffId(session, getCustomBuffId(session));
        const list = isFirstChallengeNode(session)
            ? req?.avatarLineupFirst
            : req?.avatarLineupSecond;
        appendChallengeAvatars(session, lineupIds(list));
    } else {
        const challengeId = req?.challengeId ?? 0;
        setChallengeId(session, challengeId);

        // `req.stage_info` is an unchecked optional unwrap in the reference (the
        // Zig panics when the client omits it, so it cannot run at all then).
        // We use the buff the message carries, 0 when the submessage is missing,
        // and leave the previous value untouched when `stage_info` is absent.
        const stageInfo = req?.stageInfo;

        if (isFirstChallengeNode(session)) {
            appendChallengeAvatars(session, lineupIds(req?.avatarLineupFirst));
            if (stageInfo) {
                if (isPureFiction(challengeId)) {
                    setChallengeBuffId(session, stageInfo.storyInfo?.buffOne ?? 0);
                }
                if (isApocalypticShadow(challengeId)) {
                    setChallengeBuffId(session, stageInfo.bossInfo?.buffOne ?? 0);
                }
            }
        } else {
            appendChallengeAvatars(session, lineupIds(req?.avatarLineupSecond));
            if (stageInfo) {
                if (isPureFiction(challengeId)) {
                    setChallengeBuffId(session, stageInfo.storyInfo?.buffTwo ?? 0);
                }
                if (isApocalypticShadow(challengeId)) {
                    setChallengeBuffId(session, stageInfo.bossInfo?.buffTwo ?? 0);
                }
            }
        }
    }

    const roster = challengeAvatarIds(session);
    const lineupInfo = createChallengeLineup(session, roster);
    // `createChallenge` also writes the challenge scene coordinates, appends the
    // blessings and sets the sticky challenge mode.
    const curChallenge = createChallenge(session, currentChallengeId(session), challengeBuffId(session));

    const ids = challengeSceneIds(session);
    const sceneInfo = createChallengeScene(
        roster,
        ids[0], // plane
        ids[1], // floor
        ids[2], // entry
        ids[3], // world
        ids[4], // monster
        ids[5], // event  (= stage id)
        ids[6], // group  (ids[7], the maze group, is NOT passed)
    );

    // SetChallenge() BEFORE the rsp: a re-entrant GetCurBattleInfo would already
    // answer in challenge mode.
    enterChallengeMode(session);
    session.challengeId = currentChallengeId(session);

    await session.sendRsp(CmdID.CmdStartChallengeScRsp, {
        retcode: 0,
        scene: sceneInfo,
        curChallenge,
        lineupList: [lineupInfo],
    });

    await sendActorMotions(session, sceneInfo);
    // In-memory only: the challenge state is per-connection, so a persisted
    // challenge room would outlive the challenge that owns it (see rememberScene).
    await rememberScene(session, sceneInfo, ids[0], ids[1], ids[2], false);
}

/**
 * 1715 -> 1742. The reference's handler name (`onGetCurChallengeScRsp`) is
 * misleading — it is registered for the *request* id.
 */
export async function onGetCurChallengeCsReq(_req: unknown, session: NetSession): Promise<void> {
    // Both objects are built unconditionally, so `createChallenge`'s side effects
    // happen even when no challenge is running.
    const lineupInfo = createChallengeLineup(session, challengeAvatarIds(session));
    const curChallenge = createChallenge(
        session,
        currentChallengeId(session),
        challengeBuffId(session),
    );

    const rsp: any = { retcode: 0 };
    if (isChallengeMode(session)) {
        rsp.curChallenge = curChallenge;
        rsp.lineupList = [lineupInfo];
    } else {
        console.log('NOT ON CHALLENGE');
    }

    await session.sendRsp(CmdID.CmdGetCurChallengeScRsp, rsp);
}

// ---- §14.8: the cumulative reward (a pure showcase) -------------------------

/**
 * 1768 -> 1764. The request is the *cumulative reward* message despite the
 * reference's `onTakeChallengeReward` name. No item is granted and no
 * bookkeeping is stored — the "42 taken" of §14.1 stays static.
 */
export async function onTakeChallengeCumulativeRewardCsReq(
    req: any,
    session: NetSession,
): Promise<void> {
    const groupId = req?.groupId ?? 0;
    await session.sendRsp(CmdID.CmdTakeChallengeCumulativeRewardScRsp, {
        retcode: 0,
        groupId,
        takenRewardList: [
            {
                starCount: groupId > 2000 ? REWARD_STARS_STORY : REWARD_STARS_MOC,
                // `reward` (an ItemList) is never filled.
            },
        ],
    });
}

// ---- §14.9: Starward Mode (tierce) data ------------------------------------

/**
 * `ChallengeTargetID` is an array in the JSON but the shared `ConfigManager`
 * interface declares a scalar; like the command module reads `Floor`, this is
 * read through an alias instead of editing the shared file (see the final
 * report). The double cast is required because the declared scalar and the real
 * array do not overlap.
 */
type TierceRow = { ChallengeTargetID?: number[]; ChallengeTierceTargetID?: number };

/** 4.7: 8995 -> 8996. A static "all stages cleared" showcase. */
export async function onGetChallengeTierceDataCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    const challengeInfoList: any[] = [];

    for (const info of session.config.challengeTierceConfig.values()) {
        const targets = (info as unknown as TierceRow).ChallengeTargetID ?? [];
        const data: any = {
            challengeId: info.ID,
            FCJGHHILDEK: true, // is_passed
            // Order matters: the tierce target goes LAST, after every target id.
            finishedTargetList: [
                ...(Array.isArray(targets) ? targets : []),
                info.ChallengeTierceTargetID,
            ],
            // result_list / stage_info_list (PMMOFOBCINL / CMOPLAHDEPN); the
            // record submessage is never filled.
            HGKCEEOONGA: [],
            MOGEEAJCFNO: [],
        };

        // The AS band uses 4000 here, NOT the 40000 of the PF band.
        const scoreId = isPureFiction(info.ID)
            ? PF_SCORE_ID
            : isApocalypticShadow(info.ID)
              ? AS_SCORE_ID
              : 0;

        for (let index = 0; index < TIERCE_STAGE_COUNT; index++) {
            data.HGKCEEOONGA.push({
                endStatus: BATTLE_END_WIN, // hard-coded
                stageIndex: index,
                scoreId,
                // battle_target_list / lineup are never filled.
            });
            data.MOGEEAJCFNO.push({
                stageIndex: index,
                // `tierce_avatar_id_list` is this proto's name for the repeated
                // AvatarLineup the reference writes 1508 + stage_index into.
                tierceAvatarIdList: [
                    {
                        id: TIERCE_TRAILER_AVATAR_ID + index,
                        avatarType: AVATAR_FORMAL_TYPE,
                        assistUid: 0,
                    },
                ],
                buffId: 0,
                // peak_avatar_id_list is never written.
            });
        }

        challengeInfoList.push(data);
    }

    await session.sendRsp(CmdID.CmdGetChallengeTierceDataScRsp, {
        retcode: 0,
        challengeInfoList,
    });
}

// ---- §14.10: no current Peak run -------------------------------------------

/** 8948 -> 8914. A hard-coded "no peak in progress" reply; nothing is read. */
export async function onGetCurChallengePeakCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetCurChallengePeakScRsp, {
        retcode: 0,
        bossBuffId: 0,
        peakId: 0,
        hasPassed: false,
    });
}

// ---- §14.11: Anomaly Arbitration data --------------------------------------

/** 8934 -> 8906. The Peak showcase: every group reports a cleared hard mode. */
export async function onGetChallengePeakDataCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    const challengePeakGroups: any[] = [];
    let currentPeakGroupId = 0;

    for (const { group, boss } of peakGroupsWithBoss(session)) {
        // `boss.BuffList[0]` is an unchecked index in the reference: a boss with
        // an empty list crashes it. 0 is the proto default and cannot crash us.
        const buffId = (boss.BuffList ?? [])[0] ?? 0;

        challengePeakGroups.push({
            peakGroupId: group.ID,
            // Fresh copies per group: the reference aliases ONE list across every
            // group, which is unrepresentable (and pointless) in TS.
            takenStarRewards: [...PEAK_STAR_REWARDS],
            countOfPeaks: PEAK_COUNT_OF_PEAKS,
            obtainedStars: PEAK_OBTAINED_STARS,
            peaks: [], // never filled
            peakBoss: {
                finishedTargetList: [...PEAK_TARGET_KING],
                hardModeHasPassed: true,
                hardMode: {
                    hasPassed: true,
                    bestCycleCount: 0,
                    buffId,
                    peakAvatarIdList: [...PEAK_SHOWCASE_AVATARS],
                    LAMPCACOCHP: [...PEAK_SHOWCASE_AVATARS],
                    EBNNJAEPBGD: [],
                    // DJFGDMIDEHJ / NHOJDHPGBBO stay 0.
                },
                // easy_mode (8) and BFBHCKEJDIG (12) are never filled.
            },
            // disable_hard_mode / wait_confirm_data / PAPDCCKPEPK stay unset.
        });

        // LAST matching group wins.
        currentPeakGroupId = group.ID;
    }

    await session.sendRsp(CmdID.CmdGetChallengePeakDataScRsp, {
        retcode: 0,
        challengePeakGroups,
        currentPeakGroupId,
    });
}

// ---- §14.12: starting a Peak fight -----------------------------------------

/**
 * 8920 -> 8931. Notify FIRST, response LAST — the opposite of §14.6.
 *
 * The response carries only `retcode`: the reference assigns
 * `createChallengePeak`'s (void) result to a `CurChallenge` it never sends, so no
 * Peak challenge information ever reaches the client.
 */
export async function onStartChallengePeakCsReq(req: any, session: NetSession): Promise<void> {
    const peakAvatarIdList: number[] = req?.peakAvatarIdList ?? [];

    if (peakAvatarIdList.length !== 0) {
        // A boss line-up: `challenge_peak_hard` defaults to true, so this is hard
        // mode unless the client first called §14.16 with is_hard_mode = false.
        setPeakKingStage(session, true);
        appendChallengeAvatars(session, peakAvatarIdList);
    } else {
        setPeakKingStage(session, false);
        // Appends the saved line-up if there is one; otherwise a NO-OP, so the
        // previous challenge's roster is reused (the roster is never cleared).
        loadPeakLineup(session, req?.peakId ?? 0);
    }

    const roster = challengeAvatarIds(session);
    const lineupInfo = createPeakLineup(session, roster);
    createChallengePeak(session, req?.peakId ?? 0, req?.bossBuffId ?? 0);

    const ids = challengePeakSceneIds(session);
    const sceneInfo = createPeakScene(
        roster,
        ids[0], // plane
        ids[1], // floor
        ids[2], // entry
        ids[3], // monster
        ids[4], // event  (= stage id, +1 in hard mode)
        ids[5], // group  (ids[6], the maze group, is NOT passed)
    );

    await session.sendMessage(CmdID.CmdEnterSceneByServerScNotify, {
        reason: ENTER_SCENE_REASON_NONE,
        lineup: lineupInfo,
        scene: sceneInfo,
    });

    enterChallengeMode(session); // AFTER the notify
    session.challengePeakId = req?.peakId ?? 0;

    await sendActorMotions(session, sceneInfo);
    await session.sendRsp(CmdID.CmdStartChallengePeakScRsp, { retcode: 0 });
    await rememberScene(session, sceneInfo, ids[0], ids[1], ids[2], false);
}

// ---- §14.13 / §14.14: stubs -------------------------------------------------

/** 4.7: 8995 -> 8996. Starward Mode's controller pane is always empty. */
export async function onGetChallengeTierceControllerCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetChallengeTierceControllerScRsp, { retcode: 0 });
}

/** 8947 -> 8925. No state change at all: retrying does not rebuild anything. */
export async function onReStartChallengePeakCsReq(_req: unknown, session: NetSession): Promise<void> {
    await session.sendRsp(CmdID.CmdReStartChallengePeakScRsp, { retcode: 0 });
}

// ---- §14.15 / §14.16: Peak line-ups and hard mode --------------------------

/**
 * 8918 -> 8938, preceded by `ChallengePeakGroupDataUpdateScNotify` (8911).
 *
 * The notify carries a *partial* group (no `taken_star_rewards`, no `peak_boss`)
 * which the client merges into its cached copy.
 */
export async function onSetChallengePeakMobLineupAvatarCsReq(
    req: any,
    session: NetSession,
): Promise<void> {
    const update: any = {
        peakGroupId: req?.peakGroupId ?? 0,
        countOfPeaks: PEAK_UPDATE_COUNT_OF_PEAKS,
        obtainedStars: PEAK_UPDATE_OBTAINED_STARS,
        peaks: [],
    };

    for (const list of req?.lineupList ?? []) {
        const peakId = list?.peakId ?? 0;
        const peakAvatarIdList: number[] = list?.peakAvatarIdList ?? [];
        update.peaks.push({
            peakId,
            peakAvatarIdList,
            finishedTargetList: [],
            hasPassed: false,
            peakBuildList: [],
            cyclesUsed: 0,
        });
        // Map.set semantics: an existing entry is overwritten.
        savePeakLineup(session, peakId, peakAvatarIdList);
    }

    await session.sendMessage(CmdID.CmdChallengePeakGroupDataUpdateScNotify, {
        challengePeakGroup: update,
    });
    await session.sendRsp(CmdID.CmdSetChallengePeakMobLineupAvatarScRsp, { retcode: 0 });
}

/**
 * 8940 -> 8908. Both request fields are echoed; `is_hard_mode` is sticky and
 * feeds `CalChallengePeakEventID` (event id + 1) and the blessing choice of
 * §14.12. It survives `resetChallengeState`.
 */
export async function onSetChallengePeakBossHardModeCsReq(
    req: any,
    session: NetSession,
): Promise<void> {
    const isHardMode = !!req?.isHardMode;
    setChallengePeakHard(session, isHardMode);
    await session.sendRsp(CmdID.CmdSetChallengePeakBossHardModeScRsp, {
        retcode: 0,
        isHardMode,
        peakGroupId: req?.peakGroupId ?? 0,
    });
}

// ---- §14.17: a friend's battle record --------------------------------------

/** 2953 -> 2944. One fake avatar per group, level 80, `AVATAR_UPGRADE_AVAILABLE_TYPE`. */
export async function onGetFriendBattleRecordDetailCsReq(
    req: any,
    session: NetSession,
): Promise<void> {
    const records: any[] = [];

    for (const { group, boss } of peakGroupsWithBoss(session)) {
        // `boss.BuffList[0]` is unchecked in the reference; 0 is the safe default.
        const buffId = (boss.BuffList ?? [])[0] ?? 0;
        records.push({
            groupId: group.ID,
            CDFFIGJLGMM: {
                buffId,
                peakId: group.BossLevelID,
                HAMDKIHGKGO: true,
                CFLDOMPACKI: true,
                MCJNLLBBDHN: [],
                // Fresh list per group — the reference aliases one shared list.
                lineup: {
                    avatarList: [
                        {
                            level: FRIEND_RECORD_AVATAR_LEVEL,
                            index: 0,
                            id: FRIEND_RECORD_AVATAR_ID,
                            avatarType: AVATAR_UPGRADE_AVAILABLE_TYPE,
                            MDOJNENGCFE: 0,
                        },
                    ],
                },
                // DJFGDMIDEHJ (7) and best_cycle_count (13) stay 0.
            },
            HDCHFBKDCEB: [], // mob records are never filled
        });
    }

    await session.sendRsp(CmdID.CmdGetFriendBattleRecordDetailScRsp, {
        retcode: 0,
        uid: req?.uid ?? 0,
        LGIBJLFBFCG: records,
        // BAMDEHAICDA / EPNLMHPCDKL / HCIEFEHCENO stay unset.
    });
}

// ---- §14.18 / §14.19: Starward Mode (tierce) --------------------------------

/**
 * 8983 -> 8973. The per-actor move notifies are sent BEFORE the response (like
 * §14.12, unlike §14.6) and there is no `EnterSceneByServer` notify at all.
 *
 * NOTE: the response has no `lineup_list` field — the line-up rides inside
 * `cur_tierce_challenge.lineup_list`. `stage_index` is left unset in
 * `cur_tierce_challenge` exactly as the reference leaves the field untouched.
 */
export async function onStartChallengeTierceCsReq(req: any, session: NetSession): Promise<void> {
    const challengeId = req?.challengeId ?? 0;
    const isSingleStage = !!req?.isSingleStage;
    const stageIndex = req?.stageIndex ?? 0;

    console.log(
        `REQ CHALLENGE ID: ${challengeId}, IS SINGLE STAGE: ${isSingleStage}, ` +
            `STAGE INDEX: ${stageIndex}`,
    );

    setChallengeId(session, challengeId);
    if (isSingleStage === false) {
        saveStageInfoList(session, challengeId, req?.stageInfoList ?? []);
    }
    // REPLACES the roster and the selected buff id (or does nothing at all).
    loadStageInfo(session, challengeId, stageIndex);

    const roster = challengeAvatarIds(session);
    const lineupInfo = createChallengeLineup(session, roster);
    const curTierce = createChallengeTierce(
        session,
        challengeId,
        isSingleStage,
        stageIndex,
        challengeBuffId(session),
        lineupInfo,
    );

    const ids = challengeSceneIds(session);
    const sceneInfo = createChallengeScene(
        roster,
        ids[0], // plane
        ids[1], // floor
        ids[2], // entry
        ids[3], // world
        ids[4], // monster
        ids[5], // event  (= stage id)
        ids[6], // group  (ids[7], the maze group, is NOT passed)
    );

    enterChallengeMode(session);
    session.challengeId = challengeId;
    session.challengeTierceId = challengeId;

    await sendActorMotions(session, sceneInfo);
    await session.sendRsp(CmdID.CmdStartChallengeTierceScRsp, {
        retcode: 0,
        scene: sceneInfo,
        curTierceChallenge: curTierce,
    });
    await rememberScene(session, sceneInfo, ids[0], ids[1], ids[2], false);
}

/**
 * 4.7: 8992 -> 8979. Only the saved stage map changes; the roster and the buff
 * id are loaded later, by §14.18.
 */
export async function onSetChallengeTierceLineupCsReq(req: any, session: NetSession): Promise<void> {
    saveStageInfoList(session, req?.challengeId ?? 0, req?.stageInfoList ?? []);
    await session.sendRsp(CmdID.CmdSetChallengeTierceLineupScRsp, { retcode: 0 });
}

// ---- registry ---------------------------------------------------------------

/**
 * The nineteen challenge handlers, in `handlers.zig` order.
 *
 * `CmdGetChallengeTierceDataScRsp` (8994), `CmdGetChallengeTierceControllerScRsp`
 * (8982) and `CmdSetChallengeTierceLineupScRsp` (8999) had no readable protobuf
 * message in the 4.5.54 dump; the 4.7 dump names all three and renumbers them to
 * 8996 / 8981 / 8979, so the readable spellings are used throughout now.
 */
export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetChallengeCsReq, action: onGetChallengeCsReq },
    { cmdId: CmdID.CmdGetChallengeGroupStatisticsCsReq, action: onGetChallengeGroupStatisticsCsReq },
    { cmdId: CmdID.CmdStartChallengeCsReq, action: onStartChallengeCsReq },
    { cmdId: CmdID.CmdLeaveChallengeCsReq, action: onLeaveChallengeCsReq },
    { cmdId: CmdID.CmdLeaveChallengePeakCsReq, action: onLeaveChallengePeakCsReq },
    { cmdId: CmdID.CmdLeaveChallengeTierceCsReq, action: onLeaveChallengeTierceCsReq },
    { cmdId: CmdID.CmdGetCurChallengeCsReq, action: onGetCurChallengeCsReq },
    { cmdId: CmdID.CmdGetChallengePeakDataCsReq, action: onGetChallengePeakDataCsReq },
    { cmdId: CmdID.CmdGetChallengeTierceControllerCsReq, action: onGetChallengeTierceControllerCsReq },
    { cmdId: CmdID.CmdGetCurChallengePeakCsReq, action: onGetCurChallengePeakCsReq },
    {
        cmdId: CmdID.CmdTakeChallengeCumulativeRewardCsReq,
        action: onTakeChallengeCumulativeRewardCsReq,
    },
    { cmdId: CmdID.CmdStartChallengePeakCsReq, action: onStartChallengePeakCsReq },
    { cmdId: CmdID.CmdReStartChallengePeakCsReq, action: onReStartChallengePeakCsReq },
    {
        cmdId: CmdID.CmdSetChallengePeakMobLineupAvatarCsReq,
        action: onSetChallengePeakMobLineupAvatarCsReq,
    },
    {
        cmdId: CmdID.CmdSetChallengePeakBossHardModeCsReq,
        action: onSetChallengePeakBossHardModeCsReq,
    },
    { cmdId: CmdID.CmdGetFriendBattleRecordDetailCsReq, action: onGetFriendBattleRecordDetailCsReq },
    { cmdId: CmdID.CmdStartChallengeTierceCsReq, action: onStartChallengeTierceCsReq },
    { cmdId: CmdID.CmdSetChallengeTierceLineupCsReq, action: onSetChallengeTierceLineupCsReq },
    { cmdId: CmdID.CmdGetChallengeTierceDataCsReq, action: onGetChallengeTierceDataCsReq },
];
