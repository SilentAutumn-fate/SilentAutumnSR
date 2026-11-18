import { CmdID } from '../../proto/cmdId';
import { starrail } from '../../proto/starrail';
import { handlerList } from './registry';
import { onPlayerLoginFinishCsReq } from './auth';
import { onGetUnlockTeleportCsReq } from './scene';
import { gridFightBattleAvatarId, gridFightBattleRules, gridFightBuyPrices, gridFightSeasonTwoRoute, gridFightSellPrices, gridFightShopPools } from '../../data/grid-fight-stages';
import { PlayerState } from '../PlayerState';
import { resetGridFightMetaForTests } from '../grid-fight-meta';

// 局外账本按 uid 常驻进程内，用例之间要清掉，否则上一个用例领过的档位会漏到下一个。
beforeEach(() => {
    resetGridFightMetaForTests();
});

it('initializes the entrance weekly score panel with an active cycle', async () => {
    const sendRsp = jest.fn();
    const handler = handlerList.find((entry) => entry.cmdId === CmdID.CmdCycleScoreRewardGetDataCsReq);
    expect(handler).toBeDefined();
    await handler!.action({}, { sendRsp } as any);
    const [cmdId, body] = sendRsp.mock.lastCall;
    expect(cmdId).toBe(CmdID.CmdCycleScoreRewardGetDataScRsp);
    const type = starrail.CycleScoreRewardGetDataScRsp;
    const { NFEDANFBIBE: cycle } = type.decode(type.encode(type.fromObject(body)).finish());
    const now = Math.floor(Date.now() / 1000);
    expect(Number(cycle.IFEPJHGNCOI)).toBeLessThanOrEqual(now);
    expect(Number(cycle.endTime)).toBeGreaterThan(now);
    expect(Number(cycle.endTime) - Number(cycle.IFEPJHGNCOI)).toBe(14 * 86400);
});

it('records a settled run once and restores it in history and favorites after login', async () => {
    const sendRsp = jest.fn();
    const saveDataInGame = jest.fn().mockResolvedValue(undefined);
    const session = { sendRsp, state: new PlayerState(), data: { saveDataInGame } } as any;
    const call = (id: number, request: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(request, session);
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    await call(CmdID.CmdGridFightQuitSettleCsReq);
    await call(CmdID.CmdGridFightQuitSettleCsReq);
    expect(saveDataInGame).toHaveBeenCalledTimes(1);
    await call(CmdID.CmdGridFightGetArchiveCsReq, { type: 1 });
    const type = starrail.GridFightGetArchiveScRsp;
    const response = () => type.decode(type.encode(type.fromObject(sendRsp.mock.lastCall[1])).finish());
    const [record] = response().MCGGPONOCKC;
    expect(response().MCGGPONOCKC).toHaveLength(1);
    expect(record).toMatchObject({
        LJNGPCKPJLF: 2, GEGMHOMNBDG: 1,
        BFLLJJBHLDF: { reason: 1, H_9f60ad73: { AACGBEBGDPE: 20920, sectionId: 1 } },
    });
    await call(CmdID.CmdFavourArchiveCsReq, { BAAGDILLLME: record.BAAGDILLLME, IECKKCHJMLP: true });
    expect(saveDataInGame).toHaveBeenCalledTimes(2);
    const saved = JSON.parse(JSON.stringify(session.state.toSave()));
    session.state = new PlayerState();
    session.state.applySave(saved);
    await call(CmdID.CmdGridFightGetArchiveCsReq, { type: 2 });
    expect(response().MCGGPONOCKC).toEqual([expect.objectContaining({
        BAAGDILLLME: record.BAAGDILLLME, IECKKCHJMLP: true,
    })]);
});

it('validates current-season divisions before preparing a run', async () => {
    const sendRsp = jest.fn();
    const start = handlerList.find((entry) => entry.cmdId === CmdID.CmdGridFightStartGamePlayCsReq)!;
    await start.action({ divisionId: 20921 }, { sendRsp } as any);
    await start.action({ divisionId: 20101 }, { sendRsp } as any);
    expect(sendRsp.mock.calls).toEqual([
        [CmdID.CmdGridFightStartGamePlayScRsp, { retcode: 6942 }],
        [CmdID.CmdGridFightStartGamePlayScRsp, { retcode: 0, DHFOFLFCLAH: expect.any(Object) }],
    ]);
});

it('starts a formal run, exposes it in the lobby, and releases it on exit', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, sendMessage: jest.fn() } as any;
    const call = async (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    const type = starrail.GridFightStartGamePlayScRsp;

    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const started = type.decode(type.encode(type.fromObject(sendRsp.mock.lastCall[1])).finish());
    expect(started.retcode).toBe(0);
    const game = started.DHFOFLFCLAH;
    // The client constructs the session with wire field 3 and reads the
    // selected division separately from field 14.
    expect(game).toMatchObject({ uniqueId: 1, divisionId: 2, divisionId_14: 20920 });
    expect(game.NAGDJGMMCBE.find((entry) => entry.KFBIEANENKJ)?.KFBIEANENKJ).toBeDefined();
    expect(game.NAGDJGMMCBE.find((entry) => entry.CKLNMDAMJCB)?.CKLNMDAMJCB).toBeDefined();
    expect(game.NAGDJGMMCBE.find((entry) => entry.OGKMAKNOPOD)?.OGKMAKNOPOD.BBEEGMDAMIB)
        .toEqual([expect.objectContaining({ NDAHDHKGNBG: 2, OKGGFNJJLNG: 102001 })]);
    expect(game.NAGDJGMMCBE.find((entry) => entry.KLCPAAHDPJF)?.KLCPAAHDPJF).toMatchObject({
        EMOHLJHPOPC: 1801, DCAHJELNJNP: 1, sectionId: 1,
        bossInfo: { NCGHKPEMPDP: Array.from({ length: 3 }, () => expect.objectContaining({
            monsterId: expect.any(Number), roleStar: 4,
        })) },
        COEBCNGCNOO: { NKBIDLBLONC: expect.any(Object) },
        OOMMIIKPHBC: [
            { sectionId: 1, displayValue: { stageId: 70000001, CJCCMAACJDB: 1, PICMDONCKCO: 3, PFEMDGNFHNH: 0 } },
            { sectionId: 2, displayValue: { stageId: 70000002, CJCCMAACJDB: 1, PICMDONCKCO: 4, PFEMDGNFHNH: 0 } },
            { sectionId: 3, displayValue: { stageId: 70000003, CJCCMAACJDB: 2, PICMDONCKCO: 5, PFEMDGNFHNH: 1 } },
            { sectionId: 4, displayValue: { stageId: 70000004, CJCCMAACJDB: 2, PICMDONCKCO: 5, PFEMDGNFHNH: 0 } },
            { sectionId: 5, displayValue: { stageId: 70000005, CJCCMAACJDB: 5, PICMDONCKCO: 0, PFEMDGNFHNH: 0 } },
            { sectionId: 6, displayValue: { stageId: 70000006, CJCCMAACJDB: 2, PICMDONCKCO: 5, PFEMDGNFHNH: 0 } },
            { sectionId: 7, displayValue: { stageId: 70000007, CJCCMAACJDB: 3, PICMDONCKCO: 5, PFEMDGNFHNH: 0 } },
            { sectionId: 8, displayValue: { stageId: 70000008, CJCCMAACJDB: 1, PICMDONCKCO: 5, PFEMDGNFHNH: 0 } },
            { sectionId: 9, displayValue: { stageId: 70000009, CJCCMAACJDB: 4, PICMDONCKCO: 5, PFEMDGNFHNH: 0 } },
        ],
    });
    const player = game.NAGDJGMMCBE.find((entry) => entry.FAOCFBOFCJP)?.FAOCFBOFCJP;
    const shop = game.NAGDJGMMCBE.find((entry) => entry.EBHDIOGALIE)?.EBHDIOGALIE;
    expect(Object.prototype.hasOwnProperty.call(shop, 'ABBNGCPECAI')).toBe(true);
    expect(shop.ABBNGCPECAI.FIJPICNPKIG.map((entry) => entry.APAKCBFMCAB)).toEqual([75, 25, 0, 0, 0]);
    expect(Object.prototype.hasOwnProperty.call(player, 'GAJGBBFELEL')).toBe(true);
    expect(player).toMatchObject({
        gridFightLineupHp: 100, MICEOJBAKGN: 100, GAJGBBFELEL: expect.any(Object),
    });

    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20101 });
    expect(sendRsp.mock.lastCall[1].retcode).toBe(6915);
    // GetData is followed by the tutorial-state notifies, so the lobby payload is
    // the last message with that command id rather than the last call overall.
    const lobbyPayload = () =>
        sendRsp.mock.calls.filter(([id]) => id === CmdID.CmdGridFightGetDataScRsp).pop()![1];
    await call(CmdID.CmdGridFightGetDataCsReq);
    expect(lobbyPayload().DHFOFLFCLAH.uniqueId).toBe(1);
    expect(lobbyPayload().DHFOFLFCLAH.NAGDJGMMCBE).toContainEqual({ KFBIEANENKJ: {} });
    await call(CmdID.CmdGridFightResumeGamePlayCsReq, { uniqueId: 2 });
    expect(sendRsp.mock.lastCall[1].retcode).toBe(6919);
    await call(CmdID.CmdGridFightResumeGamePlayCsReq, { uniqueId: 1 });
    expect(sendRsp.mock.lastCall[1].retcode).toBe(0);
    await call(CmdID.CmdGridFightQuitLeaveGamePlayCsReq);
    expect(sendRsp.mock.lastCall[1].retcode).toBe(0);
    await call(CmdID.CmdGridFightGetDataCsReq);
    expect(lobbyPayload().DHFOFLFCLAH).toBeUndefined();
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    expect(sendRsp.mock.lastCall[1].DHFOFLFCLAH.uniqueId).toBe(2);
    await call(CmdID.CmdGetGameFormationCsReq);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGetGameFormation, { retcode: 0, FEBFMFMLHPO: [] });
});

