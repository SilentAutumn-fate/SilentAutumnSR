import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { HandlerEntry } from './types';
import { handleCommand as handleCommandImpl } from '../scene/commands';
import { SERVER_NAME } from '../../common/constants';

/**
 * Friends list + private chat.
 *
 * Numbers are the 4.7.51 ones (verified against the shipped client's CmdId
 * enum and its `FriendChatPage`/`ChatModule` code — the older 2.x table that
 * pearl-sr uses differs for every command here):
 *
 *   GetFriendListInfoCsReq       (2983) -> GetFriendListInfoScRsp       (2954)
 *   GetFriendLoginInfoCsReq      (2938) -> GetFriendLoginInfoScRsp      (2998)
 *   GetChatFriendHistoryCsReq    (3907) -> GetChatFriendHistoryScRsp    (3991)
 *   GetPrivateChatHistoryCsReq   (3973) -> GetPrivateChatHistoryScRsp   (3933)
 *   GetChatEmojiListCsReq        (3926) -> GetChatEmojiListScRsp        (3978)
 *   SendMsgCsReq                 (3983) -> SendMsgScRsp                 (3954)
 *   TriggerAiPamSpeakCsReq       (9541) -> TriggerAiPamSpeakScRsp       (9542)
 *   RevcMsgScNotify              (3996) — unsolicited server -> client push
 *
 * Friend-chat bootstrap (2026-11-17): the client keeps its friend contacts in
 * `ChatModule._FriendContacts`, which is only ever filled by
 * `ChatModule._OnGetChatFriendHistoryScRsp` / `_OnRevcMsgScNotify` (both reach
 * `SafeAddContactPrivate` -> `ChatContactFriend.Create(uid)`). With an empty list
 * the message page has nobody to open, so the private chat falls back to the Pam
 * tab, which has no free-text box — i.e. in-game commands become unreachable.
 *
 * The gate that actually blocked us is friendship, not the contact packet:
 * `SafeAddContactPrivate` and `_OnGetChatFriendHistoryScRsp` both consult
 * `ChatModule._IsFriendBanned`, which is `!FriendModule.IsFriend(uid)` plus a
 * blacklist check. `FriendModule.IsFriend` reads `_FriendUIDList` (a HashSet that
 * `GetFriendLoginInfoScRsp.friend_uid_list` *replaces wholesale*) and, once a
 * friend list has been synced, `_AllFriendsBriefDataDict` — so a server that
 * answers the login-info request with an empty body can never hand the client a
 * contact, no matter how many chat packets it pushes.
 *
 * Hence three additions: report the fixture friend in
 * `GetFriendLoginInfoScRsp.friend_uid_list` (field 12), answer the 4.7.51
 * friend-history request (the client's `_FetchChatContacts` sends cmd 3907; its
 * reply id 3991 is `GFFEPIMMIMP` in the client's chat CmdId enum, whose
 * 3973/3933, 3983/3954 and 3926/3978 pairs match this server's table), and push
 * one private message from the fixture friend so `_OnRevcMsgScNotify` creates the
 * contact even if the client never asks.
 *
 * Deliberately NOT ported: `chat.onGetAiPamChatHistory` (CmdGetAiPamChatHistoryCsReq
 * 9531). It is dead code in the reference — commented out of its own handler list
 * (handlers.zig:100) and it does not compile there: it sets retcode/target_side/
 * JPCMGNGNONJ on `GetAiPamChatHistoryScRsp`, which in this protocol revision has
 * only `BDPIMPJOJBK` (pb 2). Nothing to reproduce, so nothing is registered.
 *
 * Everything here is fixture data: there is no friend or chat store, the single
 * friend is the same literal on every request, and the only mutable part is the
 * command dispatch hanging off SendMsg.
 */

/** ChatType_ChatType_Private. */
const CHAT_TYPE_PRIVATE = 1;
/** MsgType_MsgType_CustomText. */
const MSG_TYPE_CUSTOM_TEXT = 1;
/** HCMEILLLKBD_HCMEILLLKBD_JDOAIPKBIPE — the "sender" role slot both builders use. */
const HCMEILLLKBD_JDOAIPKBIPE = 1;
/** PlayingState_PlayingState_PlayingChallengePeak. */
const PLAYING_CHALLENGE_PEAK = 9;

