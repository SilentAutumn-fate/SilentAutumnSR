import { CmdID } from '../../proto/cmdId';
import { starrail } from '../../proto/starrail';
import {
    handlers, onGetMissionDataCsReq, onGetMissionStatusCsReq, onGetTutorialCsReq, onGetTutorialGuideCsReq,
} from './mission';

it('provides the guide prerequisites in the initial mission data and status refresh', async () => {
    const sendRsp = jest.fn();
    const session = {
        sendRsp,
        config: { mainMissionConfig: new Map([[8016101, { MainMissionID: 8016101 }]]) },
    } as any;

    await onGetMissionDataCsReq({}, session);
    const [cmd, body] = sendRsp.mock.calls[0];
    expect(cmd).toBe(CmdID.CmdGetMissionDataScRsp);
    const type = starrail.GetMissionDataScRsp;
    const decoded = type.decode(type.encode(type.fromObject(body)).finish());
    expect(decoded.finishedMainMissionIdList).toEqual(expect.arrayContaining([8016101, 8047206]));
    const finishedIds = decoded.missionList_11
        .filter((mission) => mission.status === starrail.MissionStatus.MISSION_FINISH)
        .map((mission) => mission.id);
    expect(finishedIds).toEqual(expect.arrayContaining([
        803710003, 803710005, 802370101, 804150001,
        804720601, 804720602, 804720603,
        802640102, 802640103, 802640104, 802640105,
        802640106, 802640107, 802640108, 802640109,
    ]));

    await onGetMissionStatusCsReq({ subMissionIdList: [803710003, 123] }, session);
    const refreshedIds = sendRsp.mock.calls[1][1].subMissionStatusList.map((mission: any) => mission.id);
    expect(refreshedIds).toEqual([...finishedIds, 123]);
    expect(sendRsp.mock.calls[1][1].finishedMainMissionIdList).toContain(8047206);
});

it('returns the completed tutorial record on unlock and finish', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp } as any;
    for (const [requestId, responseId, request, expected] of [
        [CmdID.CmdUnlockTutorialCsReq, CmdID.CmdUnlockTutorialScRsp, { tutorialId: 10065 },
            { tutorial: { id: 10065, status: 2 } }],
        [CmdID.CmdFinishTutorialCsReq, CmdID.CmdFinishTutorialScRsp, { tutorialId: 10065 },
            { tutorial: { id: 10065, status: 2 } }],
        [CmdID.CmdUnlockTutorialGuideCsReq, CmdID.CmdUnlockTutorialGuideScRsp, { groupId: 100, type: 1 },
            { tutorialGuide: { id: 100, type: 1, status: 2 } }],
        [CmdID.CmdFinishTutorialGuideCsReq, CmdID.CmdFinishTutorialGuideScRsp, { groupId: 100, type: 1 },
            { tutorialGuide: { id: 100, type: 1, status: 2 } }],
    ] as const) {
        const handler = handlers.find((entry) => entry.cmdId === requestId);
        expect(handler).toBeDefined();
        await handler!.action(request, session);
        expect(sendRsp).toHaveBeenLastCalledWith(responseId, { retcode: 0, ...expected });
    }
});

it('marks every client-only tutorial step complete even with older tables', async () => {
    const sendRsp = jest.fn();
    await onGetTutorialCsReq({}, { sendRsp, config: { tutorialConfig: new Map() } } as any);
    const [cmd, body] = sendRsp.mock.calls[0];
    expect(cmd).toBe(CmdID.CmdGetTutorialScRsp);
    const ids = body.tutorialList.map((tutorial: any) => tutorial.id);
    // The 31 ids below exist only in the 4.6.54 client (enumerated from
    // Config/Level/Tutorial/Tutorial_<id>.json in its DesignData packages).
    // Any id the server does not report is "not finished" for the client, which
    // then pops the matching guide overlay (这就是登录后弹出的命途回响/复活装置指引).
    expect(ids).toEqual([
        4062, 9530, 9680, 9681,
        10051, 10052, 10053, 10054, 10055, 10056, 10057, 10058, 10059, 10060,
        10061, 10062, 10063, 10064, 10065,
        46001, 46002, 46003,
        315020, 315060, 315100, 315110,
        10441060, 10441217, 20431070, 20431080, 20451080,
    ]);
    expect(body.tutorialList.every((tutorial: any) => tutorial.status === starrail.TutorialStatus.TUTORIAL_FINISH))
        .toBe(true);
});

it('reports every guide finished under both TutorialGuideType values', async () => {
    const sendRsp = jest.fn();
    const session = {
        sendRsp,
        config: {
            tutorialGuideConfig: new Map([
                [9101, { GroupID: 9101, TutorialType: 4 }],
                [9201, { GroupID: 9201, TutorialType: 1 }],
            ]),
        },
    } as any;

    await onGetTutorialGuideCsReq({}, session);

    // TutorialGuideType only has 0 (default) and 1 (subguide); the table's
    // TutorialType (1..5) is a different classification the client never matches.
    // 2255/2256 only exist in the 4.6.54 client and are reported too.
    expect(sendRsp).toHaveBeenCalledWith(CmdID.CmdGetTutorialGuideScRsp, {
        retcode: 0,
        tutorialGuideList: [
            { id: 9101, type: 0, status: starrail.TutorialStatus.TUTORIAL_FINISH },
            { id: 9101, type: 1, status: starrail.TutorialStatus.TUTORIAL_FINISH },
            { id: 9201, type: 0, status: starrail.TutorialStatus.TUTORIAL_FINISH },
            { id: 9201, type: 1, status: starrail.TutorialStatus.TUTORIAL_FINISH },
            { id: 2255, type: 0, status: starrail.TutorialStatus.TUTORIAL_FINISH },
            { id: 2255, type: 1, status: starrail.TutorialStatus.TUTORIAL_FINISH },
            { id: 2256, type: 0, status: starrail.TutorialStatus.TUTORIAL_FINISH },
            { id: 2256, type: 1, status: starrail.TutorialStatus.TUTORIAL_FINISH },
        ],
    });
});

it('echoes the guide type the client sends back on unlock and finish', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, config: { tutorialGuideConfig: new Map() } } as any;

    const unlock = handlers.find((entry) => entry.cmdId === CmdID.CmdUnlockTutorialGuideCsReq)!;
    await unlock.action({ groupId: 9101, type: 1 } as any, session);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdUnlockTutorialGuideScRsp, {
        retcode: 0,
        tutorialGuide: { id: 9101, type: 1, status: starrail.TutorialStatus.TUTORIAL_FINISH },
    });

    const finish = handlers.find((entry) => entry.cmdId === CmdID.CmdFinishTutorialGuideCsReq)!;
    await finish.action({ groupId: 9101, type: 1 } as any, session);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdFinishTutorialGuideScRsp, {
        retcode: 0,
        tutorialGuide: { id: 9101, type: 1, status: starrail.TutorialStatus.TUTORIAL_FINISH },
    });
});
