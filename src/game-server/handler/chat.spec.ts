import { CmdID } from '../../proto/cmdId';
import { starrail } from '../../proto/starrail';
import {
    handlers,
    onGetChatFriendHistoryCsReq,
    onGetFriendListInfoCsReq,
    onGetFriendLoginInfoCsReq,
    onGetPrivateChatHistoryCsReq,
} from './chat';

const PLAYER_UID = 1001;
const SERVER_CHAT_UID = 2000;

function context() {
    const sent: { cmd: number; body: any }[] = [];
    const session: any = {
        state: { uid: PLAYER_UID },
        sendRsp: async (cmd: number, body: any) => {
            sent.push({ cmd, body });
        },
        sendMessage: async (cmd: number, body: any) => {
            sent.push({ cmd, body });
        },
    };
    return { session, sent };
}

describe('friend chat bootstrap', () => {
    it('includes the mandatory native sender identity in every history message', async () => {
        const { session, sent } = context();
        await onGetPrivateChatHistoryCsReq({ targetSide: SERVER_CHAT_UID }, session);
        const type = starrail.GetPrivateChatHistoryScRsp;
        const decoded = type.decode(type.encode(type.fromObject(sent[0].body)).finish());
        for (const message of decoded.chatMessageList) {
            expect(message.CKHPFFENOBE?.roleId).toBe(SERVER_CHAT_UID);
            expect(message.messageDatas[0].chatData.messageText.length).toBeGreaterThan(0);
        }
    });
    // The client fills ChatModule._FriendContacts only from this reply, and an
    // empty list is what makes the message page fall back to the Pam tab (which
    // cannot take `/commands`). The request itself has no name in the 4.7.51
    // CmdId table, so it is registered by raw number and must stay wired up.
    it('answers the raw-numbered 3907 friend-history request with the fixture friend', async () => {
        expect(handlers.map((h) => h.cmdId)).toContain(3907);

        const { session, sent } = context();
        await onGetChatFriendHistoryCsReq({}, session);

        expect(sent).toHaveLength(2);
        expect(sent[0].cmd).toBe(CmdID.CmdGetChatFriendHistoryScRsp);
        expect(sent[0].cmd).toBe(3991);
        expect(sent[0].body.retcode).toBe(0);
        expect(sent[0].body.friendHistoryInfo).toHaveLength(1);
        expect(sent[0].body.friendHistoryInfo[0].contactSide).toBe(SERVER_CHAT_UID);
        expect(sent[0].body.friendHistoryInfo[0].lastSendTime).toBeGreaterThan(0);
    });

    it('round-trips the reply through the 4.7.51 wire types', async () => {
        const { session, sent } = context();
        await onGetChatFriendHistoryCsReq({}, session);

        const wire = starrail.GetChatFriendHistoryScRsp.encode(
            starrail.GetChatFriendHistoryScRsp.fromObject(sent[0].body),
        ).finish();
        const decoded = starrail.GetChatFriendHistoryScRsp.toObject(
            starrail.GetChatFriendHistoryScRsp.decode(wire),
            { longs: Number },
        );
        expect(decoded.retcode).toBe(0);
        expect(decoded.friendHistoryInfo).toEqual([
            expect.objectContaining({ contactSide: SERVER_CHAT_UID }),
        ]);
    });

    it('pushes one private message from the fixture friend after the friend list', async () => {
        const { session, sent } = context();
        await onGetFriendListInfoCsReq({}, session);

        expect(sent.map((s) => s.cmd)).toEqual([CmdID.CmdGetFriendListInfoScRsp, CmdID.CmdRevcMsgScNotify]);
        const push = sent[1].body;
        expect(push.chatType).toBe(1);
        expect(push.toUid).toBe(PLAYER_UID);
        expect(push.recvMessageData.CKHPFFENOBE.roleId).toBe(SERVER_CHAT_UID);
        expect(push.recvMessageData.messageDatas[0].chatData.messageText).toContain('/help');
    });

    // The gate that actually blocks the contact is FriendModule.IsFriend: the
    // client's _OnGetFriendLoginInfoScRsp *replaces* _FriendUIDList with
    // friend_uid_list, and ChatModule._IsFriendBanned rejects every uid that is
    // not in it. An empty reply therefore means "no friends", and no amount of
    // chat pushes creates a contact.
    it('reports the fixture friend in the login uid list (field 12)', async () => {
        expect(handlers.map((h) => h.cmdId)).toContain(CmdID.CmdGetFriendLoginInfoCsReq);

        const { session, sent } = context();
        await onGetFriendLoginInfoCsReq({}, session);

        expect(sent[0].cmd).toBe(CmdID.CmdGetFriendLoginInfoScRsp);
        expect(sent[0].cmd).toBe(2998);
        expect(sent[0].body.retcode).toBe(0);
        expect(sent[0].body.OMFOMBGFHPA).toEqual([SERVER_CHAT_UID]);
        expect(sent[0].body.KCGCEPPMOKM).toBeUndefined();

        const wire = starrail.GetFriendLoginInfoScRsp.encode(
            starrail.GetFriendLoginInfoScRsp.fromObject(sent[0].body),
        ).finish();
        // 0x62 == field 12, wire type 2: the client reads the uid set from here.
        expect(Buffer.from(wire).toString('hex')).toContain('6202d00f');
    });

    it('bootstraps the contact once at login and once more when the chat page opens', async () => {
        const { session, sent } = context();
        await onGetFriendListInfoCsReq({}, session);
        await onGetFriendLoginInfoCsReq({}, session);
        expect(sent.map((s) => s.cmd)).toEqual([
            CmdID.CmdGetFriendListInfoScRsp,
            CmdID.CmdRevcMsgScNotify,
            CmdID.CmdGetFriendLoginInfoScRsp,
        ]);

        await onGetChatFriendHistoryCsReq({}, session);
        expect(sent.map((s) => s.cmd)).toEqual([
            CmdID.CmdGetFriendListInfoScRsp,
            CmdID.CmdRevcMsgScNotify,
            CmdID.CmdGetFriendLoginInfoScRsp,
            CmdID.CmdGetChatFriendHistoryScRsp,
            CmdID.CmdRevcMsgScNotify,
        ]);
    });

    it('rejects nothing on the private history path: contact side stays the fixture uid', async () => {
        const { session, sent } = context();
        await onGetPrivateChatHistoryCsReq({ targetSide: PLAYER_UID }, session);
        expect(sent[0].cmd).toBe(CmdID.CmdGetPrivateChatHistoryScRsp);
        expect(sent[0].body.targetSide).toBe(PLAYER_UID);
        expect(sent[0].body.contactSide).toBe(SERVER_CHAT_UID);
    });
});