it('preserves the current-season route order and stage references', () => {
    // Ranked route 1801: twenty-three nodes laid out 9 + 7 + 7, one stage per
    // section, all twenty-three stage rows 70000001–70000023 in order.
    expect(gridFightSeasonTwoRoute.id).toBe(1801);
    expect(gridFightSeasonTwoRoute.nodes).toHaveLength(23);
    expect(gridFightSeasonTwoRoute.nodes.map((node) => node.chapterId)).toEqual([
        1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3,
    ]);
    expect(gridFightSeasonTwoRoute.nodes.map((node) => node.stageId))
        .toEqual(Array.from({ length: 23 }, (_, index) => 70000001 + index));
    expect(gridFightSeasonTwoRoute.nodes.map((node) => node.nodeType)).toEqual([
        1, 1, 2, 2, 5, 2, 3, 1, 4, 2, 2, 5, 2, 3, 1, 4, 2, 2, 5, 2, 3, 1, 4,
    ]);
    expect(gridFightSeasonTwoRoute.nodes[0]).toMatchObject({
        sectionId: 1, nodeTemplateId: 180111, stageId: 70000001, nodeType: 1,
        parameters: [900], penaltyBonusRuleId: 90303, basicGoldReward: 3,
    });
    expect(gridFightSeasonTwoRoute.nodes[2]).toMatchObject({
        parameters: [101], offersAugment: true, penaltyBonusRuleId: 90015,
    });
    expect(gridFightSeasonTwoRoute.nodes.filter((node) => node.offersAugment)
        .map((node) => node.parameters[0])).toEqual([101, 201, 301]);
    expect(gridFightSeasonTwoRoute.nodes[4]).toMatchObject({
        nodeType: 5, parameters: [1], penaltyBonusRuleId: 0, basicGoldReward: 0,
    });
    expect(gridFightSeasonTwoRoute.nodes[22]).toMatchObject({
        sectionId: 7, nodeTemplateId: 180137, stageId: 70000023, nodeType: 4,
        parameters: [3051], penaltyBonusRuleId: 90106,
    });
    // Every non-bonfire node must name a penalty rule that carries a round cap.
    for (const node of gridFightSeasonTwoRoute.nodes.filter((entry) => entry.nodeType !== 5)) {
        expect(gridFightBattleRules.get(node.penaltyBonusRuleId)).toBeDefined();
    }
});