/** Uid the fixture friend and the server's own chat replies use. */
const SERVER_CHAT_UID = 2000;

/** Fixture texts for the private chat history. */
const PRIVATE_CHAT_HISTORY = [
    'supports freesr-data.json to setup config',
    '/help for command list',
    "to use command, use '/' first",
];

/**
 * GetChatFriendHistoryCsReq in the 4.7.51 client.
 *
 * The server's CmdId table has no numeric id for this request
 * (`CmdGetChatFriendHistoryCsReq === -78`), but the client's chat CmdId enum
 * (`FAKGHKIKHAP` in the shipped build) carries `BHBEJBBHAON = 3907`, and
 * `ChatModule._FetchChatContacts` really does `mov dx, 0xf43; send`. Sending a
 * dummy for it is impossible (no name -> no type), so it is registered by raw
 * number here. The reply id below *is* in the table, so `sendRsp` resolves it.
 */
const GET_CHAT_FRIEND_HISTORY_CS_REQ = 3907;

/** Pushed once at friend-list load so the client creates the friend contact. */
const PRIVATE_CHAT_WELCOME = 'friend chat ready - send /help for the command list';

/** Unix seconds; the client stores this in `FriendHistoryInfo.lastSendTime`. */
function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * A received chat message.
 *
 * Field10 (`CKHPFFENOBE`) is mandatory for both history and pushed messages:
 * the current client's ChatMessageData.Create reads it before parsing blocks.
 * The old reference's history-only field11 leaves the client message empty.
 *
 * Nested messages are built by helpers rather than inline literals. Reason: the
 * static field checker (dev/tools/check-proto-fields.js) validates a nested object
 * literal's keys against the *enclosing* message and therefore reports every one
 * of them as unknown (observed on this file, gacha.ts and misc.ts).
 */
function textMessage(text: string): starrail.MessageChatData {
    return {
        messageType: MSG_TYPE_CUSTOM_TEXT,
        chatData: { messageText: text },
    };
}

/** History/fixture message: sender slot pb 11. */
function makeTextChat(uid: number, text: string): starrail.ChatMessageData {
    return {
        messageDatas: [textMessage(text)],
        // ChatMessageData.Create reads field10 before parsing any content blocks.
        // Without it the client builds an empty message and its renderer throws.
        CKHPFFENOBE: { roleId: uid, KPOBMNLKLOK: HCMEILLLKBD_JDOAIPKBIPE },
        BKOALKHDLOB: { roleId: uid, KPOBMNLKLOK: HCMEILLLKBD_JDOAIPKBIPE },
        // createTime stays unset: the reference builds these with no timestamp.
    };
}

/** Server-pushed reply message: sender slot pb 10. */
function serverChatMessage(text: string): starrail.ChatMessageData {
    return {
        messageDatas: [textMessage(text)],
        CKHPFFENOBE: { roleId: SERVER_CHAT_UID, KPOBMNLKLOK: HCMEILLLKBD_JDOAIPKBIPE },
    };
}

/** Unsolicited server reply, as a private-chat message from uid 2000. */
async function sendServerMessage(session: NetSession, msg: string, toUid = session.state?.uid ?? 1337): Promise<void> {
    await session.sendMessage(CmdID.CmdRevcMsgScNotify, {
        chatType: CHAT_TYPE_PRIVATE,
        toUid,
        recvMessageData: serverChatMessage(msg),
    });
}

/** Sessions that already received the bootstrap message at login / on page open. */
const contactBootstrappedAtLogin = new WeakSet<NetSession>();
const contactBootstrappedOnOpen = new WeakSet<NetSession>();

/**
 * Make `ChatModule` create a friend contact for the fixture friend by pushing
 * one private message (`_OnRevcMsgScNotify` -> `SafeAddContactPrivate`).
 *
 * Sent at most twice per session: once during login (the friend list / login-info
 * replies land before the chat page exists) and once on the first
 * `GetChatFriendHistoryCsReq`, because that request *is* the page opening — if
 * the login-time push happened before `ChatModule` had its packet handlers
 * registered, this second push is what makes the contact appear in the freshly
 * built contact list.
 */
