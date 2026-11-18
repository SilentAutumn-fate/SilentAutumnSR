import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { HandlerEntry } from './types';

/**
 * Missions, tutorials and quests.
 *
 *   GetMissionStatusCsReq       (1217) -> GetMissionStatusScRsp       (1238)
 *   GetTutorialGuideCsReq       (1605) -> GetTutorialGuideScRsp       (1675)
 *   GetTutorialCsReq            (1634) -> GetTutorialScRsp            (1625)
 *   UnlockTutorialGuideCsReq    (1658) -> UnlockTutorialGuideScRsp    (1656)
 *   UnlockTutorialCsReq         (1660) -> UnlockTutorialScRsp         (1616)
 *   FinishTalkMissionCsReq      (1205) -> FinishTalkMissionScRsp      (1275)
 *   GetQuestDataCsReq           (934)  -> GetQuestDataScRsp           (925)
 *
 * There is no mission progress model in the reference server: every call reports
 * the *entire* design-data table as finished, the tutorial unlock handlers only
 * log, and FinishTalkMission just echoes its request. All values come from
 * ConfigManager's tables, in design-file order (the Maps preserve insertion
 * order, so `values()` is the same order pearl-sr iterates its config arrays in).
 */

/** MissionStatus_MissionFinish. */
const MISSION_FINISH = 2;
/** TutorialStatus_TutorialFinish. */
const TUTORIAL_FINISH = 2;
/** QuestStatus_QuestFinish. */
const QUEST_FINISH = 2;

/** Every finished sub-mission is reported with this progress value. */
const MISSION_PROGRESS = 1;
// OSBETAWin4.6.54 links GridFightS2EntrancePage / Tutorial_10065 to
// mission 8047206. The shipped mission and tutorial tables predate this row.
const GRID_FIGHT_SEASON_TWO_INTRO = 8047206;
/**
 * Tutorial steps that only the 4.6.54 client knows about.
 *
 * Derived by enumerating every `Config/Level/Tutorial/Tutorial_<id>.json` path in
 * the client's `StarRail_Data/Persistent/DesignData/Windows/*.bytes` (1238 ids)
 * and diffing against the shipped `TutorialData.json` (1249 ids): 31 ids exist
 * only in the client. A tutorial id the server never reports is treated as "not
 * finished", so the client starts its guide overlay the moment the matching page
 * appears — that is what produced the S2 entrance tutorial and, at login, the
 * simulated-universe guide popups (命途回响 / 复活装置). Reporting them finished
 * keeps the whole teaching ladder behind the player, matching the "story and
 * tutorial default to complete" policy.
 */
const CLIENT_ONLY_TUTORIALS = [
    4062, 9530, 9680, 9681,
    10051, 10052, 10053, 10054, 10055, 10056, 10057, 10058, 10059, 10060,
    10061, 10062, 10063, 10064, 10065,
    46001, 46002, 46003,
    315020, 315060, 315100, 315110,
    10441060, 10441217, 20431070, 20431080, 20451080,
];

const GUIDE_SUB_MISSIONS = [
    804150002,
    // RogueTourn_RogueEntranceLocked suppresses opening the lobby after travel.
    802370101, 804150001,
    // Finish every tutorial step checked by RogueMagic_ReturnToHudCondition.
    802640102, 802640103, 802640104, 802640105,
    802640106, 802640107, 802640108, 802640109,
    // GuideRogueData and the follow-up Currency Wars entrance tutorial.
    803710003, 803710005,
    804720601, 804720602, 804720603,
];

function finishedSubMissions(ids: readonly number[]) {
    return [...new Set(ids)].map((id) => ({
        id,
        status: MISSION_FINISH,
        progress: MISSION_PROGRESS,
    }));
}

/**
 * Guide sub-missions of every content package (`ContentPackageConfig
 * .GuideConditions -> [FinishSubMission:id]`), merged with the hand-picked list
 * above. The 4.6.54 client gates several guide/rogue entries on these, e.g. the
 * 千星城 chapter's 804611401 and the nav-map content conditions.
 */
function guideSubMissionIds(session: NetSession): number[] {
    return [...GUIDE_SUB_MISSIONS, ...(session.config.contentPackages?.guideSubMissionIds ?? [])];
}