it('runs every combat node through the shared battle endpoint and settles after the final boss', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = async (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    const last = (id: number) => sendRsp.mock.calls.filter(([cmd]) => cmd === id).pop()?.[1];
    const combatNodes = gridFightSeasonTwoRoute.nodes.filter((node) => node.nodeType !== 5);
    const stageNode = () => {
        const stage = session.gridFightRun.NAGDJGMMCBE.find((entry: any) => entry.KLCPAAHDPJF).KLCPAAHDPJF;
        return gridFightSeasonTwoRoute.nodes.find((node) =>
            node.chapterId === stage.DCAHJELNJNP && node.sectionId === stage.sectionId);
    };

    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    for (const node of combatNodes) {
        if (node.nodeType === 3) {
            const base = node.parameters[0] * 100;
            const stage = session.gridFightRun.NAGDJGMMCBE.find((entry) => entry.KLCPAAHDPJF).KLCPAAHDPJF;
            expect(stage.IMPNAHBCADN.MPOBBIPMNNJ.BPDABHGFBFO.map((option) => option.CJADMFDOBAI))
                .toEqual([base + 1, base + 2]);
            await call(CmdID.CmdGridFightUpdateEliteBranchSelectCsReq, { MOADBALHMFD: base + 2 });
            expect(last(CmdID.CmdGridFightUpdateEliteBranchSelectScRsp).retcode).toBe(6908);
            await call(CmdID.CmdGridFightUpdateEliteBranchSelectCsReq, { MOADBALHMFD: 2 });
            expect(last(CmdID.CmdGridFightUpdateEliteBranchSelectScRsp).retcode).toBe(0);
            const updateType = starrail.GridFightSyncUpdateResultScNotify;
            const update = updateType.decode(updateType.encode(
                updateType.fromObject(last(CmdID.CmdGridFightSyncUpdateResultScNotify)),
            ).finish());
            expect(update.GCPNIHHBGGD[0].JKPJFKCBIEM).toContainEqual(
                expect.objectContaining({ FGODNPLCECH: expect.objectContaining({ MOADBALHMFD: 2 }) }),
            );
            expect(stage.IMPNAHBCADN.MPOBBIPMNNJ.MOADBALHMFD).toBe(2);
        }
        await call(CmdID.CmdGridFightEnterBattleStageCsReq);
        const response = last(CmdID.CmdGridFightEnterBattleStageScRsp);
        const type = starrail.GridFightEnterBattleStageScRsp;
        const { retcode, battleInfo } = type.decode(type.encode(type.fromObject(response)).finish());
        expect(retcode).toBe(0);
        expect(battleInfo.stageId).toBe(node.stageId);
        expect(battleInfo.EIGMKOJOEEI).toMatchObject({
            AACGBEBGDPE: 20920,
            HHEPCDMBJFI: node.nodeType === 3 ? 99 : 89,
        });
        expect(battleInfo.battleAvatarList.length).toBeGreaterThan(0);
        expect(battleInfo.monsterWaveList[0].monsterParam).toMatchObject({
            level: 90, hardLevelGroup: 1, eliteGroup: 0,
        });
        expect(battleInfo.monsterWaveList[0].monsterList.length).toBeGreaterThan(0);
        await call(CmdID.CmdGridFightGetDataCsReq);
        const lobbyType = starrail.GridFightGetDataScRsp;
        const lobby = lobbyType.decode(lobbyType.encode(lobbyType.fromObject(last(CmdID.CmdGridFightGetDataScRsp))).finish());
        const syncedStage = lobby.DHFOFLFCLAH.NAGDJGMMCBE.find((entry) => entry.KLCPAAHDPJF).KLCPAAHDPJF;
        const preview = syncedStage.IMPNAHBCADN;
        if (node.nodeType === 4) {
            const chapterBoss = syncedStage.bossInfo.NCGHKPEMPDP[node.chapterId - 1];
            expect(battleInfo.monsterWaveList[0].monsterList[0]).toMatchObject({
                monsterId: chapterBoss.monsterId,
                extraInfo: { EIGMKOJOEEI: { roleStar: chapterBoss.roleStar } },
            });
        }
        // The preview reflects the option the client picked for this node.
        const chosen = preview?.MPOBBIPMNNJ?.BPDABHGFBFO[
            (preview?.MPOBBIPMNNJ?.MOADBALHMFD || 1) - 1];
        expect(chosen?.monsterWaveList[0]?.PBLBBDBDLEK
            .map((monster) => [monster.monsterId, monster.roleStar])).toEqual(
            battleInfo.monsterWaveList[0].monsterList.map((monster) =>
                [monster.monsterId, monster.extraInfo.EIGMKOJOEEI.roleStar]),
        );
        await call(CmdID.CmdGridFightEnterBattleStageCsReq);
        expect(last(CmdID.CmdGridFightEnterBattleStageScRsp).battleInfo.battleId).toBe(battleInfo.battleId);

        const result = { battleId: battleInfo.battleId, stageId: node.stageId, endStatus: 1 };
        await call(CmdID.CmdPVEBattleResultCsReq, { ...result, battleId: battleInfo.battleId + 1 });
        expect(last(CmdID.CmdPVEBattleResultScRsp).retcode).toBe(2000);
        expect(session.battle.battleId).toBe(battleInfo.battleId);
        await call(CmdID.CmdPVEBattleResultCsReq, result);
        expect(last(CmdID.CmdGridFightEndBattleStageNotify)).toMatchObject({
            sectionId: node.sectionId, DCAHJELNJNP: node.chapterId,
        });
        const resultCount = sendRsp.mock.calls.filter(([id]) => id === CmdID.CmdGridFightEndBattleStageNotify).length;
        await call(CmdID.CmdPVEBattleResultCsReq, result);
        expect(sendRsp.mock.calls.filter(([id]) => id === CmdID.CmdGridFightEndBattleStageNotify)).toHaveLength(resultCount);
        if (node !== combatNodes.at(-1)) {
            await call(CmdID.CmdGridFightBackToPrepareReq);
            expect(last(CmdID.CmdGridFightBackToPrepareScRsp).retcode).toBe(0);
            // Rest nodes sit between combat nodes. They heal through the bonfire
            // requests and are left through the same BackToPrepare call.
            while (stageNode()?.nodeType === 5) {
                const playerBefore = session.gridFightRun.NAGDJGMMCBE
                    .find((entry: any) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
                await call(CmdID.CmdGridFightEnterBonfireCsReq);
                expect(last(CmdID.CmdGridFightEnterBonfireScRsp).retcode).toBe(0);
                await call(CmdID.CmdGridFightHandleBonfireHealHpCsReq, { queuePosition: 1 });
                expect(last(CmdID.CmdGridFightHandlePendingActionScRsp))
                    .toMatchObject({ retcode: 0, queuePosition: 1 });
                const playerAfter = session.gridFightRun.NAGDJGMMCBE
                    .find((entry: any) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
                expect(playerAfter.gridFightLineupHp).toBeGreaterThanOrEqual(playerBefore.gridFightLineupHp);
                expect(playerAfter.gridFightLineupHp).toBeLessThanOrEqual(playerAfter.MICEOJBAKGN);
                await call(CmdID.CmdGridFightBackToPrepareReq);
                expect(last(CmdID.CmdGridFightBackToPrepareScRsp).retcode).toBe(0);
            }
        }
    }
    expect(last(CmdID.CmdGridFightSettleNotify).BFLLJJBHLDF.reason).toBe(3);
    expect(last(CmdID.CmdGridFightSettleNotify).BFLLJJBHLDF.H_9f60ad73.LKCJAPIGEND).toBeGreaterThan(0);
    // A full ranked clear saturates the season exp curve (18000 score / 1500 exp).
    expect(last(CmdID.CmdGridFightSettleNotify)).toMatchObject({ NMCKJPEMACM: 1500, KEJGCDOGEDD: 1500 });
    expect(session.state).toMatchObject({ gridFightSeasonExp: 1500, gridFightWeeklyScore: 18000 });
    await call(CmdID.CmdGridFightGetDataCsReq);
    expect(last(CmdID.CmdGridFightGetDataScRsp).DHFOFLFCLAH).toBeUndefined();
});

it('tracks victory streaks and leaves the current node and rewards untouched on retreat', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = (id: number, request: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(request, session);
    const last = (id: number) => sendRsp.mock.calls.filter(([cmd]) => cmd === id).pop()?.[1];
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const player = session.gridFightRun.NAGDJGMMCBE.find((entry) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
    const fight = async (endStatus: number) => {
        await call(CmdID.CmdGridFightEnterBattleStageCsReq);
        const { battleInfo } = last(CmdID.CmdGridFightEnterBattleStageScRsp);
        await call(CmdID.CmdPVEBattleResultCsReq, {
            battleId: battleInfo.battleId, stageId: battleInfo.stageId, endStatus,
        });
    };
    await fight(1);
    // 3 node gold + 1 first-win streak bonus.
    expect(player).toMatchObject({ gold_8: 4, GDAKCOICIDA: 1, gridFightCurLevelExp: 2 });
    expect(last(CmdID.CmdGridFightEndBattleStageNotify)).toMatchObject({
        OGLOCDMNNIM: 1, JPKHBELGHCG: 1, OCCOHKIMGCN: 0,
    });
    await call(CmdID.CmdGridFightBackToPrepareReq);
    await fight(3);
    expect(player).toMatchObject({ gold_8: 4, GDAKCOICIDA: 1, gridFightCurLevelExp: 2, gridFightLineupHp: 100 });
    expect(last(CmdID.CmdGridFightEndBattleStageNotify).sectionId).toBe(1);
    await call(CmdID.CmdGridFightBackToPrepareReq);
    // Section two is the second monster node; its penalty row (90304) carries no
    // threshold penalty at all, so losing there costs no lineup HP.
    await fight(2);
    expect(player).toMatchObject({ GDAKCOICIDA: 0, gridFightLineupHp: 100 });
    expect(last(CmdID.CmdGridFightEndBattleStageNotify)).toMatchObject({ sectionId: 2, JPKHBELGHCG: 0 });
    await call(CmdID.CmdGridFightBackToPrepareReq);
    // Section three is a camp node, whose row (90015) does pay 5 HP on a loss.
    await fight(2);
    expect(player).toMatchObject({ GDAKCOICIDA: 0, gridFightLineupHp: 95 });
    expect(last(CmdID.CmdGridFightEndBattleStageNotify)).toMatchObject({ sectionId: 3, JPKHBELGHCG: 0 });
});

it('derives the run economy from the GridFightConstCommon constants', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = (id: number, request: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(request, session);
    const last = (id: number) => sendRsp.mock.calls.filter(([cmd]) => cmd === id).pop()?.[1];
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const run = session.gridFightRun;
    const player = run.NAGDJGMMCBE.find((entry: any) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
    const shop = run.NAGDJGMMCBE.find((entry: any) => entry.EBHDIOGALIE).EBHDIOGALIE;
    // GridFight_CardNumberPerRefresh = 5, LevelV2 level 3, InitGlobalPlayerHP = 100.
    expect(shop.OGDKJPDFFAI).toHaveLength(5);
    expect(player).toMatchObject({
        gold: 5, gold_8: 0, H_4a14c5ec: 3, gridFightLineupHp: 100, MICEOJBAKGN: 100,
    });
    const fight = async (endStatus: number) => {
        await call(CmdID.CmdGridFightEnterBattleStageCsReq);
        const { battleInfo } = last(CmdID.CmdGridFightEnterBattleStageScRsp);
        await call(CmdID.CmdPVEBattleResultCsReq, {
            battleId: battleInfo.battleId, stageId: battleInfo.stageId, endStatus,
        });
    };
    // 15 gold pays one interest step (DepositPerInterest = 10, GainInterestMax = 5).
    player.gold_8 = 15;
    await fight(1);
    expect(last(CmdID.CmdGridFightEndBattleStageNotify).DMNILJEGICO).toBe(1);
    // 3 node gold + 1 interest + 1 first-win streak.
    expect(player.gold_8).toBe(20);
    await call(CmdID.CmdGridFightBackToPrepareReq);
    // 55 gold is worth five steps, but GainInterestMax caps the payout at 5.
    player.gold_8 = 55;
    await fight(1);
    expect(last(CmdID.CmdGridFightEndBattleStageNotify).DMNILJEGICO).toBe(5);
    // 4 node gold + 5 interest + 2 second-win streak.
    expect(player.gold_8).toBe(66);
});

it('walks the bonfire rest node and applies the capped heal once', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = async (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    const last = (id: number) => sendRsp.mock.calls.filter(([cmd]) => cmd === id).pop()?.[1];
    const stage = () => session.gridFightRun.NAGDJGMMCBE.find((entry: any) => entry.KLCPAAHDPJF).KLCPAAHDPJF;
    const player = () => session.gridFightRun.NAGDJGMMCBE.find((entry: any) => entry.FAOCFBOFCJP).FAOCFBOFCJP;

    await call(CmdID.CmdGridFightEnterBonfireCsReq);
    expect(last(CmdID.CmdGridFightEnterBonfireScRsp).retcode).toBe(6919);

    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    await call(CmdID.CmdGridFightEnterBonfireCsReq);
    expect(last(CmdID.CmdGridFightEnterBonfireScRsp).retcode).toBe(6900);
    await call(CmdID.CmdGridFightHandleBonfireHealHpCsReq, { queuePosition: 1 });
    expect(last(CmdID.CmdGridFightHandlePendingActionScRsp).retcode).toBe(6900);

    const win = async () => {
        await call(CmdID.CmdGridFightEnterBattleStageCsReq);
        const { battleInfo } = last(CmdID.CmdGridFightEnterBattleStageScRsp);
        await call(CmdID.CmdPVEBattleResultCsReq, {
            battleId: battleInfo.battleId, stageId: battleInfo.stageId, endStatus: 1,
        });
        await call(CmdID.CmdGridFightBackToPrepareReq);
        expect(last(CmdID.CmdGridFightBackToPrepareScRsp).retcode).toBe(0);
    };
    // Ranked route 1801 reaches the first supply node after four combat nodes.
    await win();
    await win();
    await win();
    await win();
    expect(stage()).toMatchObject({ DCAHJELNJNP: 1, sectionId: 5 });

    player().gridFightLineupHp = 85;
    await call(CmdID.CmdGridFightEnterBonfireCsReq);
    expect(last(CmdID.CmdGridFightEnterBonfireScRsp).retcode).toBe(0);
    await call(CmdID.CmdGridFightHandleBonfireHealHpCsReq, { queuePosition: 2 });
    expect(last(CmdID.CmdGridFightHandlePendingActionScRsp)).toMatchObject({ retcode: 0, queuePosition: 2 });
    expect(player().gridFightLineupHp).toBe(100);
    player().gridFightLineupHp = 85;
    await call(CmdID.CmdGridFightHandleBonfireHealHpCsReq, { queuePosition: 3 });
    expect(player().gridFightLineupHp).toBe(85);

    await call(CmdID.CmdGridFightBackToPrepareReq);
    expect(last(CmdID.CmdGridFightBackToPrepareScRsp).retcode).toBe(0);
    expect(stage()).toMatchObject({ DCAHJELNJNP: 1, sectionId: 6 });
    await call(CmdID.CmdGridFightBackToPrepareReq);
    expect(stage()).toMatchObject({ DCAHJELNJNP: 1, sectionId: 6 });
});

it('charges the configured price for XP and refresh and applies a purchase only once', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = async (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    const last = (id: number) => sendRsp.mock.calls.filter(([cmd]) => cmd === id).pop()?.[1];
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    await call(CmdID.CmdGridFightEnterBattleStageCsReq);
    const { battleInfo } = last(CmdID.CmdGridFightEnterBattleStageScRsp);
    await call(CmdID.CmdPVEBattleResultCsReq, { battleId: battleInfo.battleId, stageId: battleInfo.stageId, endStatus: 1 });
    await call(CmdID.CmdGridFightBackToPrepareReq);
    const shop = session.gridFightRun.NAGDJGMMCBE.find((entry) => entry.EBHDIOGALIE).EBHDIOGALIE;
    shop.OGDKJPDFFAI = [1, 2].map((id) => ({
        KDKPDJNMMCM: id, BDPIMPJOJBK: { roleId: 1013, roleStar: 1 },
    }));
    await call(CmdID.CmdGridFightBuyExpCsReq);
    expect(last(CmdID.CmdGridFightBuyExpScRsp).retcode).toBe(0);
    const updateType = starrail.GridFightSyncUpdateResultScNotify;
    const update = () => updateType.decode(updateType.encode(
        updateType.fromObject(last(CmdID.CmdGridFightSyncUpdateResultScNotify)),
    ).finish()).GCPNIHHBGGD[0].JKPJFKCBIEM;
    expect(update().find((entry) => entry.MOFNIOJHBBL).MOFNIOJHBBL.ABBNGCPECAI.FIJPICNPKIG
        .map((entry) => entry.APAKCBFMCAB)).toEqual([55, 30, 15, 0, 0]);
    const player = session.gridFightRun.NAGDJGMMCBE.find((entry) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
    // The first node pays 3 node gold plus the 1 gold first-win streak bonus,
    // and the 4 gold XP purchase leaves the wallet empty.
    expect(player).toMatchObject({ gold_8: 0, H_4a14c5ec: 4, gridFightCurLevelExp: 0 });
    player.gold_8 = 1;
    await call(CmdID.CmdGridFightRefreshShopCsReq);
    expect(last(CmdID.CmdGridFightRefreshShopScRsp).retcode).toBe(6905);
    await call(CmdID.CmdGridFightBuyGoodsCsReq, { CGAFCMIAKLI: [1] });
    expect(last(CmdID.CmdBuyGoodRsp).retcode).toBe(0);
    expect(player.gold_8).toBe(0);
    await call(CmdID.CmdGridFightBuyGoodsCsReq, { CGAFCMIAKLI: [1] });
    expect(last(CmdID.CmdBuyGoodRsp).retcode).toBe(6912);
    const roles = session.gridFightRun.NAGDJGMMCBE.find((entry) => entry.EJIPINIKNCK).EJIPINIKNCK.gridGameRoleList;
    expect(roles).toHaveLength(4);
    expect(roles.at(-1).pos).toBe(14);
    const soldId = roles.at(-1).uniqueId;
    await call(CmdID.CmdGridFightRecycleRoleCsReq, { uniqueId: soldId });
    expect(last(CmdID.CmdGridFightRecycleRoleScRsp).retcode).toBe(0);
    expect(update().some((entry) => entry.HFCBOIOAECK === soldId)).toBe(true);
    expect(roles).toHaveLength(3);
    expect(player.gold_8).toBe(1);
    await call(CmdID.CmdGridFightRecycleRoleCsReq, { uniqueId: soldId });
    expect(last(CmdID.CmdGridFightRecycleRoleScRsp).retcode).toBe(6901);
    expect(player.gold_8).toBe(1);
    await call(CmdID.CmdGridFightBuyGoodsCsReq, { CGAFCMIAKLI: [2] });
    expect(roles.at(-1).uniqueId).toBeGreaterThan(soldId);
});

it('draws from the second rarity tier at level three and applies its configured prices', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.8);
    try {
        await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    } finally {
        random.mockRestore();
    }
    const entries = session.gridFightRun.NAGDJGMMCBE;
    const shop = entries.find((entry) => entry.EBHDIOGALIE).EBHDIOGALIE;
    const player = entries.find((entry) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
    const team = entries.find((entry) => entry.EJIPINIKNCK).EJIPINIKNCK;
    expect(shop.OGDKJPDFFAI[0].BDPIMPJOJBK.roleId).toBe(1005);
    player.gold_8 = 2;
    await call(CmdID.CmdGridFightBuyGoodsCsReq, { CGAFCMIAKLI: [1] });
    expect(player.gold_8).toBe(0);
    await call(CmdID.CmdGridFightRecycleRoleCsReq, { uniqueId: team.gridGameRoleList.at(-1).uniqueId });
    expect(player.gold_8).toBe(2);
});

it('prices purchases and sales from the official shop price columns', async () => {
    expect(gridFightBuyPrices).toEqual([
        [1, 3, 9, 27],
        [2, 6, 18, 54],
        [3, 9, 27, 81],
        [4, 12, 36, 108],
        [5, 15, 45, 135],
    ]);
    expect(gridFightSellPrices[1][1]).toBe(5);
    expect(gridFightBuyPrices[1][1]).toBe(6);

    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.8);
    try {
        await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    } finally {
        random.mockRestore();
    }
    const entries = session.gridFightRun.NAGDJGMMCBE;
    const shop = entries.find((entry: any) => entry.EBHDIOGALIE).EBHDIOGALIE;
    const player = entries.find((entry: any) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
    const team = entries.find((entry: any) => entry.EJIPINIKNCK).EJIPINIKNCK;
    const offer = shop.OGDKJPDFFAI[0];
    expect(offer.BDPIMPJOJBK.roleId).toBe(1005);
    // A star-two offer of rarity two costs the buy column's 6, not the rarity 2.
    offer.BDPIMPJOJBK.roleStar = 2;
    player.gold_8 = 6;
    await call(CmdID.CmdGridFightBuyGoodsCsReq, { CGAFCMIAKLI: [1] });
    expect(player.gold_8).toBe(0);
    const bought = team.gridGameRoleList.at(-1);
    expect(bought.roleStar).toBe(2);
    await call(CmdID.CmdGridFightRecycleRoleCsReq, { uniqueId: bought.uniqueId });
    expect(player.gold_8).toBe(5);
});

it('keeps the official rarity pools and maps alternate forms to their shared battle avatar', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = (id: number, request: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(request, session);
    const last = (id: number) => sendRsp.mock.calls.filter(([cmd]) => cmd === id).pop()?.[1];
    // GridFightRoleBasicInfo rarity counts for season 2.
    expect(gridFightShopPools.map((pool) => pool.length)).toEqual([21, 15, 15, 15, 11]);
    // Alternate forms keep their own role ID but battle as the base avatar.
    expect(gridFightBattleAvatarId(12041)).toBe(1204);
    expect(gridFightBattleAvatarId(12042)).toBe(1204);
    expect(gridFightBattleAvatarId(15063)).toBe(1506);
    expect(gridFightBattleAvatarId(11011)).toBe(1101);
    expect(gridFightBattleAvatarId(1009)).toBe(1009);
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const team = session.gridFightRun.NAGDJGMMCBE.find((entry: any) => entry.EJIPINIKNCK).EJIPINIKNCK;
    team.gridGameRoleList[0].id = 12041;
    await call(CmdID.CmdGridFightEnterBattleStageCsReq);
    const { battleInfo } = last(CmdID.CmdGridFightEnterBattleStageScRsp);
    expect(battleInfo.EIGMKOJOEEI.gridGameRoleList[0]).toMatchObject({ roleId: 12041, avatarId: 1204 });
});

it('applies position swaps atomically and excludes benched units from battle', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = async (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const move = (AAKDHMHCMLP: Array<{ uniqueId: number; pos: number }>) =>
        call(CmdID.CmdGridFightUpdatePosCsReq, { AAKDHMHCMLP });
    await move([{ uniqueId: 1, pos: 2 }]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdatePosScRsp, { retcode: 6903 });
    const swap = [{ uniqueId: 1, pos: 2 }, { uniqueId: 2, pos: 1 }];
    await move(swap);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdatePosScRsp, { retcode: 0, AAKDHMHCMLP: swap });
    await move([{ uniqueId: 3, pos: 14 }]);
    await call(CmdID.CmdGridFightEnterBattleStageCsReq);
    const battleInfo = sendRsp.mock.lastCall[1].battleInfo;
    expect(battleInfo.battleAvatarList.map((avatar) => avatar.id)).toEqual([1201, 1009]);
    await move([{ uniqueId: 1, pos: 3 }]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdatePosScRsp, { retcode: 6933 });
});

it('caps field deployments by the level and releases the cap on level up', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const entries = session.gridFightRun.NAGDJGMMCBE;
    const player = entries.find((entry) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
    const team = entries.find((entry) => entry.EJIPINIKNCK).EJIPINIKNCK;
    // The cap is the level (AvatarMaxNumber 3 at level 3), not the four front
    // slots: the season starts with exactly three deployed roles.
    expect(team.gridGameRoleList.map((role) => role.pos)).toEqual([1, 2, 3]);
    team.gridGameRoleList.push({ id: 1013, roleStar: 1, uniqueId: 4, pos: 14 });
    const move = (AAKDHMHCMLP: Array<{ uniqueId: number; pos: number }>) =>
        call(CmdID.CmdGridFightUpdatePosCsReq, { AAKDHMHCMLP });
    await move([{ uniqueId: 4, pos: 4 }]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdatePosScRsp, { retcode: 6917 });
    expect(team.gridGameRoleList.find((role) => role.uniqueId === 4).pos).toBe(14);
    player.H_4a14c5ec = 4;
    await move([{ uniqueId: 4, pos: 4 }]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdatePosScRsp, {
        retcode: 0, AAKDHMHCMLP: [{ uniqueId: 4, pos: 4 }],
    });
    expect(team.gridGameRoleList.find((role) => role.uniqueId === 4).pos).toBe(4);
    // Sending a deployed role back to the bench never hits the cap.
    await move([{ uniqueId: 1, pos: 15 }]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdatePosScRsp, {
        retcode: 0, AAKDHMHCMLP: [{ uniqueId: 1, pos: 15 }],
    });
});

it('raises the deployment cap by the avatar slots granted by worn equipment', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const entries = session.gridFightRun.NAGDJGMMCBE;
    const team = entries.find((entry) => entry.EJIPINIKNCK).EJIPINIKNCK;
    team.gridGameRoleList.push({ id: 1013, roleStar: 1, uniqueId: 4, pos: 14 });
    const move = (AAKDHMHCMLP: Array<{ uniqueId: number; pos: number }>) =>
        call(CmdID.CmdGridFightUpdatePosCsReq, { AAKDHMHCMLP });
    await move([{ uniqueId: 4, pos: 4 }]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdatePosScRsp, { retcode: 6917 });
    // 皇冠 350701 = GridFightEquipFuncType.AvatarMaxNumberAdd [1]：多给一个上阵位。
    team.PMEOPPDAMLM.push({ unique_id: 1, unique_id_10: [{ GGMPEGMEHPD: { grid_fight_equipment_id: 350701 } }] });
    await move([{ uniqueId: 4, pos: 4 }]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdatePosScRsp, {
        retcode: 0, AAKDHMHCMLP: [{ uniqueId: 4, pos: 4 }],
    });
    // 前排只有 4 个格子（fieldLimit），`min(level + 装备加成, fieldLimit)` 不会超过它：
    // 再戴一顶皇冠也只到 4，多出来的角色只能去备战席。
    team.PMEOPPDAMLM.push({ unique_id: 2, unique_id_10: [{ GGMPEGMEHPD: { grid_fight_equipment_id: 350701 } }] });
    team.gridGameRoleList.push({ id: 1014, roleStar: 1, uniqueId: 5, pos: 15 });
    await move([{ uniqueId: 5, pos: 5 }]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdatePosScRsp, {
        retcode: 0, AAKDHMHCMLP: [{ uniqueId: 5, pos: 5 }],
    });
});

it('crafts equipment from two materials and rejects illegal requests', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const entries = session.gridFightRun.NAGDJGMMCBE;
    const team = entries.find((entry: any) => entry.EJIPINIKNCK).EJIPINIKNCK;
    const bag = entries.find((entry: any) => entry.GCKLIONKMJC).GCKLIONKMJC;
    const craft = (EHDAKFEHPMF: number[], extra: object = {}) =>
        call(CmdID.CmdGridFightEquipCraftCsReq, { EHDAKFEHPMF, ...extra });
    bag.grid_fight_equipment_list.push({ unique_id: 71, grid_fight_equipment_id: 350201 });
    bag.grid_fight_equipment_list.push({ unique_id: 72, grid_fight_equipment_id: 350201 });
    // 材料实例不在背包里
    await craft([71, 99]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightEquipCraftScRsp, { retcode: 6906 });
    // 两件材料不在任何配方里（或目标与配方不符）
    await craft([71, 72], { NNFECNICMOD: 35052002 });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightEquipCraftScRsp, { retcode: 6920 });
    // 两块 350201 -> 35030101（CraftConfig#1），实例 id 取背包最大值 + 1
    await craft([71, 72]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightEquipCraftScRsp, { retcode: 0 });
    expect(bag.grid_fight_equipment_list.map((entry: any) => [entry.unique_id, entry.grid_fight_equipment_id]))
        .toEqual([[73, 35030101]]);
    // 材料已经穿在角色身上时拒绝合成（6946）
    bag.grid_fight_equipment_list.push({ unique_id: 81, grid_fight_equipment_id: 350201 });
    bag.grid_fight_equipment_list.push({ unique_id: 82, grid_fight_equipment_id: 350202 });
    team.PMEOPPDAMLM.push({ unique_id: 1, unique_id_10: [{ GGMPEGMEHPD: { grid_fight_equipment_id: 350201 } }] });
    await craft([81, 82]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightEquipCraftScRsp, { retcode: 6946 });
    expect(bag.grid_fight_equipment_list).toHaveLength(3);
});