async function bootstrapPrivateContact(session: NetSession, phase: 'login' | 'open'): Promise<void> {
    const seen = phase === 'open' ? contactBootstrappedOnOpen : contactBootstrappedAtLogin;
    if (seen.has(session)) {
        return;
    }
    seen.add(session);
    await sendServerMessage(session, PRIVATE_CHAT_WELCOME, session.state.uid);
}

// ---- command dispatch ------------------------------------------------------

/**
 * Command handling lives in `scene/commands`, which ports pearl-sr's
 * command.zig/commands/*.zig (`/help`, `/test`, `/node`, `/set`, `/tp`,
 * `/unstuck`, `/sync`, `/refill`, `/id`, `/funmode`). It returns the reply text
 * instead of sending it, because the chat message format is this module's job.
 */
async function handleCommand(session: NetSession, msg: string): Promise<void> {
    const outcome = await handleCommandImpl(session, msg);
    if (outcome.handled) {
        if (outcome.reply) await sendServerMessage(session, outcome.reply);
        return;
    }
    // Not a command at all: plain chat is echoed back as a private-chat reply.
    await sendServerMessage(session, msg);
}

// ---- handlers --------------------------------------------------------------

/**
 * One fixture friend (this server's own name).
 *
 * `assistInfoList`, `personalCard`, `headFrameInfo`, `chatBubble` and `platform`
 * are commented out in the reference source and therefore left unset here too.
 */
function friendEntry(): starrail.FriendSimpleInfo {
    return {
        playingState: PLAYING_CHALLENGE_PEAK,
        createTime: 0,
        remarkName: SERVER_NAME,
        isMarked: true,
        playerInfo: {
            uid: SERVER_CHAT_UID,
            nickname: SERVER_NAME,
            level: 70,
            headIcon: 200140,
            signature: '',
        },
    };
}

export async function onGetFriendListInfoCsReq(
    _req: starrail.GetFriendListInfoCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetFriendListInfoScRsp, {
        retcode: 0,
        friendList: [friendEntry()],
    });

    // Bootstrap the friend contact: the client only creates one from a private
    // RevcMsgScNotify or a friend-history reply. Without a contact the message
    // page opens on the Pam tab, which has no free-text box, so `/commands`
    // become unreachable. Push happens after the list so the friend exists first.
    await bootstrapPrivateContact(session, 'login');
}

/**
 * Login-time friend uid list (client cmd 2938 -> 2998).
 *
 * `FriendModule._OnGetFriendLoginInfoScRsp` replaces `_FriendUIDList`
 * (`FriendModule`+0xB0) with `friend_uid_list` (field 12) and clears
 * `_IsGotBriefFriendInfo`; `FriendModule.IsFriend` then answers from that set.
 * Answering with an empty body — which is what the dummy table used to do — is
 * therefore indistinguishable from "you have no friends", and every later
 * attempt to create a chat contact is dropped by `_IsFriendBanned`.
 */
export async function onGetFriendLoginInfoCsReq(
    _req: starrail.GetFriendLoginInfoCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetFriendLoginInfoScRsp, {
        retcode: 0,
        // Field 12 (`OMFOMBGFHPA`) — the friend uid list. Field 9
        // (`KCGCEPPMOKM`) is the blacklist and stays empty.
        OMFOMBGFHPA: [SERVER_CHAT_UID],
    });

    await bootstrapPrivateContact(session, 'login');
}

/**
 * Friend-chat contact list (client cmd 3907, see the constant above).
 *
 * `FriendHistoryInfo.lastSendTime` is int64 seconds and `contactSide` is the
 * friend's uid; the client turns each entry into a `ChatContactFriend`. One
 * fixture entry is enough — it is the same friend `friendEntry()` reports.
 */
