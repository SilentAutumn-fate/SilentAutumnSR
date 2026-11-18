import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { HandlerEntry } from './types';

/**
 * Profile handlers — the port of pearl-sr's `services/profile.zig`:
 * phone cosmetics, the player board, and player detail info.
 *
 * DATA-MODEL DIVERGENCE FROM THE ZIG SOURCE (deliberate, per PORTING-GUIDE):
 * pearl-sr answers every one of these from hard-coded literals and stores
 * nothing, so a selection made in `Select*` is invisible to the matching `Get*`
 * on the next call — the cosmetics screen simply never updates. Here the current
 * selections are read from `session.state` / this module's per-session scratch
 * state, so what the player picked is what the client is told next time.
 * Every such change carries a `DEVIATION:` comment.
 */

/** pearl-sr `profile.zig` — "can change these id here for initial display". */
const LIST_AVATAR = [1415, 1001, 1310, 1303, 1501];
const SUPPORT_AVATAR = [1510, 1508, 1505];

/** pearl-sr `data.zig` owned-cosmetics tables (220011 is absent on purpose). */
const OWNED_CHAT_BUBBLES = [
    220000, 220001, 220002, 220003, 220004, 220005, 220006, 220007, 220008, 220009, 220010, 220012,
];
const OWNED_PHONE_THEMES = [
    221000, 221001, 221002, 221003, 221004, 221005, 221006, 221007, 221008, 221009, 221010, 221011,
    221012, 221013,
];
const OWNED_PHONE_CASES = [254000, 254001];
const OWNED_PERSONAL_CARD_SKINS = [253000, 253001, 253002, 253003, 253004, 253005];

/** pearl-sr's hard-coded profile head frame (item id / u32 max expiry). */
const HEAD_FRAME_ITEM_ID = 226004;
const HEAD_FRAME_EXPIRE_TIME = 4294967295;

/**
 * Per-connection state this module owns.
 *
 * `PlayerState` has no slot for the assist-avatar list, and pearl-sr's own
 * `SupportAvatar` is a constant that `onSetAssistAvatar` never writes to; keep a
 * per-session copy in a WeakMap (PORTING-GUIDE "Per-session state owned by your
 * module") so the `Get*` that follows a `Set*` reflects the choice.
 */
interface ProfileScratch {
    assistAvatarIdList: number[];
}

const scratchBySession = new WeakMap<NetSession, ProfileScratch>();

function scratchOf(session: NetSession): ProfileScratch {
    let scratch = scratchBySession.get(session);
    if (!scratch) {
        scratch = { assistAvatarIdList: [] };
        scratchBySession.set(session, scratch);
    }
    return scratch;
}

/**
 * Flush the player's changes.
 *
 * NOTE: `DataInGame.toJson()` currently serialises only lineups/position/scene,
 * so this call does not yet store the `PlayerState` profile fields; it is kept
 * because the guide's persistence contract is exactly this call, and the fields
 * start surviving a restart as soon as `DataService` persists session state.
 * (`data.service.ts` / `loadDataInGame.ts` are shared files — the missing
 * serialiser is reported to the integrator rather than added here.)
 */
async function persist(session: NetSession): Promise<void> {
    await session.data.saveDataInGame();
}

/**
 * The displayed avatars: the player's own choice when they made one, otherwise
 * pearl-sr's initial five. `pos_index` is 1-based, matching the reference's
 * stack-local `Uid.BaseUidGen` numbering.
 */
function displayAvatars(session: NetSession): starrail.DisplayAvatarData[] {
    const chosen = session.state.displayAvatarList;
    const ids = chosen && chosen.length > 0 ? chosen : LIST_AVATAR;
    return ids.map((avatarId, index) => ({ avatarId, posIndex: index + 1 }));
}

/** The three assist avatars, once the player has picked any. */
function assistAvatarIdList(session: NetSession): number[] {
    const chosen = scratchOf(session).assistAvatarIdList;
    return chosen.length > 0 ? [...chosen] : [...SUPPORT_AVATAR];
}

/** `CmdGetPhoneDataCsReq` -> `CmdGetPhoneDataScRsp`. Request is ignored. */
export async function onGetPhoneDataCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    // DEVIATION: pearl-sr hard-codes 0 / 0 / 254001 and never reflects the three
    // Select* handlers, so choosing a cosmetic did nothing. The current ids come
    // from session state, whose defaults (220000 / 221000 / 254000) are all in
    // the owned lists below.
    await session.sendRsp(CmdID.CmdGetPhoneDataScRsp, {
        retcode: 0,
        curChatBubble: session.state.chatBubble,
        curPhoneTheme: session.state.phoneTheme,
        curPhoneCase: session.state.phoneCase,
        ownedChatBubbles: OWNED_CHAT_BUBBLES,
        ownedPhoneThemes: OWNED_PHONE_THEMES,
        ownedPhoneCases: OWNED_PHONE_CASES,
    });
}

