import { CmdID } from './cmdId';
import { starrail } from './starrail';
import { handlerList } from '../game-server/handler/registry';
import { onSetChallengeTierceLineupCsReq } from '../game-server/handler/challenge';
import { loadStageInfo, challengeAvatarIds, challengeBuffId } from '../game-server/manager/challenge_mgr';
import { onSendMsgCsReq } from '../game-server/handler/chat';

it('routes the client native EnterScene request and retains its destination on wire', () => {
    expect(CmdID.CmdEnterSceneCsReq).toBe(1448);
    expect(handlerList.some(h => h.cmdId === 1448)).toBe(true);
    const type = starrail.EnterSceneCsReq;
    const request = type.fromObject({ entryId: 2058101, teleportId: 2058107,
        sceneIdentifier: { floorId: 20581001 }, isCloseMap: true });
    const decoded = type.decode(type.encode(request).finish());
    expect(decoded.entryId).toBe(2058101);
    expect(decoded.teleportId).toBe(2058107);
    expect(decoded.sceneIdentifier.floorId).toBe(20581001);
    expect(decoded.isCloseMap).toBe(true);
});

it('decodes slash commands and sends the command reply back through the native chat payload', async () => {
    const type = starrail.SendMsgCsReq;
    const req = type.decode(type.encode(type.fromObject({ messageDatas: {
        messageType: 1, chatData: { messageText: '/help' },
    } })).finish());
    const sent: any[] = [];
    await onSendMsgCsReq(req, { state: { uid: 1337 }, sendRsp: async () => {},
        sendMessage: async (_: number, body: any) => { sent.push(body); },
    } as any);
    expect(JSON.stringify(sent)).toContain('/tp');
    expect(sent[0].toUid).toBe(1337);
});

it('keeps the tierce lineup and selected buff after decoding the native request', async () => {
    const type = starrail.SetChallengeTierceLineupCsReq;
    const req = type.decode(type.encode(type.fromObject({ challengeId: 123,
        stageInfoList: [{ buffId: 777, lineup: [{ id: 1514, avatarType: 3 }] }],
    })).finish());
    const session: any = { sendRsp: async () => {} };
    await onSetChallengeTierceLineupCsReq(req, session);
    loadStageInfo(session, 123, 0);
    expect(challengeAvatarIds(session)).toEqual([1514]);
    expect(challengeBuffId(session)).toBe(777);
});