export async function onGetChatFriendHistoryCsReq(
    _req: Record<string, never>,
    session: NetSession,
): Promise<void> {
    // Cmd 3907 has no name in the CmdId table, so NetSession cannot log it as a
    // request; without this line the only trace of the handshake would be the
    // reply packet, which is why it is logged here explicitly.
    console.log(`[chat] GetChatFriendHistoryCsReq (3907) from uid ${session.state.uid}`);
    await session.sendRsp(CmdID.CmdGetChatFriendHistoryScRsp, {
        retcode: 0,
        friendHistoryInfo: [{ contactSide: SERVER_CHAT_UID, lastSendTime: nowSeconds() }],
    });

    // This request is sent when the chat page opens, i.e. right before the page
    // builds its contact list — the one moment where a pushed contact reliably
    // shows up. Force a fresh push even if the login-time one already went out.
    await bootstrapPrivateContact(session, 'open');
}

/** The reference has no emoji data at all, so this list is always empty. */
export async function onGetChatEmojiListCsReq(
    _req: starrail.GetChatEmojiListCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetChatEmojiListScRsp, {
        retcode: 0,
        chatEmojiList: [],
    });
}

/**
 * Fixed three-message history from uid 2000. Only `targetSide` is read from the
 * request (echoed back); `contactSide` is not read and is hard-coded to 2000.
 */
export async function onGetPrivateChatHistoryCsReq(
    req: starrail.GetPrivateChatHistoryCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetPrivateChatHistoryScRsp, {
        retcode: 0,
        targetSide: req?.targetSide ?? 0,
        contactSide: SERVER_CHAT_UID,
        chatMessageList: PRIVATE_CHAT_HISTORY.map((text) => makeTextChat(SERVER_CHAT_UID, text)),
    });
}

/**
 * SendMsg.
 *
 * DEVIATION (intentional): the reference never decodes this request — it slices
 * the raw packet body at fixed offsets (`body[13 .. len-2]`) to recover the text,
 * which only works for the 2.x client's exact field ordering and trailing bytes.
 * This port decodes properly and reads
 * `messageDatas.chatData.messageText`; the observable dispatch rule is
 * unchanged: a non-empty text containing '/' goes to the command handler, any
 * other non-empty text is echoed back as a private-chat reply, and an empty text
 * only logs. `SendMsgScRsp` is sent on every path.
 */
export async function onSendMsgCsReq(req: starrail.SendMsgCsReq, session: NetSession): Promise<void> {
    const msgText: string = req?.messageDatas?.chatData?.messageText ?? '';

    if (msgText.length > 0) {
        if (msgText.includes('/')) {
            await handleCommand(session, msgText);
        } else {
            await sendServerMessage(session, msgText);
        }
    } else {
        console.debug('[chat] empty message received');
    }

    await session.sendRsp(CmdID.CmdSendMsgScRsp, { retcode: 0 });
}

/** Ai-Pam speak trigger: pure echo of the two request fields. */
export async function onTriggerAiPamSpeakCsReq(
    req: starrail.TriggerAiPamSpeakCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdTriggerAiPamSpeakScRsp, {
        retcode: 0,
        JMPPMNAONHM: req?.JMPPMNAONHM ?? 0,
        BDPIMPJOJBK: req?.BDPIMPJOJBK ?? 0,
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetFriendListInfoCsReq, action: onGetFriendListInfoCsReq },
    // Friend uid list: without it `FriendModule.IsFriend` stays false and every
    // chat contact is dropped as "banned" before it is ever created.
    { cmdId: CmdID.CmdGetFriendLoginInfoCsReq, action: onGetFriendLoginInfoCsReq },
    // Raw numeric id: the 4.7.51 name table has no entry for this request.
    { cmdId: GET_CHAT_FRIEND_HISTORY_CS_REQ, action: onGetChatFriendHistoryCsReq },
    { cmdId: CmdID.CmdGetPrivateChatHistoryCsReq, action: onGetPrivateChatHistoryCsReq },
    { cmdId: CmdID.CmdGetChatEmojiListCsReq, action: onGetChatEmojiListCsReq },
    { cmdId: CmdID.CmdSendMsgCsReq, action: onSendMsgCsReq },
    { cmdId: CmdID.CmdTriggerAiPamSpeakCsReq, action: onTriggerAiPamSpeakCsReq },
];