/** `CmdSelectPhoneThemeCsReq` -> `CmdSelectPhoneThemeScRsp`. */
export async function onSelectPhoneThemeCsReq(
    req: starrail.SelectPhoneThemeCsReq,
    session: NetSession,
): Promise<void> {
    const themeId = Number(req?.themeId ?? 0);
    session.state.phoneTheme = themeId;
    await persist(session);

    await session.sendRsp(CmdID.CmdSelectPhoneThemeScRsp, {
        retcode: 0,
        curPhoneTheme: themeId,
    });
}

/** `CmdSelectChatBubbleCsReq` -> `CmdSelectChatBubbleScRsp`. */
export async function onSelectChatBubbleCsReq(
    req: starrail.SelectChatBubbleCsReq,
    session: NetSession,
): Promise<void> {
    const bubbleId = Number(req?.bubbleId ?? 0);
    session.state.chatBubble = bubbleId;
    await persist(session);

    await session.sendRsp(CmdID.CmdSelectChatBubbleScRsp, {
        retcode: 0,
        curChatBubble: bubbleId,
    });
}

/**
 * `CmdSelectPhoneCaseCsReq` -> `CmdSelectPhoneCaseScRsp`.
 *
 * NOTE: earlier proto revisions spelled the *request* message `SelectPhoneCaseCSReq`
 * (capital CS); the 4.7 revision renamed it to `SelectPhoneCaseCsReq`. Only the
 * response is, as always, `SelectPhoneCaseScRsp`.
 */
export async function onSelectPhoneCaseCsReq(
    req: starrail.SelectPhoneCaseCsReq,
    session: NetSession,
): Promise<void> {
    const phoneCaseId = Number(req?.phoneCaseId ?? 0);
    session.state.phoneCase = phoneCaseId;
    await persist(session);

    await session.sendRsp(CmdID.CmdSelectPhoneCaseScRsp, {
        retcode: 0,
        curPhoneCase: phoneCaseId,
    });
}

/** `CmdGetPlayerBoardDataCsReq` -> `CmdGetPlayerBoardDataScRsp`. Request is ignored. */
export async function onGetPlayerBoardDataCsReq(
    _req: unknown,
    session: NetSession,
): Promise<void> {
    // The 97 unlocked head icons come from AvatarPlayerIcon.json in file order —
    // the same table pearl-sr's player_icon_config holds (Map preserves insertion
    // order, so iterating values() reproduces the JSON order).
    const unlockedHeadIconList = [...session.config.playerIconConfig.values()].map((icon) => ({
        id: icon.ID,
    }));

    await session.sendRsp(CmdID.CmdGetPlayerBoardDataScRsp, {
        retcode: 0,
        displayAvatarVec: {
            isDisplay: true,
            displayAvatarList: displayAvatars(session),
        },
        signature: session.state.signature,
        unlockedPersonalCardList: OWNED_PERSONAL_CARD_SKINS,
        currentPersonalCardId: session.state.personalCard,
        headFrameInfo: {
            headFrameItemId: HEAD_FRAME_ITEM_ID,
            headFrameExpireTime: HEAD_FRAME_EXPIRE_TIME,
        },
        assistAvatarIdList: assistAvatarIdList(session),
        unlockedHeadIconList,
        // DEVIATION: pearl-sr leaves current_head_icon_id unset here, so the icon
        // chosen through SetHeadIcon never came back on the board.
        currentHeadIconId: session.state.headIcon,
    });
}

/**
 * `CmdSetDisplayAvatarCsReq` -> `CmdSetDisplayAvatarScRsp`.
 *
 * pearl-sr only echoes the request; the list is stored here (as avatar ids in
 * `pos` order) so the next board refresh shows it.
 */
export async function onSetDisplayAvatarCsReq(
    req: starrail.SetDisplayAvatarCsReq,
    session: NetSession,
): Promise<void> {
    const displayAvatarList: starrail.DisplayAvatarData[] = req?.displayAvatarList ?? [];
    session.state.displayAvatarList = [...displayAvatarList]
        .sort((a, b) => (a?.posIndex ?? 0) - (b?.posIndex ?? 0))
        .map((entry) => Number(entry?.avatarId ?? 0))
        .filter((id) => id !== 0);
    await persist(session);

    await session.sendRsp(CmdID.CmdSetDisplayAvatarScRsp, {
        retcode: 0,
        displayAvatarList,
    });
}

/**
 * `CmdSetAssistAvatarCsReq` -> `CmdSetAssistAvatarScRsp`.
 *
 * pearl-sr echoes the request but explicitly does **not** capture it into
 * `SupportAvatar`, so the assist avatars snapped back to the constant. Keeping
 * the list per session avoids that while preserving the echo shape.
 */
export async function onSetAssistAvatarCsReq(
    req: starrail.SetAssistAvatarCsReq,
    session: NetSession,
): Promise<void> {
    const avatarId = Number(req?.avatarId ?? 0);
    const requested: number[] = req?.avatarIdList ?? [];
    // Prefer the explicit list; fall back to the single "lead" assist id.
    let chosen: number[];
    if (requested.length > 0) chosen = requested;
    else if (avatarId !== 0) chosen = [avatarId];
    else chosen = [];
    scratchOf(session).assistAvatarIdList = chosen.map(Number).filter((id) => id !== 0);

    await session.sendRsp(CmdID.CmdSetAssistAvatarScRsp, {
        retcode: 0,
        avatarId,
        avatarIdList: requested,
    });
}