it('claims each rank of the weekly score ladder once', async () => {
    const sendRsp = jest.fn();
    const state: any = { gridFightWeeklyScore: 3000 };
    const session = { sendRsp, state } as any;
    const call = (ids: number[]) => handlerList
        .find((entry) => entry.cmdId === CmdID.CmdGridFightTakeWeeklyRewardCsReq)!
        .action({ JKCEBHFIENI: ids }, session);
    const rsp = CmdID.CmdGridFightTakeWeeklyRewardScRsp;

    // 档位 99 既不是 `ScoreRank` 也不是 `Reward` id。
    await call([99]);
    expect(sendRsp).toHaveBeenLastCalledWith(rsp, { retcode: 6908 });
    // 3000 分只够前两档，第 3 档需要 4500。
    await call([3]);
    expect(sendRsp).toHaveBeenLastCalledWith(rsp, { retcode: 6945 });
    // 用奖励 id 请求也能认出来，落库记的是档位。
    await call([312902]);
    expect(sendRsp).toHaveBeenLastCalledWith(rsp, {
        retcode: 0,
        reward: { itemList: [{ itemId: 312902, num: 1 }] },
        NGKOFMBBGNL: [2],
    });
    expect(state.gridFightWeeklyRewardClaimed).toEqual([2]);
    // 同一档重复领取 → 6944，且不改写已领列表。
    await call([2]);
    expect(sendRsp).toHaveBeenLastCalledWith(rsp, { retcode: 6944 });
    // 一单里混入已领档位时整单拒绝（第 1 档不落库）。
    await call([1, 2]);
    expect(sendRsp).toHaveBeenLastCalledWith(rsp, { retcode: 6944 });
    expect(state.gridFightWeeklyRewardClaimed).toEqual([2]);
});

