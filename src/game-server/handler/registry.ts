import { CmdID } from '../../proto/cmdId';
import { HandlerEntry, DummyEntry } from './types';
import { moduleHandlers } from './registry.modules';

/**
 * The dispatch table. Every handler module contributes its own `handlers` array
 * (see tools/gen-registry.js, which regenerates registry.modules.ts), so adding
 * a feature area never requires editing a shared file.
 *
 * A handler is `{ cmdId, action }`; the request/response protobuf types are
 * derived from the command id, so there is no separate type map to keep in sync.
 */
export const handlerList: HandlerEntry[] = [...moduleHandlers];

/**
 * Requests answered with an empty response body. These are features the server
 * does not simulate but the client expects a reply for.
 */
export const dummyList: DummyEntry[] = [
    { req: CmdID.CmdGetBagCsReq, rsp: CmdID.CmdGetBagScRsp },
    { req: CmdID.CmdGetMarkItemListCsReq, rsp: CmdID.CmdGetMarkItemListScRsp },
    { req: CmdID.CmdGetAllLineupDataCsReq, rsp: CmdID.CmdGetAllLineupDataScRsp },
    { req: CmdID.CmdGetAllServerPrefsDataCsReq, rsp: CmdID.CmdGetAllServerPrefsDataScRsp },
    { req: CmdID.CmdGetRogueInfoCsReq, rsp: CmdID.CmdGetRogueInfoScRsp },
    { req: CmdID.CmdGetRogueEndlessActivityDataCsReq, rsp: CmdID.CmdGetRogueEndlessActivityDataScRsp },
    { req: CmdID.CmdChessRogueQueryCsReq, rsp: CmdID.CmdChessRogueQueryScRsp },
    { req: CmdID.CmdDailyFirstMeetPamCsReq, rsp: CmdID.CmdDailyFirstMeetPamScRsp },
    { req: CmdID.CmdGetCurAssistCsReq, rsp: CmdID.CmdGetCurAssistScRsp },
    { req: CmdID.CmdGetBattleCollegeDataCsReq, rsp: CmdID.CmdGetBattleCollegeDataScRsp },
    { req: CmdID.CmdGetNpcStatusCsReq, rsp: CmdID.CmdGetNpcStatusScRsp },
    { req: CmdID.CmdGetSecretKeyInfoCsReq, rsp: CmdID.CmdGetSecretKeyInfoScRsp },
    { req: CmdID.CmdGetHeartDialInfoCsReq, rsp: CmdID.CmdGetHeartDialInfoScRsp },
    { req: CmdID.CmdGetVideoVersionKeyCsReq, rsp: CmdID.CmdGetVideoVersionKeyScRsp },
    { req: CmdID.CmdHeliobusActivityDataCsReq, rsp: CmdID.CmdHeliobusActivityDataScRsp },
    { req: CmdID.CmdGetAetherDivideInfoCsReq, rsp: CmdID.CmdGetAetherDivideInfoScRsp },
    { req: CmdID.CmdGetMapRotationDataCsReq, rsp: CmdID.CmdGetMapRotationDataScRsp },
    { req: CmdID.CmdPlayerReturnInfoQueryCsReq, rsp: CmdID.CmdPlayerReturnInfoQueryScRsp },
    { req: CmdID.CmdGetLevelRewardTakenListCsReq, rsp: CmdID.CmdGetLevelRewardTakenListScRsp },
    { req: CmdID.CmdGetMainMissionCustomValueCsReq, rsp: CmdID.CmdGetMainMissionCustomValueScRsp },
    {
        req: CmdID.CmdGetMaterialSubmitActivityDataCsReq,
        rsp: CmdID.CmdGetMaterialSubmitActivityDataScRsp,
    },
    { req: CmdID.CmdRogueMagicQueryCsReq, rsp: CmdID.CmdRogueMagicQueryScRsp },
    { req: CmdID.CmdMusicRhythmDataCsReq, rsp: CmdID.CmdMusicRhythmDataScRsp },
    // friends
    { req: CmdID.CmdGetFriendApplyListInfoCsReq, rsp: CmdID.CmdGetFriendApplyListInfoScRsp },
    { req: CmdID.CmdGetChatFriendHistoryCsReq, rsp: CmdID.CmdGetChatFriendHistoryScRsp },
    { req: CmdID.CmdGetFriendLoginInfoCsReq, rsp: CmdID.CmdGetFriendLoginInfoScRsp },
    { req: CmdID.CmdGetFriendDevelopmentInfoCsReq, rsp: CmdID.CmdGetFriendDevelopmentInfoScRsp },
    {
        req: CmdID.CmdGetFriendRecommendListInfoCsReq,
        rsp: CmdID.CmdGetFriendRecommendListInfoScRsp,
    },
    // activities
    { req: CmdID.CmdGetSwitchHandDataCsReq, rsp: CmdID.CmdGetSwitchHandDataScRsp },
    { req: CmdID.CmdRogueArcadeGetInfoCsReq, rsp: CmdID.CmdRogueArcadeGetInfoScRsp },
    { req: CmdID.CmdTrainPartyGetDataCsReq, rsp: CmdID.CmdTrainPartyGetDataScRsp },
    { req: CmdID.CmdQueryProductInfoCsReq, rsp: CmdID.CmdQueryProductInfoScRsp },
    { req: CmdID.CmdGetQuestRecordCsReq, rsp: CmdID.CmdGetQuestRecordScRsp },
    { req: CmdID.CmdGetDailyActiveInfoCsReq, rsp: CmdID.CmdGetDailyActiveInfoScRsp },
    { req: CmdID.CmdGetChessRogueNousStoryInfoCsReq, rsp: CmdID.CmdGetChessRogueNousStoryInfoScRsp },
    { req: CmdID.CmdGetFightActivityDataCsReq, rsp: CmdID.CmdGetFightActivityDataScRsp },
    { req: CmdID.CmdGetStarFightDataCsReq, rsp: CmdID.CmdGetStarFightDataScRsp },
    { req: CmdID.CmdGetMultipleDropInfoCsReq, rsp: CmdID.CmdGetMultipleDropInfoScRsp },
    {
        req: CmdID.CmdGetPlayerReturnMultiDropInfoCsReq,
        rsp: CmdID.CmdGetPlayerReturnMultiDropInfoScRsp,
    },
    { req: CmdID.CmdGetShareDataCsReq, rsp: CmdID.CmdGetShareDataScRsp },
    {
        req: CmdID.CmdGetTreasureDungeonActivityDataCsReq,
        rsp: CmdID.CmdGetTreasureDungeonActivityDataScRsp,
    },
    {
        req: CmdID.CmdGetAetherDivideChallengeInfoCsReq,
        rsp: CmdID.CmdGetAetherDivideChallengeInfoScRsp,
    },
    { req: CmdID.CmdClockParkGetInfoCsReq, rsp: CmdID.CmdClockParkGetInfoScRsp },
    {
        req: CmdID.CmdGetTrackPhotoActivityDataCsReq,
        rsp: CmdID.CmdGetTrackPhotoActivityDataScRsp,
    },
    { req: CmdID.CmdGetSwordTrainingDataCsReq, rsp: CmdID.CmdGetSwordTrainingDataScRsp },
    { req: CmdID.CmdGetFightFestDataCsReq, rsp: CmdID.CmdGetFightFestDataScRsp },
    {
        req: CmdID.CmdDifficultyAdjustmentGetDataCsReq,
        rsp: CmdID.CmdDifficultyAdjustmentGetDataScRsp,
    },
    { req: CmdID.CmdSpaceZooDataCsReq, rsp: CmdID.CmdSpaceZooDataScRsp },
    { req: CmdID.CmdGetExpeditionDataCsReq, rsp: CmdID.CmdGetExpeditionDataScRsp },
    { req: CmdID.CmdTravelBrochureGetDataCsReq, rsp: CmdID.CmdTravelBrochureGetDataScRsp },
    { req: CmdID.CmdRaidCollectionDataCsReq, rsp: CmdID.CmdRaidCollectionDataScRsp },
    { req: CmdID.CmdGetRaidInfoCsReq, rsp: CmdID.CmdGetRaidInfoScRsp },
    { req: CmdID.CmdGetLoginActivityCsReq, rsp: CmdID.CmdGetLoginActivityScRsp },
    { req: CmdID.CmdGetTrialActivityDataCsReq, rsp: CmdID.CmdGetTrialActivityDataScRsp },
    { req: CmdID.CmdGetJukeboxDataCsReq, rsp: CmdID.CmdGetJukeboxDataScRsp },
    { req: CmdID.CmdGetMuseumInfoCsReq, rsp: CmdID.CmdGetMuseumInfoScRsp },
    { req: CmdID.CmdGetTelevisionActivityDataCsReq, rsp: CmdID.CmdGetTelevisionActivityDataScRsp },
    { req: CmdID.CmdGetTrainVisitorRegisterCsReq, rsp: CmdID.CmdGetTrainVisitorRegisterScRsp },
    { req: CmdID.CmdGetBoxingClubInfoCsReq, rsp: CmdID.CmdGetBoxingClubInfoScRsp },
    { req: CmdID.CmdTextJoinQueryCsReq, rsp: CmdID.CmdTextJoinQueryScRsp },
    { req: CmdID.CmdGetLoginChatInfoCsReq, rsp: CmdID.CmdGetLoginChatInfoScRsp },
    { req: CmdID.CmdGetFeverTimeActivityDataCsReq, rsp: CmdID.CmdGetFeverTimeActivityDataScRsp },
    { req: CmdID.CmdGetSummonActivityDataCsReq, rsp: CmdID.CmdGetSummonActivityDataScRsp },
    { req: CmdID.CmdTarotBookGetDataCsReq, rsp: CmdID.CmdTarotBookGetDataScRsp },
    { req: CmdID.CmdGetMarkChestCsReq, rsp: CmdID.CmdGetMarkChestScRsp },
    { req: CmdID.CmdGetNpcMessageGroupCsReq, rsp: CmdID.CmdGetNpcMessageGroupScRsp },
    { req: CmdID.CmdGetAllSaveRaidCsReq, rsp: CmdID.CmdGetAllSaveRaidScRsp },
    { req: CmdID.CmdGetAssistHistoryCsReq, rsp: CmdID.CmdGetAssistHistoryScRsp },
    { req: CmdID.CmdGetRechargeGiftInfoCsReq, rsp: CmdID.CmdGetRechargeGiftInfoScRsp },
    { req: CmdID.CmdGetRechargeBenefitInfoCsReq, rsp: CmdID.CmdGetRechargeBenefitInfoScRsp },
    { req: CmdID.CmdRelicSmartWearGetPlanCsReq, rsp: CmdID.CmdRelicSmartWearGetPlanScRsp },
    { req: CmdID.CmdRelicSmartWearGetPinRelicCsReq, rsp: CmdID.CmdRelicSmartWearGetPinRelicScRsp },
    { req: CmdID.CmdSetGrowthTargetAvatarCsReq, rsp: CmdID.CmdSetGrowthTargetAvatarScRsp },
    { req: CmdID.CmdFateQueryCsReq, rsp: CmdID.CmdFateQueryScRsp },
    { req: CmdID.CmdGetPlanetFesDataCsReq, rsp: CmdID.CmdGetPlanetFesDataScRsp },
    { req: CmdID.CmdParkourGetDataCsReq, rsp: CmdID.CmdParkourGetDataScRsp },
    { req: CmdID.CmdGetMonopolyInfoCsReq, rsp: CmdID.CmdGetMonopolyInfoScRsp },
    {
        req: CmdID.CmdMonopolyGetRegionProgressCsReq,
        rsp: CmdID.CmdMonopolyGetRegionProgressScRsp,
    },
    { req: CmdID.CmdGetMbtiReportCsReq, rsp: CmdID.CmdGetMbtiReportScRsp },
    { req: CmdID.CmdGetDrinkMakerDataCsReq, rsp: CmdID.CmdGetDrinkMakerDataScRsp },
    { req: CmdID.CmdGetDataCsReq, rsp: CmdID.CmdGetDataScRsp },
    { req: CmdID.CmdMarbleGetDataCsReq, rsp: CmdID.CmdMarbleGetDataScRsp },
    // 4.7 dropped `GetPreAvatarActivityListCsReq/ScRsp` (4.5.54: 349 -> 366);
    // the command ids are gone from the 4.7 CmdID table, so there is nothing to
    // answer. `GetPreAvatarGrowthInfo*` is a different command and is unanswered
    // in the reference too.
    { req: CmdID.CmdGetUnreleasedBlockInfoCsReq, rsp: CmdID.CmdGetUnreleasedBlockInfoScRsp },
    { req: CmdID.CmdGetAssistListCsReq, rsp: CmdID.CmdGetAssistListScRsp },
    { req: CmdID.CmdGetFriendAssistListCsReq, rsp: CmdID.CmdGetFriendAssistListScRsp },
    { req: CmdID.CmdB51RacingGetDataCsReq, rsp: CmdID.CmdB51RacingGetDataScRsp },
];