/** `CmdSetSignatureCsReq` -> `CmdSetSignatureScRsp`. */
export async function onSetSignatureCsReq(
    req: starrail.SetSignatureCsReq,
    session: NetSession,
): Promise<void> {
    const signature = req?.signature ?? '';
    session.state.signature = signature;
    await persist(session);

    await session.sendRsp(CmdID.CmdSetSignatureScRsp, {
        retcode: 0,
        signature,
    });
}

/** `CmdSetGameplayBirthdayCsReq` -> `CmdSetGameplayBirthdayScRsp`. */
export async function onSetGameplayBirthdayCsReq(
    req: starrail.SetGameplayBirthdayCsReq,
    session: NetSession,
): Promise<void> {
    const birthday = Number(req?.birthday ?? 0);
    session.state.birthday = birthday;
    await persist(session);

    await session.sendRsp(CmdID.CmdSetGameplayBirthdayScRsp, {
        retcode: 0,
        birthday,
    });
}

/** `CmdSetHeadIconCsReq` -> `CmdSetHeadIconScRsp`. */
export async function onSetHeadIconCsReq(
    req: starrail.SetHeadIconCsReq,
    session: NetSession,
): Promise<void> {
    const headIconId = Number(req?.id ?? 0);
    session.state.headIcon = headIconId;
    await persist(session);

    await session.sendRsp(CmdID.CmdSetHeadIconScRsp, {
        retcode: 0,
        currentHeadIconId: headIconId,
    });
}

/** `CmdUpdatePlayerSettingCsReq` -> `CmdUpdatePlayerSettingScRsp` (echo). */
export async function onUpdatePlayerSettingCsReq(
    req: starrail.UpdatePlayerSettingCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdUpdatePlayerSettingScRsp, {
        retcode: 0,
        playerSetting: req?.playerSetting,
    });
}

/**
 * `CmdGetPlayerDetailInfoCsReq` -> `CmdGetPlayerDetailInfoScRsp`.
 *
 * Response shape reproduced exactly as the reference builds it: only `uid`,
 * `level`, `world_level` and the head frame are populated (no nickname,
 * signature, platform or avatar lists), with the level/world level taken from
 * session state instead of pearl-sr's hard-coded 70 / 6.
 */
export async function onGetPlayerDetailInfoCsReq(
    req: starrail.GetPlayerDetailInfoCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetPlayerDetailInfoScRsp, {
        retcode: 0,
        detailInfo: {
            uid: Number(req?.uid ?? 0),
            level: session.state.level,
            worldLevel: session.state.worldLevel,
            headFrameInfo: {
                headFrameItemId: HEAD_FRAME_ITEM_ID,
                headFrameExpireTime: HEAD_FRAME_EXPIRE_TIME,
            },
        },
    });
}

/** `CmdSetPersonalCardCsReq` -> `CmdSetPersonalCardScRsp`. */
export async function onSetPersonalCardCsReq(
    req: starrail.SetPersonalCardCsReq,
    session: NetSession,
): Promise<void> {
    const id = Number(req?.id ?? 0);
    session.state.personalCard = id;
    await persist(session);

    await session.sendRsp(CmdID.CmdSetPersonalCardScRsp, {
        retcode: 0,
        currentPersonalCardId: id,
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetPhoneDataCsReq, action: onGetPhoneDataCsReq },
    { cmdId: CmdID.CmdSelectPhoneThemeCsReq, action: onSelectPhoneThemeCsReq },
    { cmdId: CmdID.CmdSelectChatBubbleCsReq, action: onSelectChatBubbleCsReq },
    { cmdId: CmdID.CmdGetPlayerBoardDataCsReq, action: onGetPlayerBoardDataCsReq },
    { cmdId: CmdID.CmdSetDisplayAvatarCsReq, action: onSetDisplayAvatarCsReq },
    { cmdId: CmdID.CmdSetAssistAvatarCsReq, action: onSetAssistAvatarCsReq },
    { cmdId: CmdID.CmdSetSignatureCsReq, action: onSetSignatureCsReq },
    { cmdId: CmdID.CmdSetGameplayBirthdayCsReq, action: onSetGameplayBirthdayCsReq },
    { cmdId: CmdID.CmdSetHeadIconCsReq, action: onSetHeadIconCsReq },
    { cmdId: CmdID.CmdSelectPhoneCaseCsReq, action: onSelectPhoneCaseCsReq },
    { cmdId: CmdID.CmdUpdatePlayerSettingCsReq, action: onUpdatePlayerSettingCsReq },
    { cmdId: CmdID.CmdGetPlayerDetailInfoCsReq, action: onGetPlayerDetailInfoCsReq },
    { cmdId: CmdID.CmdSetPersonalCardCsReq, action: onSetPersonalCardCsReq },
];