/** Every quest is reported with this progress value, whatever its status. */
const QUEST_PROGRESS = 200;

/**
 * Main-mission ids from MainMission.json, in file order (2181 entries with the
 * shipped table). The request's own mainMissionIdList is ignored: every main
 * mission in the table is claimed as finished both in the "finished" and in the
 * "current version finished" list.
 */
function allMainMissionIds(session: NetSession): number[] {
    const ids = [...session.config.mainMissionConfig.values()].map((mission) => mission.MainMissionID);
    return [...new Set([...ids, GRID_FIGHT_SEASON_TWO_INTRO])];
}

/**
 * Response is built from the request's subMissionIdList (each reported finished
 * with progress 1) plus the full main-mission table.
 */
export async function onGetMissionStatusCsReq(
    req: starrail.GetMissionStatusCsReq,
    session: NetSession,
): Promise<void> {
    const mainMissionIds = allMainMissionIds(session);

    await session.sendRsp(CmdID.CmdGetMissionStatusScRsp, {
        retcode: 0,
        subMissionStatusList: finishedSubMissions([...guideSubMissionIds(session), ...(req?.subMissionIdList ?? [])]),
        finishedMainMissionIdList: mainMissionIds,
        curversionFinishedMainMissionIdList: mainMissionIds,
    });
}

export async function onGetMissionDataCsReq(
    _req: starrail.GetMissionDataCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetMissionDataScRsp, {
        retcode: 0,
        missionList_11: finishedSubMissions(guideSubMissionIds(session)),
        finishedMainMissionIdList: allMainMissionIds(session),
    });
}

/**
 * Guide keys the client can use.
 *
 * `Proto.TutorialGuideType` only has 0 (`TutorialGuideDefault`) and 1
 * (`TutorialGuideSubguide`); the client's `TutorialGuideGroupData` keeps its
 * status under `(GroupID, GuideType)` with that two-valued enum. The design
 * table's `TutorialType` column is a different 1..5 classification, so emitting
 * it produced keys the client never looked up: every login it saw all guides as
 * unfinished, re-ran the unlock flow and popped the AutoShow pages (命途回响 /
 * 复活装置). Report every group under both enum values so the lookup always hits.
 */
const GUIDE_TYPES = [0, 1] as const;

/**
 * Guide groups that exist only in the 4.6.54 client (`TutorialGuideGroup` rows
 * 2255/2256 are absent from the shipped table). The client asks to unlock them on
 * every login; reporting them finished keeps the "no tutorial overlay" policy.
 */
const CLIENT_ONLY_GUIDE_GROUPS = [2255, 2256] as const;

/**
 * Tutorial *guide* list. (The reference handler is named onGetTutorialGuideStatus
 * but answers with the guide response.) The id is the design table's GroupID; the
 * type is one of the two `TutorialGuideType` values.
 */
export async function onGetTutorialGuideCsReq(
    _req: starrail.GetTutorialGuideCsReq,
    session: NetSession,
): Promise<void> {
    const groupIds = [
        ...new Set([
            ...[...session.config.tutorialGuideConfig.values()].map((guide) => guide.GroupID),
            ...CLIENT_ONLY_GUIDE_GROUPS,
        ]),
    ];
    const tutorialGuideList = groupIds.flatMap((id) =>
        GUIDE_TYPES.map((type) => ({ id, type, status: TUTORIAL_FINISH })));

    await session.sendRsp(CmdID.CmdGetTutorialGuideScRsp, {
        retcode: 0,
        tutorialGuideList,
    });
}

/**
 * Tutorial list: every TutorialData.json row reported finished (1249 entries)
 * plus the currency-war steps only the 4.6.54 client ships. Anything missing
 * from this list is "not finished" for the client, which then starts its guide
 * overlay on the matching page.
 */
export async function onGetTutorialCsReq(
    _req: starrail.GetTutorialCsReq,
    session: NetSession,
): Promise<void> {
    const ids = [...session.config.tutorialConfig.values()].map((tutorial) => tutorial.TutorialID);
    const tutorialList = [...new Set([...ids, ...CLIENT_ONLY_TUTORIALS])]
        .map((id) => ({ id, status: TUTORIAL_FINISH }));

    await session.sendRsp(CmdID.CmdGetTutorialScRsp, {
        retcode: 0,
        tutorialList,
    });
}

