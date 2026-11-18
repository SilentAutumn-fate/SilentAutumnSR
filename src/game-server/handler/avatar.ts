import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import { starrail } from '../../proto/starrail';
import type { HandlerEntry } from './types';
import { PLAYER_OUTFIT_LIST } from './inventory';
import {
    AVATAR_SKIN_IDS,
    SKIN_LIST,
    applyEnhancedId,
    baseAvatarId,
    buildAvatarSync,
    buildLineup,
    isMarch7th,
    isTrailblazer,
    outfitIdsOf,
    playerGender,
    setOutfitIds,
    syncAvatarData,
    updateSkinId,
} from '../manager/avatar_mgr';

const PAM_SKIN_IDS = [252000, 252001, 252002, 252003];

/**
 * Avatar + multipath handlers — the port of pearl-sr's `services/avatar.zig`.
 *
 * The avatar builders live in `../manager/avatar_mgr.ts` (the port of
 * `manager/avatar_mgr.zig`); this module is only dispatch and response shaping.
 * Packet ORDER matters where the reference sends more than one message and is
 * preserved verbatim:
 *
 *   SetAvatarPath       -> AvatarPathChangedNotify, PlayerSyncScNotify,
 *                          SyncLineupNotify, SetAvatarPathScRsp
 *   SetAvatarEnhancedId -> PlayerSyncScNotify, SetAvatarEnhancedIdScRsp
 *   Dress/TakeOff skin  -> PlayerSyncScNotify, Dress/TakeOffAvatarSkinScRsp
 *   SetPlayerOutfit     -> PlayerSyncScNotify (echo), SetPlayerOutfitScRsp
 */

function availablePaths(session: NetSession): number[] {
    const gender = session.data.getIdMain() % 2;
    return session.data.getDataJson().avatarIds().filter((id) =>
        isMarch7th(id) || (isTrailblazer(id) && id % 2 === gender),
    );
}

/** `CmdGetAvatarDataCsReq` -> `CmdGetAvatarDataScRsp`. */
export async function onGetAvatarDataCsReq(
    req: starrail.GetAvatarDataCsReq,
    session: NetSession,
): Promise<void> {
    const sync = buildAvatarSync(session);

    // DEVIATION: pearl-sr resets a process-global uid counter here and invents
    // `path_equipment_id` / relic uids on every call. The freesr profile already
    // owns stable unique ids, so there is nothing to renumber.
    //
    // `player_outfit_data` (`CJLCPMDGIBO`, whose only field is the repeated
    // `EAKOLIJOEPA` outfit id list) is echoed back once the client has set an
    // outfit: pearl-sr never returns the outfit it accepted, so the choice was
    // lost on the next avatar refresh. An empty list encodes exactly like an
    // unset field, so an untouched profile sees the reference's bytes.
    await session.sendRsp(CmdID.CmdGetAvatarDataScRsp, {
        retcode: 0,
        isGetAll: !!req?.isGetAll,
        skinList: SKIN_LIST,
        basicTypeIdList: availablePaths(session),
        avatarList: sync.avatarList,
        avatarPathDataInfoList: sync.avatarPathDataInfoList,
        playerOutfitData: { EAKOLIJOEPA: outfitIdsOf(session) },
    });
}

/** `CmdGetBasicInfoCsReq` -> `CmdGetBasicInfoScRsp`. Request is ignored. */
export async function onGetBasicInfoCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetBasicInfoScRsp, {
        retcode: 0,
        gender: playerGender(session),
        isGenderSet: true,
        // DEVIATION: pearl-sr reports nothing here and stores nothing in
        // SetGameplayBirthday, so the birthday could never round-trip. The client
        // reads it back from this response at login.
        gameplayBirthday: session.state.birthday,
    });
}

/**
 * `CmdSetAvatarPathCsReq` -> (notify, sync, lineup notify) + `CmdSetAvatarPathScRsp`.
 * The requested path id is stored on DataService, which is what lineups resolve
 * a Trailblazer/March 7th entry through.
 */
export async function onSetAvatarPathCsReq(
    req: starrail.SetAvatarPathCsReq,
    session: NetSession,
): Promise<void> {
    const pathId = Number(req?.avatarId ?? 0);

    const retcode = await switchPaths(session, [pathId]);
    await session.sendRsp(CmdID.CmdSetAvatarPathScRsp, { retcode, avatarId: pathId });
}