it('enables meta talents through their prerequisites and resets them', async () => {
    const sendRsp = jest.fn();
    const state: any = { gridFightPermanentTalents: [], gridFightSeasonTalents: [] };
    const session = { sendRsp, state } as any;
    const call = (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);

    // 1081 需要 1071/1072/1073 同时点亮，前置缺失 → 6941。
    await call(CmdID.CmdGridFightPermanentTalentEnableCsReq, { CKHCLKOALKE: 1081 });
    expect(sendRsp).toHaveBeenLastCalledWith(
        CmdID.CmdGridFightPermanentTalentEnableScRsp,
        { retcode: 6941, CKHCLKOALKE: 1081 },
    );
    // 根节点直接点亮，重复点 → 6939，表外 id → 6908。
    await call(CmdID.CmdGridFightPermanentTalentEnableCsReq, { CKHCLKOALKE: 1011 });
    expect(sendRsp).toHaveBeenLastCalledWith(
        CmdID.CmdGridFightPermanentTalentEnableScRsp,
        { retcode: 0, CKHCLKOALKE: 1011 },
    );
    expect(state.gridFightPermanentTalents).toEqual([1011]);
    await call(CmdID.CmdGridFightPermanentTalentEnableCsReq, { CKHCLKOALKE: 1011 });
    expect(sendRsp).toHaveBeenLastCalledWith(
        CmdID.CmdGridFightPermanentTalentEnableScRsp,
        { retcode: 6939, CKHCLKOALKE: 1011 },
    );
    await call(CmdID.CmdGridFightPermanentTalentEnableCsReq, { CKHCLKOALKE: 9999 });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightPermanentTalentEnableScRsp, { retcode: 6908 });
    // 前置具备后可以继续点亮；重置清空。
    await call(CmdID.CmdGridFightPermanentTalentEnableCsReq, { CKHCLKOALKE: 1021 });
    expect(state.gridFightPermanentTalents).toEqual([1011, 1021]);
    await call(CmdID.CmdGridFightPermanentTalentResetCsReq);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightPermanentTalentResetScRsp, { retcode: 0 });
    expect(state.gridFightPermanentTalents).toEqual([]);
    // 赛季天赋是独立的一套 id 空间（2011 是根节点）。
    await call(CmdID.CmdGridFightSeasonTalentEnableCsReq, { CKHCLKOALKE: 2011 });
    expect(sendRsp).toHaveBeenLastCalledWith(
        CmdID.CmdGridFightSeasonTalentEnableScRsp,
        { retcode: 0, CKHCLKOALKE: 2011 },
    );
    expect(state.gridFightSeasonTalents).toEqual([2011]);
    await call(CmdID.CmdGridFightSeasonTalentResetCsReq);
    expect(state.gridFightSeasonTalents).toEqual([]);
});

