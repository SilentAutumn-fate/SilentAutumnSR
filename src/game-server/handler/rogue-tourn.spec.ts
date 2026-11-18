import { configManager } from '../manager/config_mgr';
import { CmdID } from '../../proto/cmdId';
import { pickTournRoomByType } from '../../data/rogue-tourn-rooms';
import {
    onRogueTournEnablePermanentTalentCsReq,
    onRogueTournEnterRogueCocoonSceneCsReq,
    onRogueTournEnterRoomCsReq,
    onRogueTournGetCurRogueCocoonInfoCsReq,
    onRogueTournGetPermanentTalentInfoCsReq,
    onRogueTournQueryCsReq,
    onRogueTournResetPermanentTalentCsReq,
    onRogueTournLeaveCsReq,
    onRogueTournStartCsReq,
} from './rogue-tourn';

/**
 * These tests drive the handlers through the real config manager, so the scene
 * they build is the same one a client would receive (plane/floor come from the
 * shipped MapEntrance table, not from a fixture).
 */

beforeAll(() => configManager.load());

it('leaves the run with the current protocol retcode field', async () => {
    const { session, sent } = fakeSession({ tournRun: { active: true } });
    await onRogueTournLeaveCsReq({}, session);
    expect(session.tournRun).toBeNull();
    expect(sent[0].body).toEqual({ retcode: 0 });
});

interface Sent {
    cmdId: number;
    body: any;
}

function fakeSession(overrides: Record<string, any> = {}) {
    const sent: Sent[] = [];
    const session: any = {
        config: configManager,
        data: {
            getIdMain: () => 8001,
            getIdM7: () => 1001,
            getDataInGame: () => ({ lineupEntries: () => [[0, 1001]] }),
        },
        lineups: {},
        scene: null,
        tournRun: null,
        tournCocoon: null,
        sendRsp: async (cmdId: number, body: any) => { sent.push({ cmdId, body }); },
        ...overrides,
    };
    return { session, sent };
}

