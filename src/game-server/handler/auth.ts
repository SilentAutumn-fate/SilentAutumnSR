import { CmdID } from '../../proto/cmdId';
import { gridFightProfile } from '../../data/grid-fight-profile';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { HandlerEntry } from './types';

/**
 * Login handshake.
 *
 *   PlayerGetTokenCsReq      -> PlayerGetTokenScRsp
 *   PlayerLoginCsReq         -> PlayerLoginScRsp
 *   PlayerLoginFinishCsReq   -> PlayerLoginFinishScRsp + ContentPackageSyncDataScNotify
 *   ContentPackageGetDataCsReq -> ContentPackageGetDataScRsp
 *   SetClientPausedCsReq     -> SetClientPausedScRsp
 *   GetArchiveDataCsReq      -> GetArchiveDataScRsp
 *   GetUpdatedArchiveDataCsReq -> GetUpdatedArchiveDataScRsp
 */

/**
 * Fallback content packages used when content-packages.json is missing. These
 * are the story/region packages the client validates before it will let the
 * player spawn; missing ones leave the player stuck on the loading screen.
 * The generated table carries the full official list, including 200013
 * (二相乐园/千星城 and 150134.
 */
const CONTENT_PACKAGE_IDS = [
    200001, 200002, 200003, 200004, 200005, 200006, 200007, 200008, 200009, 200010, 200011, 200012,
    200013, 150017, 150015, 150021, 150018, 130011, 130012, 130013, 150025, 140006, 150026, 130014,
    150034, 150029, 150035, 150041, 150039, 150045, 150057, 150042, 150067, 150064, 150063, 150024,
    171002, 150068, 150070, 150071, 150073, 150074, 150075, 150076, 150077, 150078, 150079, 150132,
    150134,
];

/**
 * ContentPackageStatus_Release (= 4).
 *
 * The official client expects every shipped content package to be *released*,
 * not merely initialised: the reference server (hkrpg-go
 * gameserver/player/player_base.go:481-486) reports `Release` for every row of
 * ContentPackageConfig. Status 1 (`Init`) leaves early-access worlds such as
 * 千星城 (200013) and the resident activity panels locked behind an
 * "解锁" button.
 */
const CONTENT_PACKAGE_RELEASE = 4;

function contentPackageData(session: NetSession): starrail.ContentPackageData {
    const table = session.config.contentPackages;
    const ids = table ? table.packages.map((entry) => entry.contentId) : CONTENT_PACKAGE_IDS;
    return {
        curContentId: table?.curContentId ?? 0,
        contentPackageList: ids.map((contentId) => ({
            contentId,
            status: CONTENT_PACKAGE_RELEASE,
        })),
    };
}

export async function onPlayerGetTokenCsReq(
    req: starrail.PlayerGetTokenCsReq,
    session: NetSession,
): Promise<void> {
    if (req?.uid) session.state.uid = req.uid;
    if (req?.accountUid) session.state.uid = req.accountUid;

    await session.sendRsp(CmdID.CmdPlayerGetTokenScRsp, {
        retcode: 0,
        uid: session.state.uid,
        secretKeySeed: 0,
    });
}

export async function onPlayerLoginCsReq(
    req: starrail.PlayerLoginCsReq,
    session: NetSession,
): Promise<void> {
    const state = session.state;
    state.loginRandom = req?.loginRandom ?? 0;
    if (req?.nickname) state.nickname = req.nickname;
    if (req?.setNickname) state.nickname = req.setNickname;
    state.loggedIn = true;

    await session.sendRsp(CmdID.CmdPlayerLoginScRsp, {
        retcode: 0,
        loginRandom: state.loginRandom,
        serverTimestampMs: Date.now(),
        stamina: state.stamina,
        basicInfo: state.toBasicInfo(),
    });
}

export async function onPlayerLoginFinishCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    session.state.stamina = session.state.maxStamina;
    await session.sendMessage(CmdID.CmdStaminaInfoScNotify, { stamina: session.state.stamina });
    await session.sendMessage(CmdID.CmdContentPackageSyncDataScNotify, {
        data: contentPackageData(session),
    });
    for (const [offeringId, offering] of gridFightProfile.offerings) {
        const offeringInfo = { offeringId, ...offering, offeringState: 2 };
        await session.sendMessage(CmdID.CmdOfferingInfoScNotify, { offeringInfo });
    }
    const launcher = gridFightProfile.launcher;
    await session.sendMessage(CmdID.CmdUnlockTeleportNotify, launcher);
    await session.sendRsp(CmdID.CmdPlayerLoginFinishScRsp, { retcode: 0 });
}

export async function onContentPackageGetDataCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdContentPackageGetDataScRsp, {
        retcode: 0,
        data: contentPackageData(session),
    });
}

export async function onSetClientPausedCsReq(
    req: starrail.SetClientPausedCsReq,
    session: NetSession,
): Promise<void> {
    session.state.clientPaused = !!req?.paused;
    await session.sendRsp(CmdID.CmdSetClientPausedScRsp, {
        retcode: 0,
        paused: !!req?.paused,
    });
}

function archiveData(session: NetSession): starrail.ArchiveData {
    const ids = session.data.getDataJson().avatarIds();
    return {
        archiveAvatarIdList: ids,
        archiveEquipmentIdList: session.data.getDataJson().lightcones.map((l) => l.item_id),
        archiveMissingEquipmentIdList: [],
        archiveRelicList: session.data.getDataJson().relics.map((r) => r.toRelicProto()),
    };
}

export async function onGetArchiveDataCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetArchiveDataScRsp, {
        retcode: 0,
        archiveData: archiveData(session),
    });
}

export async function onGetUpdatedArchiveDataCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetUpdatedArchiveDataScRsp, {
        retcode: 0,
        archiveData: archiveData(session),
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdPlayerGetTokenCsReq, action: onPlayerGetTokenCsReq },
    { cmdId: CmdID.CmdPlayerLoginCsReq, action: onPlayerLoginCsReq },
    { cmdId: CmdID.CmdPlayerLoginFinishCsReq, action: onPlayerLoginFinishCsReq },
    { cmdId: CmdID.CmdContentPackageGetDataCsReq, action: onContentPackageGetDataCsReq },
    { cmdId: CmdID.CmdSetClientPausedCsReq, action: onSetClientPausedCsReq },
    { cmdId: CmdID.CmdGetArchiveDataCsReq, action: onGetArchiveDataCsReq },
    { cmdId: CmdID.CmdGetUpdatedArchiveDataCsReq, action: onGetUpdatedArchiveDataCsReq },
];