it('persists meta progress so a fresh session cannot reclaim the weekly ladder', async () => {
    const saveDataInGame = jest.fn().mockResolvedValue(undefined);
    const session = {
        sendRsp: jest.fn(),
        state: new PlayerState(),
        data: { saveDataInGame },
    } as any;
    session.state.gridFightWeeklyScore = 3000;
    const call = (id: number, request: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(request, session);

    await call(CmdID.CmdGridFightTakeWeeklyRewardCsReq, { JKCEBHFIENI: [1] });
    expect(session.sendRsp).toHaveBeenLastCalledWith(
        CmdID.CmdGridFightTakeWeeklyRewardScRsp,
        expect.objectContaining({ retcode: 0, NGKOFMBBGNL: [1] }),
    );
    // 周常/天赋/追踪都是账号级状态，改动后必须落盘，否则断线重连会回到旧值。
    expect(saveDataInGame).toHaveBeenCalledTimes(1);
    await call(CmdID.CmdGridFightPermanentTalentEnableCsReq, { CKHCLKOALKE: 1011 });
    await call(CmdID.CmdGridFightUpdateEquipTrackCsReq, {
        DKEIDONNDCJ: [{ BGFFICLCKHE: 350201, NALMBOOCCIN: 1 }],
    });
    expect(saveDataInGame).toHaveBeenCalledTimes(3);

    // 新会话从存档恢复：已领档位、天赋、追踪都要还在。
    const restored = new PlayerState();
    restored.applySave(JSON.parse(JSON.stringify(session.state.toSave())));
    const next = {
        sendRsp: jest.fn(),
        state: restored,
        data: { saveDataInGame: jest.fn().mockResolvedValue(undefined) },
    } as any;
    const callNext = (id: number, request: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(request, next);
    await callNext(CmdID.CmdGridFightTakeWeeklyRewardCsReq, { JKCEBHFIENI: [1] });
    expect(next.sendRsp).toHaveBeenLastCalledWith(
        CmdID.CmdGridFightTakeWeeklyRewardScRsp,
        { retcode: 6944 },
    );
    expect(restored.gridFightPermanentTalents).toEqual([1011]);
    expect(restored.gridFightEquipTrack).toEqual([350201]);
    expect(restored.gridFightWeeklyScore).toBe(3000);
});

it('grants a weekly rank and a talent to only one of two concurrent connections', async () => {
    // 同一账号两条连接各自从同一份存档 new 出 PlayerState；局外账本必须让它们排队，
    // 否则两条连接会各领一次周常档位，后保存的旧副本还会覆盖先写入的档位。
    const first = new PlayerState();
    const second = new PlayerState();
    for (const state of [first, second]) state.gridFightWeeklyScore = 3000;
    const sessionFor = (state: PlayerState) => ({
        sendRsp: jest.fn(),
        state,
        data: { saveDataInGame: jest.fn().mockResolvedValue(undefined) },
    }) as any;
    const left = sessionFor(first);
    const right = sessionFor(second);
    const handler = (id: number) => handlerList.find((entry) => entry.cmdId === id)!;

    await Promise.all([
        handler(CmdID.CmdGridFightTakeWeeklyRewardCsReq).action({ JKCEBHFIENI: [1] }, left),
        handler(CmdID.CmdGridFightTakeWeeklyRewardCsReq).action({ JKCEBHFIENI: [1] }, right),
    ]);
    const retcodes = [left, right]
        .map((session) => session.sendRsp.mock.lastCall[1].retcode)
        .sort((a: number, b: number) => a - b);
    expect(retcodes).toEqual([0, 6944]);
    // 只有赢得竞态的那条连接拿到奖励，但两边状态都并入账本，之后谁存档都是完整集合。
    const granted = [left, right]
        .map((session) => session.sendRsp.mock.lastCall[1])
        .filter((body: any) => body.retcode === 0);
    expect(granted).toHaveLength(1);
    expect(granted[0].reward.itemList).toEqual([{ itemId: 312901, num: 1 }]);
    expect(first.gridFightWeeklyRewardClaimed).toEqual([1]);
    expect(second.gridFightWeeklyRewardClaimed).toEqual([1]);

    // 天赋同样串行：同一节点并发点亮，一个成功、一个 6939。
    await Promise.all([
        handler(CmdID.CmdGridFightPermanentTalentEnableCsReq).action({ CKHCLKOALKE: 1011 }, left),
        handler(CmdID.CmdGridFightPermanentTalentEnableCsReq).action({ CKHCLKOALKE: 1011 }, right),
    ]);
    const talentCodes = [left, right]
        .map((session) => session.sendRsp.mock.lastCall[1].retcode)
        .sort((a: number, b: number) => a - b);
    expect(talentCodes).toEqual([0, 6939]);
    expect(first.gridFightPermanentTalents).toEqual([1011]);
    expect(second.gridFightPermanentTalents).toEqual([1011]);
});

it('tracks at most three recommended equipment pieces and reorders them', async () => {
    const sendRsp = jest.fn();
    const state: any = { gridFightEquipTrack: [] };
    const session = { sendRsp, state } as any;
    const call = (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);

    const track = (ids: number[]) => call(
        CmdID.CmdGridFightUpdateEquipTrackCsReq,
        { DKEIDONNDCJ: ids.map((id) => ({ BGFFICLCKHE: id })) },
    );

    await track([350201, 352301]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdateEquipTrackScRsp, { retcode: 0 });
    expect(state.gridFightEquipTrack).toEqual([350201, 352301]);
    // 表外装备 → 6906；追踪上限 3 件（`GridFight_MaxEquipTrackNum`）→ 6952。
    await track([999999]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdateEquipTrackScRsp, { retcode: 6906 });
    await track([35030101]);
    expect(state.gridFightEquipTrack).toEqual([350201, 352301, 35030101]);
    await track([35052007]);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdateEquipTrackScRsp, { retcode: 6952 });
    expect(state.gridFightEquipTrack).toHaveLength(3);
    // 优先级按 `NALMBOOCCIN` 升序重排；未追踪的装备 → 6906；空单 → 6908。
    await call(CmdID.CmdGridFightUpdateEquipTrackPriorityCsReq, {
        BFCMLCJMLOL: [
            { NALMBOOCCIN: 2, BGFFICLCKHE: 350201 },
            { NALMBOOCCIN: 1, BGFFICLCKHE: 352301 },
        ],
    });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdateEquipTrackPriorityScRsp, { retcode: 0 });
    expect(state.gridFightEquipTrack).toEqual([352301, 350201]);
    await call(CmdID.CmdGridFightUpdateEquipTrackPriorityCsReq, {
        BFCMLCJMLOL: [{ NALMBOOCCIN: 1, BGFFICLCKHE: 35052007 }],
    });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdateEquipTrackPriorityScRsp, { retcode: 6906 });
    await call(CmdID.CmdGridFightUpdateEquipTrackPriorityCsReq, { BFCMLCJMLOL: [] });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightUpdateEquipTrackPriorityScRsp, { retcode: 6908 });
});

it('records a trait effect only when the trait lists it', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {}, gridFightTraitEffects: new Map() } as any;
    const call = (req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === CmdID.CmdGridFightTraitUpdateCsReq)!.action(req, session);

    // 3006 有三个可选效果；选列表里的 → 0 并记住，选别的羁绊的效果 → 6908。
    await call({ traitId: 3006, effectId: 30062 });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightTraitUpdateScRsp, { retcode: 0 });
    expect(session.gridFightTraitEffects.get(3006)).toBe(30062);
    await call({ traitId: 3006, effectId: 10021 });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightTraitUpdateScRsp, { retcode: 6908 });
    // 没有效果列表的羁绊只接受 0；表外羁绊 → 6908；0 表示清空选择。
    await call({ traitId: 2008, effectId: 10021 });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightTraitUpdateScRsp, { retcode: 6908 });
    await call({ traitId: 2008, effectId: 0 });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightTraitUpdateScRsp, { retcode: 0 });
    await call({ traitId: 9999, effectId: 0 });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightTraitUpdateScRsp, { retcode: 6908 });
    await call({ traitId: 3006, effectId: 0 });
    expect(session.gridFightTraitEffects.has(3006)).toBe(false);
});

it('merges three copies on a full bench and synchronizes the retained role', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const entries = session.gridFightRun.NAGDJGMMCBE;
    const shop = entries.find((entry) => entry.EBHDIOGALIE).EBHDIOGALIE;
    const player = entries.find((entry) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
    const team = entries.find((entry) => entry.EJIPINIKNCK).EJIPINIKNCK;
    const first = team.gridGameRoleList[0];
    team.gridGameRoleList.push(...Array.from({ length: 9 }, (_, index) => ({
        id: index === 0 ? first.id : 1013, roleStar: 1, uniqueId: index + 4, pos: index + 14,
    })));
    session.nextGridFightRoleId = 13;
    player.gold_8 = 5;
    shop.OGDKJPDFFAI = [1, 2].map((id) => ({
        KDKPDJNMMCM: id, BDPIMPJOJBK: { roleId: id === 1 ? first.id : 1005, roleStar: 1 },
    }));
    await call(CmdID.CmdGridFightBuyGoodsCsReq, { CGAFCMIAKLI: [2] });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdBuyGoodRsp, { retcode: 6924 });
    expect(player.gold_8).toBe(5);
    await call(CmdID.CmdGridFightBuyGoodsCsReq, { CGAFCMIAKLI: [1] });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdBuyGoodRsp, { retcode: 0, CGAFCMIAKLI: [1] });
    expect(player.gold_8).toBe(4);
    expect(team.gridGameRoleList).toContainEqual({ ...first, roleStar: 2 });
    expect(team.gridGameRoleList.some((role) => role.uniqueId === 4)).toBe(false);
    const type = starrail.GridFightSyncUpdateResultScNotify;
    const [, body] = sendRsp.mock.calls.find(([id]) => id === CmdID.CmdGridFightSyncUpdateResultScNotify);
    const decoded = type.decode(type.encode(type.fromObject(body)).finish());
    expect(decoded.GCPNIHHBGGD[0].JKPJFKCBIEM).toEqual(expect.arrayContaining([
        expect.objectContaining({ HFCBOIOAECK: 4 }),
        expect.objectContaining({ CFOCDALNCBP: expect.objectContaining({ uniqueId: first.uniqueId, roleStar: 2 }) }),
    ]));
});