describe('divergent universe entry handlers', () => {
    it('answers Query with the official area roster and a saturated profile', async () => {
        const { session, sent } = fakeSession();
        await onRogueTournQueryCsReq({} as any, session);
        expect(sent).toHaveLength(1);
        expect(sent[0].cmdId).toBe(CmdID.CmdRogueTournQueryScRsp);
        expect(sent[0].body.retcode).toBe(0);
        const info = sent[0].body.LFLCDNGALME;
        // Area 201 (Tourn1/Formal/Difficulty_1) is part of the shipped roster.
        const area = info.DANNIDIPFAL.find((entry: any) => entry.areaId === 201);
        expect(area).toMatchObject({ isTakenReward: true, GNACLLNFHFD: false, FJKHIFDJMDB: true });
        const handbook = info.HAMKPLCBEBG;
        expect(handbook.PINNDKIJHFG.length).toBeGreaterThan(1000);
        expect(handbook.MMPPHJOONMI).toEqual(session.config.tournHandbook.handbookMiracleIds);
        expect(handbook.DPEBCGBEJIG).toEqual(session.config.tournHandbook.buffIds);
        expect(handbook.IFFMIDABNEE).toEqual(session.config.tournHandbook.formulaIds);
        // Level is maxed out: saturated exp and every reward id claimed.
        expect(info.DMFPCFCHHKE.exp).toBeGreaterThan(500_000);
        expect(info.DMFPCFCHHKE.FKDNANDJLGK.length).toBe(99);
        // protobufjs camelCases `end_time`: the weekly block must carry endTime.
        expect(info.BFNHJIBDMOA.endTime).toBeGreaterThan(Math.floor(Date.now() / 1000));
        // Field 6 must never be omitted: the client's Query response handler
        // dereferences it on the null branch and loses the entrance page to a
        // NullReferenceException (Player.log `_OnCmdRogueTournQueryScRsp`).
        expect(info.DLDCFHHFMID).toEqual({ GNIFODGCPAA: 1, JBKHIFHPGHM: 1 });
        // 9/10: the permanent talent tree also rides inside the lobby payload.
        expect(info.MDLPIFCHFPJ.JCOBJAMPOAL.BLHJIPBHHFO).toHaveLength(38);
        expect(info.MDLPIFCHFPJ.INJEKPLHPIF).toBe(38);
        expect(info.MDLPIFCHFPJ.JCOBJAMPOAL.BLHJIPBHHFO[0]).toMatchObject({ FFEPLIHOFLA: 2 });
        expect(info.KGPIEEKIEME.OFNIDAECPCJ).toBe(38);
        expect(info.KGPIEEKIEME.JCOBJAMPOAL.BLHJIPBHHFO).toHaveLength(38);
    });

    it('starts the run in a room whose scene belongs to the shipped config', async () => {
        const { session, sent } = fakeSession();
        await onRogueTournStartCsReq({ areaId: 1 } as any, session);
        const body = sent[0].body;
        expect(sent[0].cmdId).toBe(CmdID.CmdRogueTournStartScRsp);
        expect(body.retcode).toBe(0);
        // The first room is a battle room (type 3), as in the reference server.
        const room = pickTournRoomByType(
            configManager.tournRooms, 3, (id) => Boolean(configManager.getEntrance(id)),
        )!;
        const entrance = configManager.getEntrance(room.mapEntrance)!;
        // The scene is the client's own scene for that entrance: same plane and
        // floor, TournRogue mode, and the player's lineup.
        expect(body.IDCMACCPCBH.scene.planeId).toBe(entrance.PlaneID);
        expect(body.IDCMACCPCBH.scene.floorId).toBe(entrance.FloorID);
        expect(body.IDCMACCPCBH.scene.entryId).toBe(room.mapEntrance);
        expect(body.IDCMACCPCBH.scene.gameModeType).toBe(17);
        expect(body.IDCMACCPCBH.lineup.avatarList).toHaveLength(1);
        expect(session.scene.planeId).toBe(entrance.PlaneID);
        expect(session.tournRun.roomId).toBe(room.roomId);
        expect(session.tournRun.run.layers[0].rooms[0].roomId).toBe(room.roomId);
    });

    it('advances one room and notifies before answering EnterRoom', async () => {
        const { session, sent } = fakeSession();
        await onRogueTournStartCsReq({ areaId: 1 } as any, session);
        const firstRoomId = session.tournRun.roomId;
        sent.length = 0;

        await onRogueTournEnterRoomCsReq({ KHBLMAOPLLN: 8 } as any, session);

        expect(sent.map((entry) => entry.cmdId)).toEqual([
            CmdID.CmdRogueTournLevelInfoUpdateScNotify,
            CmdID.CmdRogueTournEnterRoomScRsp,
        ]);
        const notify = sent[0].body;
        expect(notify.status).toBe(1);
        expect(notify.BJHMFOAGMBF).toBe(1);
        expect(notify.NNFFPJOLDHK[0].status).toBe(1);
        // Only the verified field is written inside the room entry. protobufjs
        // camelCases `room_id`, so the generated object carries `roomId`.
        expect(notify.NNFFPJOLDHK[0].JEHEILKKDEF[0]).toEqual({
            status: 2, roomId: session.tournRun.roomId,
        });
        expect(sent[1].body.retcode).toBe(0);
        expect(session.tournRun.roomId).not.toBe(firstRoomId);
        expect(session.tournRun.run.layers[0].rooms[0].status).toBe(3);
        expect(session.tournRun.run.layers[0].curRoomIndex).toBe(2);
    });

    it('echoes the cocoon selection back through GetCurRogueCocoonInfo', async () => {
        const { session, sent } = fakeSession();
        await onRogueTournEnterRogueCocoonSceneCsReq({
            DCNNFJLABPL: 12, HECCOBFBJFI: 34, NBLMAGLGCGN: 56, difficultyLevel: 4,
        } as any, session);
        expect(sent[0].cmdId).toBe(CmdID.CmdRogueTournEnterRogueCocoonSceneScRsp);
        expect(sent[0].body.retcode).toBe(0);
        await onRogueTournGetCurRogueCocoonInfoCsReq({} as any, session);
        expect(sent[1].cmdId).toBe(CmdID.CmdRogueTournGetCurRogueCocoonInfoScRsp);
        expect(sent[1].body).toMatchObject({
            retcode: 0, DCNNFJLABPL: 12, HECCOBFBJFI: 34, NBLMAGLGCGN: 56, difficultyLevel: 4,
        });
    });

    it('refuses to start a scene when the room table is missing', async () => {
        const { session, sent } = fakeSession({
            config: { tournRooms: null, getEntrance: () => undefined },
        });
        await onRogueTournStartCsReq({ areaId: 1 } as any, session);
        expect(sent[0].body.retcode).toBe(2);
        expect(session.tournRun).toBeNull();
    });

    it('walks a whole run: 13 rooms across the 4/5/4 layer plan', async () => {        const { session, sent } = fakeSession();
        await onRogueTournStartCsReq({ areaId: 1 } as any, session);
        const entranceById = (entranceId: number) => configManager.getEntrance(entranceId);
        const visited: Array<{ layer: number; roomId: number; entryId: number }> = [
            { layer: 1, roomId: session.tournRun.roomId, entryId: session.tournRun.entryId },
        ];
        const layerNotices: number[] = [];

        for (let step = 0; step < 13; step++) {
            sent.length = 0;
            // 0 is outside the room-type range, so the server applies its plan.
            await onRogueTournEnterRoomCsReq({ KHBLMAOPLLN: 0 } as any, session);
            const notify = sent[0].body;
            const scene = sent[1].body;
            layerNotices.push(notify.BJHMFOAGMBF);
            expect(scene.retcode).toBe(0);
            expect(sent[1].cmdId).toBe(CmdID.CmdRogueTournEnterRoomScRsp);
            visited.push({
                layer: notify.BJHMFOAGMBF,
                roomId: session.tournRun.roomId,
                entryId: session.tournRun.entryId,
            });
        }

        // Every scene came from a room whose MapEntrance the client ships.
        for (const stop of visited) {
            const entrance = entranceById(stop.entryId);
            expect(entrance).toBeTruthy();
            expect(stop.entryId).toBe(
                configManager.tournRooms!.rooms.find((room) => room.roomId === stop.roomId)!.mapEntrance,
            );
        }
        // The notify reports the layer the player has moved INTO. The 13th
        // advance finishes the last room and keeps the player in layer 3.
        expect(layerNotices).toEqual([1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
        // 4 + 5 + 4 rooms: 13 distinct rooms; the final stop stays on the last one.
        expect(visited).toHaveLength(14);
        expect(new Set(visited.map((stop) => stop.roomId)).size).toBe(13);
        expect(visited[13].roomId).toBe(visited[12].roomId);
        expect(session.tournRun.run.layers.map((layer) => layer.status)).toEqual([2, 2, 2]);
        expect(session.tournRun.run.layers[2].rooms[3].status).toBe(3);
    });
});

describe('divergent universe permanent talent tree', () => {
    it('reports every official node as activated', async () => {
        const { session, sent } = fakeSession();
        await onRogueTournGetPermanentTalentInfoCsReq({} as any, session);
        expect(sent).toHaveLength(1);
        expect(sent[0].cmdId).toBe(CmdID.CmdRogueTournGetPermanentTalentInfoScRsp);
        expect(sent[0].body.retcode).toBe(0);
        const info = sent[0].body.DPABCOHLPLH;
        const nodes = info.JCOBJAMPOAL.BLHJIPBHHFO;
        // 38 rows in the official `RogueTournPermanentTalent` table.
        expect(nodes).toHaveLength(38);
        expect(info.INJEKPLHPIF).toBe(38);
        // Status 2 = activated (`RogueTalentDataItem.IsActivated`).
        expect(nodes.every((node: any) => node.FFEPLIHOFLA === 2)).toBe(true);
        expect(nodes.map((node: any) => node.CKHCLKOALKE)).toContain(100);
    });

    it('answers enable and reset with the same maxed tree', async () => {
        const { session, sent } = fakeSession();
        await onRogueTournEnablePermanentTalentCsReq({ CKHCLKOALKE: 100 } as any, session);
        await onRogueTournResetPermanentTalentCsReq({} as any, session);
        expect(sent.map((entry) => entry.cmdId)).toEqual([
            CmdID.CmdRogueTournEnablePermanentTalentScRsp,
            CmdID.CmdRogueTournResetPermanentTalentScRsp,
        ]);
        for (const entry of sent) {
            expect(entry.body.retcode).toBe(0);
            expect(entry.body.DPABCOHLPLH.JCOBJAMPOAL.BLHJIPBHHFO).toHaveLength(38);
        }
    });

    it('stays well-formed when the talent table is missing', async () => {
        const { session, sent } = fakeSession({ config: { tournTalents: null } });
        await onRogueTournGetPermanentTalentInfoCsReq({} as any, session);
        expect(sent[0].body.retcode).toBe(0);
        expect(sent[0].body.DPABCOHLPLH.JCOBJAMPOAL.BLHJIPBHHFO).toEqual([]);
    });
});