async function switchPaths(session: NetSession, paths: number[]): Promise<number> {
    const available = availablePaths(session);
    if (paths.some((id) => !available.includes(id)) ||
        new Set(paths.map(baseAvatarId)).size !== paths.length) {
        return starrail.Retcode.RET_AVATAR_PATH_NOT_MATCH;
    }
    if (paths.length === 0) return 0;

    for (const pathId of paths) {
        if (isMarch7th(pathId)) {
            session.data.setMarch7Id(pathId);
            session.state.march7PathId = pathId;
        } else {
            session.data.setMainId(pathId);
            session.state.mcPathId = pathId;
        }
    }
    await session.data.saveDataInGame();

    for (const pathId of paths) {
        await session.sendMessage(CmdID.CmdAvatarPathChangedNotify, {
            baseAvatarId: baseAvatarId(pathId),
            curMultiPathAvatarType: pathId,
        });
    }
    await syncAvatarData(session);
    await session.sendMessage(CmdID.CmdSyncLineupNotify, {
        lineup: buildLineup(session),
    });
    return 0;
}

async function onSetMultipleAvatarPathsCsReq(
    req: starrail.SetMultipleAvatarPathsCsReq,
    session: NetSession,
): Promise<void> {
    const retcode = await switchPaths(session, req?.avatarIdList ?? []);
    await session.sendRsp(CmdID.CmdSetMultipleAvatarPathsScRsp, { retcode });
}

async function onUnlockAvatarPathCsReq(
    req: starrail.UnlockAvatarPathCsReq,
    session: NetSession,
): Promise<void> {
    const pathId = req?.avatarId ?? 0;
    const paths = availablePaths(session);
    await session.sendRsp(CmdID.CmdUnlockAvatarPathScRsp, {
        retcode: paths.includes(pathId) ? 0 : starrail.Retcode.RET_AVATAR_PATH_NOT_MATCH,
        avatarId: pathId,
        basicTypeIdList: paths,
    });
}

/** `CmdSetPlayerOutfitCsReq`: echo the outfit back as an unsolicited sync. */
export async function onSetPlayerOutfitCsReq(
    req: starrail.SetPlayerOutfitCsReq,
    session: NetSession,
): Promise<void> {
    const outfitIds: number[] = [...new Set<number>(req?.playerOutfitData?.EAKOLIJOEPA ?? [])];
    if (outfitIds.some((id) => !PLAYER_OUTFIT_LIST.includes(id))) {
        await session.sendRsp(CmdID.CmdSetPlayerOutfitScRsp, {
            retcode: starrail.Retcode.RET_PLAYER_OUTFIT_NOT_OWNED,
        });
        return;
    }
    setOutfitIds(session, outfitIds);
    await session.data.saveDataInGame();

    await session.sendMessage(CmdID.CmdPlayerSyncScNotify, {
        playerOutfitData: { EAKOLIJOEPA: outfitIds },
    });
    await session.sendRsp(CmdID.CmdSetPlayerOutfitScRsp, { retcode: 0 });
}

/** `CmdSetAvatarEnhancedIdCsReq`: mutate the enhancement slots, then resync. */
export async function onSetAvatarEnhancedIdCsReq(
    req: starrail.SetAvatarEnhancedIdCsReq,
    session: NetSession,
): Promise<void> {
    const avatarId = Number(req?.avatarId ?? 0);
    const enhancedId = Number(req?.enhancedId ?? 0);

    applyEnhancedId(session, avatarId, enhancedId);
    await syncAvatarData(session);

    await session.sendRsp(CmdID.CmdSetAvatarEnhancedIdScRsp, {
        retcode: 0,
        growthAvatarId: avatarId,
        unkEnhancedId: enhancedId,
    });
}

/** `CmdDressAvatarSkinCsReq`: dress a skin, then resync. */
export async function onDressAvatarSkinCsReq(
    req: starrail.DressAvatarSkinCsReq,
    session: NetSession,
): Promise<void> {
    const avatarId = Number(req?.avatarId ?? 0);
    const skinId = Number(req?.skinId ?? 0);
    if (AVATAR_SKIN_IDS.get(avatarId) !== skinId) {
        await session.sendRsp(CmdID.CmdDressAvatarSkinScRsp, {
            retcode: SKIN_LIST.includes(skinId)
                ? starrail.Retcode.RET_AVATAR_SKIN_NOT_MATCH_AVATAR
                : starrail.Retcode.RET_AVATAR_SKIN_ITEM_NOT_EXIST,
        });
        return;
    }
    updateSkinId(session, avatarId, skinId);
    await session.data.saveDataInGame();
    await syncAvatarData(session);
    await session.sendRsp(CmdID.CmdDressAvatarSkinScRsp, { retcode: 0 });
}

