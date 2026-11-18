import { configManager as config } from './config_mgr';
import { DataInGame } from '../../data/loadDataInGame';
import { onInteractPropCsReq, onGetSceneMapInfoCsReq } from '../handler/scene';
import { starrail } from '../../proto/starrail';
import { applySavedPropStates } from './map-exploration';
import { createScene } from './scene_mgr';
import { ConfigManager } from './config_mgr';

describe('operable map mechanisms', () => {
    it('loads the native interaction table including bridge, elevator and custom operations', () => {
        const native = new ConfigManager();
        native.load();
        expect(native.interactConfig.size).toBe(225);
        for (const [id, state] of [[1340, 4], [1360, 6], [3023, 15], [115140, 14], [1010109, 109]]) {
            expect(native.interactConfig.get(id)?.TargetState).toBe(state);
        }
    });
    const entry = 9876601, floor = 98766001;
    beforeEach(() => {
        config.mapEntrance.set(entry, { ID: entry, FloorID: floor, PlaneID: 98766 } as any);
        config.sceneConfig.set(entry, { entryID: entry, planeID: 98766, teleports: [], monsters: [], props: [
            { groupId: 5, instId: 300001, propId: 77, propState: 3,
                pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }] });
        config.interactConfig.set(99001, { InteractID: 99001, SrcState: 3, TargetState: 4 });
        config.interactConfig.set(99002, { InteractID: 99002, SrcState: 4, TargetState: 3 });
    });
    afterEach(() => { config.mapEntrance.delete(entry); config.sceneConfig.delete(entry);
        config.interactConfig.delete(99001); config.interactConfig.delete(99002); });

    it('moves a bridge to the configured target, transmits the 4.7 wire state and restores it after reload', async () => {
        let save = new DataInGame();
        const packets: any[] = [];
        const notifies: any[] = [];
        const session: any = { config, scene: { entryId: entry, floorId: floor, planeId: 98766, gameModeType: 1 },
            data: { getDataInGame: () => save, saveDataInGame: jest.fn(async () => {}) },
            sendRsp: async (_: number, body: any) => { packets.push(body); },
            sendMessage: async (_: number, body: any) => { notifies.push(body); } };
        await onInteractPropCsReq({ propEntityId: 1001, interactId2: 99001 }, session);
        const wire = starrail.InteractPropScRsp.decode(starrail.InteractPropScRsp.encode(packets[0]).finish());
        expect(wire.propState).toBe(4);
        expect(wire.retcode).toBe(0);
        const refresh = starrail.SceneGroupRefreshScNotify.decode(
            starrail.SceneGroupRefreshScNotify.encode(notifies[0]).finish());
        expect(refresh.groupRefreshList[0].refreshEntity[0].addEntity.prop.propState).toBe(4);
        expect(session.data.saveDataInGame).toHaveBeenCalled();
        save = DataInGame.fromJson(JSON.parse(JSON.stringify(save.toJson())));
        const scene = createScene(98766, floor, entry, 0);
        applySavedPropStates(scene, save.propStates);
        expect(scene.entityList[0].prop.propState).toBe(4);
        await onGetSceneMapInfoCsReq({ sceneIdentifiers: [{ floorId: floor }] }, session);
        expect(packets[1].sceneMapInfo[0].mazePropList[0].state).toBe(4);
        await onInteractPropCsReq({ propEntityId: 1001, interactId2: 99002 }, session);
        expect(packets[2].propState).toBe(3);
    });

    it('does not acknowledge unknown interactions or stale entities as successful operations', async () => {
        const save = new DataInGame(), responses: any[] = [];
        const session: any = { config, scene: { entryId: entry, floorId: floor, gameModeType: 1 },
            data: { getDataInGame: () => save, saveDataInGame: jest.fn() },
            sendRsp: async (_: number, body: any) => { responses.push(body); } };
        await onInteractPropCsReq({ propEntityId: 1001, interactId2: 999999 }, session);
        await onInteractPropCsReq({ propEntityId: 9999, interactId2: 99001 }, session);
        expect(responses.every(p => p.retcode !== 0)).toBe(true);
        expect(session.data.saveDataInGame).not.toHaveBeenCalled();
    });
});