it('synchronizes the shop lock immediately and retains it in the current run', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp } as any;
    const call = async (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);

    await call(CmdID.CmdGridFightLockShopCsReq, { isLocked: true });
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGridFightLockShopScRsp, { retcode: 6919 });
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });

    for (const isLocked of [true, false]) {
        sendRsp.mockClear();
        await call(CmdID.CmdGridFightLockShopCsReq, { isLocked });
        expect(sendRsp).toHaveBeenCalledWith(CmdID.CmdGridFightLockShopScRsp, { retcode: 0 });
        const notify = sendRsp.mock.calls.find(([id]) => id === CmdID.CmdGridFightSyncUpdateResultScNotify);
        expect(notify).toBeDefined();
        const type = starrail.GridFightSyncUpdateResultScNotify;
        const update = type.decode(type.encode(type.fromObject(notify![1])).finish());
        expect(update.GCPNIHHBGGD[0].JKPJFKCBIEM[0].MOFNIOJHBBL.ABGEKPJHHIA).toBe(isLocked);
        await call(CmdID.CmdGridFightGetDataCsReq);
        const snapshot = sendRsp.mock.calls.find(([id]) => id === CmdID.CmdGridFightGetDataScRsp)![1];
        expect(snapshot.DHFOFLFCLAH.NAGDJGMMCBE.find((entry) => entry.EBHDIOGALIE).EBHDIOGALIE)
            .toMatchObject({ ABBNGCPECAI: expect.any(Object), ABGEKPJHHIA: isLocked });
    }
});

it('unlocks the Currency Wars guide destination before the player opens the map', async () => {
    const sendMessage = jest.fn();
    const sendRsp = jest.fn();
    const session = { state: { maxStamina: 300 }, config: { sceneConfig: new Map() }, sendMessage, sendRsp } as any;

    await onPlayerLoginFinishCsReq({}, session);
    expect(sendMessage).toHaveBeenCalledWith(CmdID.CmdUnlockTeleportNotify, {
        entryId: 2032202,
        teleportId: 2517,
    });
    await onGetUnlockTeleportCsReq({}, session);
    expect(sendRsp).toHaveBeenLastCalledWith(CmdID.CmdGetUnlockTeleportScRsp, {
        retcode: 0,
        unlockedTeleportList: [2517],
    });
});

it('populates the guide reward cache at login before the lobby is opened', async () => {
    const sendMessage = jest.fn();
    await onPlayerLoginFinishCsReq({}, {
        state: { maxStamina: 300 },
        config: {},
        sendMessage,
        sendRsp: jest.fn(),
    } as any);
    const type = starrail.OfferingInfoScNotify;
    const offerings = sendMessage.mock.calls
        .filter(([id]) => id === CmdID.CmdOfferingInfoScNotify)
        .map(([, body]) => type.decode(type.encode(type.fromObject(body)).finish()).offeringInfo);
    expect(offerings).toEqual(expect.arrayContaining([
        expect.objectContaining({ offeringId: 16, levelExp: 80, totalExp: 64000 }),
    ]));
});

it('distinguishes a fresh GridFight lobby from a successful start or shop refresh', async () => {
    const sendRsp = jest.fn();
    const sendMessage = jest.fn();
    const session = { sendRsp, sendMessage } as any;
    for (const cmdId of [CmdID.CmdGridFightGetDataCsReq, CmdID.CmdGridFightStartGamePlayCsReq, CmdID.CmdGridFightRefreshShopCsReq]) {
        expect(Number.isInteger(cmdId)).toBe(true);
        const handler = handlerList.find((entry) => entry.cmdId === cmdId);
        expect(handler).toBeDefined();
        await handler!.action({}, session);
    }
    const [lobbyId, lobbyBody] = sendRsp.mock.calls[0];
    expect(lobbyId).toBe(CmdID.CmdGridFightGetDataScRsp);
    const lobby = starrail.GridFightGetDataScRsp;
    const decodedLobby = lobby.decode(lobby.encode(lobby.fromObject(lobbyBody)).finish());
    const profile = decodedLobby.LFLCDNGALME;
    const season = profile.HFPEJIDDDJG;
    expect(decodedLobby.DHFOFLFCLAH).toBeNull();
    // Field 10 is the generic status code, so it must stay 0: the framework
    // drops a reply whose code is non-zero and the client would build no
    // GridFight profile at all.
    expect(decodedLobby.retcode).toBe(0);
    expect(profile.PKELAIPIHMF.FBJMBJKMAJA).toMatchObject({
        1: { MPJPLKKJNGE: 3, divisionId: 10950 },
        2: { MPJPLKKJNGE: 5, divisionId: 20920 },
    });
    expect(sendRsp.mock.calls.filter(([id]) => id === CmdID.CmdGridFightSyncTutorialProgressIdScNotify))
        .toEqual([[CmdID.CmdGridFightSyncTutorialProgressIdScNotify, { MPJPLKKJNGE: 5, LJNGPCKPJLF: 2 }]]);
    expect(season).toMatchObject({ ADFEKPNIFOJ: 2, GEGMHOMNBDG: 1, divisionId: 20920 });
    // The handbook must cover every category the client can render, with both
    // the "seen" and "completed" lists of the two-list messages filled in.
    // Camp and portal ids stay on the Season 1 pool by default: one unknown id
    // throws inside the client's `_GetCompletedItemCount` and blacks the page.
    const handBook = season.NLENPEPIHAC;
    expect(handBook.DNEGDNEBJMB.gridFightAvatarList).toEqual(expect.arrayContaining([1001, 1510, 11011]));
    expect(handBook.PJBIPMKACOF.gridFightItemList).toEqual(expect.arrayContaining([350101, 352801]));
    expect(handBook.JLFANEOAHOC.JICIBCFDHIH).toEqual(handBook.JLFANEOAHOC.DDIFKADGIBO);
    expect(handBook.JLFANEOAHOC.JICIBCFDHIH).toEqual(expect.arrayContaining([100101, 360601]));
    expect(handBook.EJHDGLHCNLH.DJJBKIGBGJA).toEqual(handBook.EJHDGLHCNLH.NPHOIMEEDHM);
    expect(handBook.EJHDGLHCNLH.DJJBKIGBGJA).toEqual(expect.arrayContaining([101, 1201]));
    expect(handBook.NIOAIKLPACM.HEKMEJLMGFF).toEqual(expect.arrayContaining([1, 29]));
    expect(handBook.NIOAIKLPACM.HEKMEJLMGFF).not.toContain(3051);
    expect(handBook.EECJFCNKKMB.HKKNDJJPAPI).toEqual(expect.arrayContaining([1001, 40140]));
    expect(handBook.KJIJEGAHLGB.JHGCJKCHNCO).toHaveLength(67);
    expect(handBook.KJIJEGAHLGB.MOOIOOBHGKB).toEqual(handBook.KJIJEGAHLGB.JHGCJKCHNCO);
    expect(handBook.KJIJEGAHLGB.JHGCJKCHNCO).toContain(100000);
    expect(handBook.NNIJIFGJJJA?.FLMPNGCJCAI ?? []).toEqual([]);
    expect(sendMessage).not.toHaveBeenCalled();
    // GetData also pushes the tutorial-state notifies; only the gameplay replies
    // are interesting here.
    const replies = sendRsp.mock.calls.filter(
        ([id]) => id !== CmdID.CmdGridFightGetDataScRsp && id !== CmdID.CmdGridFightSyncTutorialProgressIdScNotify
            && id !== CmdID.CmdGridFightLastTutorialFinishScNotify,
    );
    expect(replies).toEqual([
        [CmdID.CmdGridFightStartGamePlayScRsp, { retcode: 6900 }],
        [CmdID.CmdGridFightRefreshShopScRsp, { retcode: 6919 }],
    ]);
});

it('acknowledges completed tutorials and returns an empty archive for an account without runs', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp } as any;
    const finish = handlerList.find((entry) => entry.cmdId === CmdID.CmdGridFightFinishTutorialCsReq);
    const archive = handlerList.find((entry) => entry.cmdId === CmdID.CmdGridFightGetArchiveCsReq);
    await finish!.action({ EGAPEGCKDFJ: 3 }, session);
    await finish!.action({ EGAPEGCKDFJ: 3 }, session);
    await archive!.action({ type: 2 }, session);
    expect(sendRsp.mock.calls.filter(
        ([id]) => id !== CmdID.CmdGridFightSyncTutorialProgressIdScNotify
            && id !== CmdID.CmdGridFightLastTutorialFinishScNotify,
    )).toEqual([
        [CmdID.CmdGridFightFinishTutorialScRsp, { retcode: 0 }],
        [CmdID.CmdGridFightFinishTutorialScRsp, { retcode: 0 }],
        [CmdID.CmdGridFightGetArchiveScRsp, { retcode: 0, type: 2, MCGGPONOCKC: [] }],
    ]);
});

it('serves the maximum reward levels for both Currency Wars seasons', async () => {
    const sendRsp = jest.fn();
    const handler = handlerList.find((entry) => entry.cmdId === CmdID.CmdGetOfferingInfoCsReq);
    await handler!.action({ offeringIdList: [16, 11, 1, 16] }, { sendRsp } as any);
    const [, body] = sendRsp.mock.calls[0];
    const type = starrail.GetOfferingInfoScRsp;
    const decoded = type.decode(type.encode(type.fromObject(body)).finish());
    expect(decoded.offeringInfoList).toMatchObject([
        { offeringId: 16, levelExp: 80, totalExp: 64000 },
        { offeringId: 11, levelExp: 170, totalExp: 136000 },
    ]);
});

