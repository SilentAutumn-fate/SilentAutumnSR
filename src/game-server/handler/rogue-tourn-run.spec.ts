import {
    advanceTournRun,
    assignCurrentRoom,
    createTournRun,
    currentLayer,
    currentRoomSlot,
    nextRoomType,
    TOURN_LAYER_PLAN,
    TOURN_LAYER_STATUS,
    TOURN_ROOM_STATUS,
} from './rogue-tourn-run';

/**
 * The run model is a port of the 2.7.51 reference bookkeeping. These tests pin
 * the layer plan, the room-status transitions and the type policy, so a future
 * change to either is a deliberate edit rather than a silent drift.
 */

describe('divergent universe run model', () => {
    it('creates the reference layer plan with only the first layer active', () => {
        const run = createTournRun(1);
        expect(run.layers.map((layer) => layer.layerId)).toEqual(TOURN_LAYER_PLAN.map((layer) => layer.layerId));
        expect(run.layers.map((layer) => layer.rooms.length)).toEqual([4, 5, 4]);
        expect(run.curLayerIndex).toBe(1);
        expect(run.layers[0].status).toBe(TOURN_LAYER_STATUS.processing);
        expect(run.layers[1].status).toBe(TOURN_LAYER_STATUS.none);
        expect(currentRoomSlot(run)).toMatchObject({ roomIndex: 1, roomId: 0, status: TOURN_ROOM_STATUS.none });
    });

    it('advances inside a layer, then across layers, then reports the run finished', () => {
        const run = createTournRun(1);
        assignCurrentRoom(run, 8040101);

        // 1101 has 4 rooms: three advances stay in the same layer.
        expect(advanceTournRun(run)).toMatchObject({ layerIndex: 1, roomIndex: 2, finished: false });
        expect(advanceTournRun(run)).toMatchObject({ layerIndex: 1, roomIndex: 3, finished: false });
        expect(advanceTournRun(run)).toMatchObject({ layerIndex: 1, roomIndex: 4, finished: false });
        // The fourth room finishes layer 1.
        expect(advanceTournRun(run)).toMatchObject({ layerIndex: 2, roomIndex: 1, finished: false });
        expect(run.layers[0].status).toBe(TOURN_LAYER_STATUS.finish);
        expect(run.layers[1].status).toBe(TOURN_LAYER_STATUS.processing);
        // The finished room keeps its roomId and becomes finish.
        expect(run.layers[0].rooms[3].status).toBe(TOURN_ROOM_STATUS.finish);

        // 1201 has 5 rooms, 1301 has 4: 4 + 5 + 4 = 13 rooms in a run.
        for (let step = 0; step < 5; step++) advanceTournRun(run);
        expect(run.curLayerIndex).toBe(3);
        for (let step = 0; step < 3; step++) {
            expect(advanceTournRun(run).finished).toBe(false);
        }
        expect(advanceTournRun(run)).toMatchObject({ finished: true });
        expect(currentLayer(run).status).toBe(TOURN_LAYER_STATUS.finish);
    });

    it('assigns a room to the current slot only and marks it processing', () => {
        const run = createTournRun(1);
        assignCurrentRoom(run, 11034012);
        expect(currentRoomSlot(run)).toMatchObject({ roomId: 11034012, status: TOURN_ROOM_STATUS.processing });
        expect(run.layers[0].rooms[1].roomId).toBe(0);
    });

    it('follows the reference room-type policy for scripted rooms', () => {
        const run = createTournRun(1);
        // Layer 1101: room 3 is the boss room.
        run.layers[0].curRoomIndex = 3;
        expect(nextRoomType(run)).toBe(1);
        // Layer 1201: room 4 is the boss room.
        run.curLayerIndex = 2;
        run.layers[1].curRoomIndex = 4;
        expect(nextRoomType(run)).toBe(1);
        // Layer 1301: room 2 is the respite room, room 3 boss, room 4 ends it.
        run.curLayerIndex = 3;
        run.layers[2].curRoomIndex = 2;
        expect(nextRoomType(run)).toBe(10);
        run.layers[2].curRoomIndex = 3;
        expect(nextRoomType(run)).toBe(1);
        run.layers[2].curRoomIndex = 4;
        expect(nextRoomType(run)).toBe(0);
    });

    it('falls back to a deterministic normal room type on other rooms', () => {
        const run = createTournRun(1);
        const types = new Set<number>();
        for (let room = 1; room <= 2; room++) {
            run.layers[0].curRoomIndex = room;
            const type = nextRoomType(run);
            expect([3, 4, 5, 7, 8]).toContain(type);
            types.add(type);
        }
        // Deterministic: the same room yields the same type every time.
        run.layers[0].curRoomIndex = 1;
        expect(nextRoomType(run)).toBe(nextRoomType(run));
    });

    it('accepts a layer plan from the official area table', () => {
        // Area 301 is Tourn2/Formal/Difficulty_1: layers 2101/2201/2301 (4/5/4).
        const run = createTournRun(301, [
            { layerId: 2101, roomCount: 4, layerNumId: 101 },
            { layerId: 2201, roomCount: 5, layerNumId: 102 },
            { layerId: 2301, roomCount: 4, layerNumId: 103 },
        ]);
        expect(run.layers.map((layer) => layer.layerId)).toEqual([2101, 2201, 2301]);
        expect(run.layers.map((layer) => layer.rooms.length)).toEqual([4, 5, 4]);
        expect(run.layers.map((layer) => layer.layerNumId)).toEqual([101, 102, 103]);
        // The room-type policy keys off the level number, not the layer id.
        run.layers[0].curRoomIndex = 3;
        expect(nextRoomType(run)).toBe(1);
    });

    it('derives a level number for plans without one', () => {
        const run = createTournRun(201, [{ layerId: 1101, roomCount: 4 }]);
        expect(run.layers[0].layerNumId).toBe(101);
    });
});
