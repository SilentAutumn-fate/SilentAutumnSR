import { configManager as config } from './config_mgr';
import { createScene } from './scene_mgr';
import { onGetSceneMapInfoCsReq, onInteractPropCsReq } from '../handler/scene';

describe('default completed map exploration', () => {
    const entry = 9876501;
    const floor = 98765001;
    const states = [0, 2, 7, 9, 11, 12, 17, 18, 3, 14, 20, 101];
    const completed = [1, 1, 8, 10, 13, 13, 17, 19, 3, 14, 20, 101];
    beforeEach(() => {
        config.mapEntrance.set(entry, { ID: entry, PlaneID: 98765, FloorID: floor } as any);
        config.sceneConfig.set(entry, { entryID: entry, planeID: 98765, teleports: [], monsters: [],
            props: states.map((propState, i) => ({ groupId: 1, instId: i + 1, propId: 100 + i,
                propState, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } })) });
    });
    afterEach(() => { config.mapEntrance.delete(entry); config.sceneConfig.delete(entry); });

    it('uses completed typed states when building a free-roam scene without changing source data', () => {
        const scene = createScene(98765, floor, entry, 0);
        expect(scene.entityList.map((e: any) => e.prop.propState)).toEqual(completed);
        expect(config.getScene(entry)!.props.map(p => p.propState)).toEqual(states);
    });

    it('reports the same states in map data and prop interactions', async () => {
        const packets: any[] = [];
        const save = { propStates: {} };
        const session: any = { config, scene: { entryId: entry, floorId: floor, planeId: 98765 },
            data: { getDataInGame: () => save, saveDataInGame: async () => {} },
            sendMessage: async () => {},
            sendRsp: async (_: number, body: any) => { packets.push(body); } };
        await onGetSceneMapInfoCsReq({ sceneIdentifiers: [{ floorId: floor }] }, session);
        expect(packets[0].sceneMapInfo[0].mazePropList.map((p: any) => p.state)).toEqual(completed);
        for (let i = 0; i < states.length; i++) {
            config.interactConfig.set(98000 + i, { InteractID: 98000 + i, SrcState: states[i], TargetState: completed[i] });
            try {
                await onInteractPropCsReq({ propEntityId: 1001 + i, interactId2: 98000 + i }, session);
                expect(packets[packets.length - 1].propState).toBe(completed[i]);
            } finally { config.interactConfig.delete(98000 + i); }
        }
    });
});