it('round-trips GridFight gameplay records as separate oneof variants', () => {
    const game = starrail.MPIMAEMCEFH;
    const encoded = game.encode(game.fromObject({
        uniqueId: 1,
        NAGDJGMMCBE: [
            { FAOCFBOFCJP: { gold: 8 } },
            { KLCPAAHDPJF: { sectionId: 101 } },
        ],
    })).finish();
    const decoded = game.decode(encoded);
    expect(decoded.NAGDJGMMCBE[0].FAOCFBOFCJP.gold).toBe(8);
    expect(decoded.NAGDJGMMCBE[1].KLCPAAHDPJF.sectionId).toBe(101);
});

it('awards the season score of the nodes a run actually cleared', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: new PlayerState() } as any;
    const call = async (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    const last = (id: number) => sendRsp.mock.calls.filter(([cmd]) => cmd === id).pop()?.[1];

    // Quitting on the first node clears nothing, so the run settles at zero.
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    await call(CmdID.CmdGridFightQuitSettleCsReq);
    expect(last(CmdID.CmdGridFightSettleNotify))
        .toMatchObject({ NMCKJPEMACM: 0, KEJGCDOGEDD: 0 });
    expect(session.state).toMatchObject({ gridFightSeasonExp: 0, gridFightWeeklyScore: 0 });

    // Clearing the first two nodes settles at chapter 1 section 2 (50 exp / 2400 score).
    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    for (let index = 0; index < 2; index += 1) {
        await call(CmdID.CmdGridFightEnterBattleStageCsReq);
        const { battleInfo } = last(CmdID.CmdGridFightEnterBattleStageScRsp);
        await call(CmdID.CmdPVEBattleResultCsReq, {
            battleId: battleInfo.battleId, stageId: battleInfo.stageId, endStatus: 1,
        });
        await call(CmdID.CmdGridFightBackToPrepareReq);
    }
    await call(CmdID.CmdGridFightQuitSettleCsReq);
    expect(last(CmdID.CmdGridFightSettleNotify))
        .toMatchObject({ NMCKJPEMACM: 50, KEJGCDOGEDD: 50 });
    expect(session.state).toMatchObject({ gridFightSeasonExp: 50, gridFightWeeklyScore: 2400 });

    // A second settlement request cannot count the same run twice.
    await call(CmdID.CmdGridFightQuitSettleCsReq);
    expect(session.state).toMatchObject({ gridFightSeasonExp: 50, gridFightWeeklyScore: 2400 });

    // The lobby payload carries the same accumulated total in `GLIFOLCEMIN`.
    await call(CmdID.CmdGridFightGetDataCsReq);
    expect(last(CmdID.CmdGridFightGetDataScRsp).LFLCDNGALME.HFPEJIDDDJG.exp)
        .toMatchObject({ KEJGCDOGEDD: 50 });
});

it('settles a defeated run without counting the node it lost on', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: new PlayerState() } as any;
    const call = async (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    const last = (id: number) => sendRsp.mock.calls.filter(([cmd]) => cmd === id).pop()?.[1];

    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    for (let index = 0; index < 2; index += 1) {
        await call(CmdID.CmdGridFightEnterBattleStageCsReq);
        const { battleInfo } = last(CmdID.CmdGridFightEnterBattleStageScRsp);
        await call(CmdID.CmdPVEBattleResultCsReq, {
            battleId: battleInfo.battleId, stageId: battleInfo.stageId, endStatus: 1,
        });
        await call(CmdID.CmdGridFightBackToPrepareReq);
    }

    // Section 3 is a camp node whose penalty rule takes 5 HP; a lineup at 5 dies there.
    const player = session.gridFightRun.NAGDJGMMCBE
        .find((entry: { FAOCFBOFCJP?: unknown }) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
    player.gridFightLineupHp = 5;
    await call(CmdID.CmdGridFightEnterBattleStageCsReq);
    const { battleInfo: lost } = last(CmdID.CmdGridFightEnterBattleStageScRsp);
    await call(CmdID.CmdPVEBattleResultCsReq, {
        battleId: lost.battleId, stageId: lost.stageId, endStatus: 2,
    });

    // The first two nodes count (50 exp / 2400 score), the lost node does not.
    expect(last(CmdID.CmdGridFightSettleNotify))
        .toMatchObject({ NMCKJPEMACM: 50, KEJGCDOGEDD: 50 });
    expect(session.state).toMatchObject({ gridFightSeasonExp: 50, gridFightWeeklyScore: 2400 });
});

it('reports the final lineup, equipment and container fields in the settle payload', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = async (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    const last = (id: number) => sendRsp.mock.calls.filter(([cmd]) => cmd === id).pop()?.[1];

    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const entries = session.gridFightRun.NAGDJGMMCBE;
    const bag = entries.find((entry: any) => entry.GCKLIONKMJC).GCKLIONKMJC;
    bag.grid_fight_equipment_list.push({ unique_id: 61, grid_fight_equipment_id: 350201 });
    bag.grid_fight_equipment_list.push({ unique_id: 62, grid_fight_equipment_id: 352301 });
    await call(CmdID.CmdGridFightQuitSettleCsReq);

    // 官方 4.6.54 的结算包会带齐阵容、装备与各容器字段（抓包 capture 第 2111 条）。
    const settle = last(CmdID.CmdGridFightSettleNotify).BFLLJJBHLDF;
    expect(settle.reason).toBe(1);
    expect(settle.grid_fight_equipment_list)
        .toEqual([{ unique_id: 61, grid_fight_equipment_id: 350201 }, { unique_id: 62, grid_fight_equipment_id: 352301 }]);
    expect(settle.gridGameRoleList.map((role: any) => role.id)).toEqual([1009, 1201, 1218]);
    expect(settle).toMatchObject({
        OAIGAGABCMK: [],
        sync_augment_info: [],
        EEGPILJDLBG: [],
        grid_fight_trait_info: [],
        JFCHLABGFJO: [],
        IBBKKFGEEPH: [],
        APABPAFGCIA: [],
        CFFCNEDGCJJ: [],
        MHLBIBGKIOB: [],
        FNNEPMAPOOF: [],
        HGAGKFEKBDA: [],
        BBEEGMDAMIB: [],
    });
    expect(settle.H_9f60ad73).toMatchObject({ EMOHLJHPOPC: 1801, AACGBEBGDPE: 20920, FMEOHKHGMJM: [] });
});

it('dresses equipment from the bag onto a role and rejects illegal requests', async () => {
    const sendRsp = jest.fn();
    const session = { sendRsp, state: {} } as any;
    const call = async (id: number, req: object = {}) =>
        handlerList.find((entry) => entry.cmdId === id)!.action(req, session);
    const dress = (req: object) => call(CmdID.CmdGridFightEquipDressCsReq, req);
    const retcode = () =>
        sendRsp.mock.calls.filter(([cmd]) => cmd === CmdID.CmdGridFightEquipDressScRsp).pop()?.[1].retcode;

    await call(CmdID.CmdGridFightStartGamePlayCsReq, { divisionId: 20920 });
    const entries = session.gridFightRun.NAGDJGMMCBE;
    const team = entries.find((entry: any) => entry.EJIPINIKNCK).EJIPINIKNCK;
    const bag = entries.find((entry: any) => entry.GCKLIONKMJC).GCKLIONKMJC;
    // 开局快照必须带空容器，否则客户端装备页把容器当缺失数据。
    expect(team.PMEOPPDAMLM).toEqual([]);
    expect(bag.grid_fight_equipment_list).toEqual([]);

    const roleUniqueId = team.gridGameRoleList[0].uniqueId;
    const stock = (uniqueId: number, equipmentId: number) =>
        bag.grid_fight_equipment_list.push(
            starrail.IJDLENJJBHJ.create({ unique_id: uniqueId, grid_fight_equipment_id: equipmentId }),
        );
    stock(901, 35030101);
    stock(902, 35030101);
    stock(903, 35030108);
    stock(904, 35030102);
    stock(905, 35052007);

    // 角色 unique_id 落在第二个字段时同样能识别。
    await dress({ MDNAGANGNKK: roleUniqueId, PEBCBLBLMPH: 901 });
    expect(retcode()).toBe(0);
    expect(team.PMEOPPDAMLM[0].unique_id).toBe(roleUniqueId);
    expect(team.PMEOPPDAMLM[0].unique_id_10[0].GGMPEGMEHPD.grid_fight_equipment_id).toBe(35030101);
    // 装备实例离开背包，只留表内 id。
    expect(bag.grid_fight_equipment_list.map((item: any) => item.unique_id)).toEqual([902, 903, 904, 905]);

    // 同一个装备 id 不能重复穿。
    await dress({ PEBCBLBLMPH: roleUniqueId, MDNAGANGNKK: 902 });
    expect(retcode()).toBe(6909);

    // 槽位上限 3：再穿两件后第四件被拒。
    await dress({ PEBCBLBLMPH: roleUniqueId, MDNAGANGNKK: 903 });
    expect(retcode()).toBe(0);
    await dress({ PEBCBLBLMPH: roleUniqueId, MDNAGANGNKK: 904 });
    expect(retcode()).toBe(0);
    await dress({ PEBCBLBLMPH: roleUniqueId, MDNAGANGNKK: 905 });
    expect(retcode()).toBe(6907);

    // 角色与装备都对不上 / 背包里没有这个实例。
    await dress({ PEBCBLBLMPH: 99, MDNAGANGNKK: 98 });
    expect(retcode()).toBe(6901);
    await dress({ PEBCBLBLMPH: roleUniqueId, MDNAGANGNKK: 12345 });
    expect(retcode()).toBe(6906);
});