/** Unlock guide: ack it as already finished (the request only carries the id). */
export async function onUnlockTutorialGuideCsReq(
    req: starrail.UnlockTutorialGuideCsReq,
    session: NetSession,
): Promise<void> {
    const groupId = req?.groupId ?? 0;
    console.debug(`UNLOCK TUTORIAL GUIDE ID: ${groupId}`);
    const type = (req?.type ?? 0) as number;
    const tutorialGuide = { id: groupId, type, status: TUTORIAL_FINISH };
    await session.sendRsp(CmdID.CmdUnlockTutorialGuideScRsp, { retcode: 0, tutorialGuide });
}

/** Unlock tutorial: same — log and ack, no state is recorded. */
export async function onUnlockTutorialCsReq(
    req: starrail.UnlockTutorialCsReq,
    session: NetSession,
): Promise<void> {
    console.debug(`UNLOCK TUTORIAL ID: ${req?.tutorialId ?? 0}`);
    const tutorial = { id: req?.tutorialId ?? 0, status: TUTORIAL_FINISH };
    await session.sendRsp(CmdID.CmdUnlockTutorialScRsp, { retcode: 0, tutorial });
}

/** Talk mission: pure echo; the mission is never recorded as finished. */
export async function onFinishTalkMissionCsReq(
    req: starrail.FinishTalkMissionCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdFinishTalkMissionScRsp, {
        retcode: 0,
        subMissionId: req?.subMissionId ?? 0,
        talkStr: req?.talkStr ?? '',
        customValueList: (req?.customValueList ?? []).map((value) => ({
            index: value?.index ?? 0,
            customValue: value?.customValue ?? 0,
            BGDFHBAANLB: value?.BGDFHBAANLB ?? '',
        })),
    });
}

/**
 * Every quest in QuestData.json (5847 entries) reported finished.
 *
 * The earlier build mirrored the reference server and reported only the four
 * prologue quests as finished, closing the rest. That hides every quest-gated
 * world/side content (including the 千星城 nav-map node); a fully progressed
 * account has them all finished.
 */
export async function onGetQuestDataCsReq(
    _req: starrail.GetQuestDataCsReq,
    session: NetSession,
): Promise<void> {
    const questList = [...session.config.questConfig.values()].map((quest) => ({
        id: quest.QuestID,
        progress: QUEST_PROGRESS,
        status: QUEST_FINISH,
    }));

    await session.sendRsp(CmdID.CmdGetQuestDataScRsp, {
        retcode: 0,
        questList,
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetMissionDataCsReq, action: onGetMissionDataCsReq },
    { cmdId: CmdID.CmdGetTutorialGuideCsReq, action: onGetTutorialGuideCsReq },
    { cmdId: CmdID.CmdGetMissionStatusCsReq, action: onGetMissionStatusCsReq },
    { cmdId: CmdID.CmdGetTutorialCsReq, action: onGetTutorialCsReq },
    { cmdId: CmdID.CmdUnlockTutorialGuideCsReq, action: onUnlockTutorialGuideCsReq },
    { cmdId: CmdID.CmdUnlockTutorialCsReq, action: onUnlockTutorialCsReq },
    {
        cmdId: CmdID.CmdFinishTutorialCsReq,
        action: (req, session) => {
            const tutorial = { id: req?.tutorialId ?? 0, status: TUTORIAL_FINISH };
            return session.sendRsp(CmdID.CmdFinishTutorialScRsp, { retcode: 0, tutorial });
        },
    },
    {
        cmdId: CmdID.CmdFinishTutorialGuideCsReq,
        action: (req, session) => {
            const groupId = req?.groupId ?? 0;
            const tutorialGuide = {
                id: groupId, type: (req?.type ?? 0) as number, status: TUTORIAL_FINISH,
            };
            return session.sendRsp(CmdID.CmdFinishTutorialGuideScRsp, { retcode: 0, tutorialGuide });
        },
    },
    { cmdId: CmdID.CmdFinishTalkMissionCsReq, action: onFinishTalkMissionCsReq },
    { cmdId: CmdID.CmdGetQuestDataCsReq, action: onGetQuestDataCsReq },
];