/** `CmdTakeOffAvatarSkinCsReq`: skin id 0, then resync. */
export async function onTakeOffAvatarSkinCsReq(
    req: starrail.TakeOffAvatarSkinCsReq,
    session: NetSession,
): Promise<void> {
    updateSkinId(session, Number(req?.avatarId ?? 0), 0);
    await session.data.saveDataInGame();
    await syncAvatarData(session);
    await session.sendRsp(CmdID.CmdTakeOffAvatarSkinScRsp, { retcode: 0 });
}

async function onGetPamSkinDataCsReq(_req: unknown, session: NetSession): Promise<void> {
    const selected = session.data.getDataInGame().player.pamSkinId;
    await session.sendRsp(CmdID.CmdGetPamSkinDataScRsp, {
        retcode: 0,
        curSkin: selected ?? PAM_SKIN_IDS[0],
        unlockSkinList: PAM_SKIN_IDS,
    });
}

async function onSelectPamSkinCsReq(req: starrail.SelectPamSkinCsReq, session: NetSession): Promise<void> {
    const player = session.data.getDataInGame().player;
    const curSkin = player.pamSkinId ?? PAM_SKIN_IDS[0];
    const setSkin = req?.pamSkin ?? 0;
    if (!PAM_SKIN_IDS.includes(setSkin)) {
        await session.sendRsp(CmdID.CmdSelectPamSkinScRsp, {
            retcode: starrail.Retcode.RET_AVATAR_SKIN_ITEM_NOT_EXIST,
            curSkin,
            setSkin,
        });
        return;
    }
    player.pamSkinId = setSkin;
    await session.data.saveDataInGame();
    await session.sendRsp(CmdID.CmdSelectPamSkinScRsp, { retcode: 0, curSkin: setSkin, setSkin });
}

/** `CmdGetBigDataAllRecommendCsReq`: echo the type, no recommendation payload. */
export async function onGetBigDataAllRecommendCsReq(
    req: starrail.GetBigDataAllRecommendCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetBigDataAllRecommendScRsp, {
        retcode: 0,
        bigDataRecommendType: req?.bigDataRecommendType ?? 0,
    });
}

/** `CmdGetBigDataRecommendCsReq`: echo both fields; `has_recommand` stays false. */
export async function onGetBigDataRecommendCsReq(
    req: starrail.GetBigDataRecommendCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetBigDataRecommendScRsp, {
        retcode: 0,
        bigDataRecommendType: req?.bigDataRecommendType ?? 0,
        equipAvatar: req?.equipAvatar ?? 0,
    });
}

/** `CmdGetPreAvatarGrowthInfoCsReq`: empty growth list. Request is ignored. */
export async function onGetPreAvatarGrowthInfoCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetPreAvatarGrowthInfoScRsp, { retcode: 0 });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetAvatarDataCsReq, action: onGetAvatarDataCsReq },
    { cmdId: CmdID.CmdGetPamSkinDataCsReq, action: onGetPamSkinDataCsReq },
    { cmdId: CmdID.CmdSelectPamSkinCsReq, action: onSelectPamSkinCsReq },
    { cmdId: CmdID.CmdSetAvatarPathCsReq, action: onSetAvatarPathCsReq },
    { cmdId: CmdID.CmdSetMultipleAvatarPathsCsReq, action: onSetMultipleAvatarPathsCsReq },
    { cmdId: CmdID.CmdUnlockAvatarPathCsReq, action: onUnlockAvatarPathCsReq },
    { cmdId: CmdID.CmdGetBasicInfoCsReq, action: onGetBasicInfoCsReq },
    { cmdId: CmdID.CmdTakeOffAvatarSkinCsReq, action: onTakeOffAvatarSkinCsReq },
    { cmdId: CmdID.CmdDressAvatarSkinCsReq, action: onDressAvatarSkinCsReq },
    { cmdId: CmdID.CmdGetBigDataAllRecommendCsReq, action: onGetBigDataAllRecommendCsReq },
    { cmdId: CmdID.CmdGetBigDataRecommendCsReq, action: onGetBigDataRecommendCsReq },
    { cmdId: CmdID.CmdGetPreAvatarGrowthInfoCsReq, action: onGetPreAvatarGrowthInfoCsReq },
    { cmdId: CmdID.CmdSetPlayerOutfitCsReq, action: onSetPlayerOutfitCsReq },
    { cmdId: CmdID.CmdSetAvatarEnhancedIdCsReq, action: onSetAvatarEnhancedIdCsReq },
];
