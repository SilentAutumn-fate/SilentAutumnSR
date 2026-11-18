/**
 * Divergent Universe (差分宇宙) run model.
 *
 * This is a port of the run bookkeeping from the 2.7.51 reference server
 * (`_probe/reference-hkrpg-go/gameserver/model/db_rogue_tourn.go`, functions
 * `NewCurRogueTourn`, `UpdateRogueTournEnterRoom`, `GetNextRogueTournRoomType`).
 * The reference hardcodes three levels (1101 with 4 rooms, 1201 with 5, 1301
 * with 4) and a room-type policy; those constants are reproduced here because
 * the 4.6.54 client ships the same table schema (`RogueTournLayerRow`:
 * `LayerID`/`LayerNumID`, `RogueTournLayerRoomRow`: `LayerID`/`RoomIndex`/
 * `Door1..3`) but the row DATA is not extractable yet. Treat the plan below as
 * the reference server's behaviour, not as verified client configuration.
 *
 * Pure logic only: no session, no protobuf, no I/O. That keeps the state
 * machine unit-testable and lets the handler stay a thin translation layer.
 */

/** Level list used by the reference server: layer id + how many rooms it has. */
export const TOURN_LAYER_PLAN: ReadonlyArray<{ layerId: number; roomCount: number; layerNumId: number }> = [
    { layerId: 1101, roomCount: 4, layerNumId: 101 },
    { layerId: 1201, roomCount: 5, layerNumId: 102 },
    { layerId: 1301, roomCount: 4, layerNumId: 103 },
];

/** `RogueTournLayerStatus` in the 2.7 reference (same order in our proto enum). */
export const TOURN_LAYER_STATUS = { none: 0, processing: 1, finish: 2 } as const;

/** `RogueTournRoomStatus`: none/inited/processing/finish. */
export const TOURN_ROOM_STATUS = { none: 0, inited: 1, processing: 2, finish: 3 } as const;

/** Room types the reference server rolls for a normal room. */
const NORMAL_ROOM_TYPES = [3, 4, 5, 7, 8] as const;

export interface TournRoomSlot {
    roomIndex: number;
    /** 0 until the room is entered (the reference assigns it on entry). */
    roomId: number;
    status: number;
}

export interface TournLayerSlot {
    layerId: number;
    /** Level number inside the mode (`RogueTournLayer.LayerNumID`, e.g. 101). */
    layerNumId: number;
    layerIndex: number;
    status: number;
    curRoomIndex: number;
    rooms: TournRoomSlot[];
}

export interface TournRun {
    areaId: number;
    curLayerIndex: number;
    layers: TournLayerSlot[];
}

function makeRooms(count: number): TournRoomSlot[] {
    const rooms: TournRoomSlot[] = [];
    for (let index = 1; index <= count; index++) {
        rooms.push({ roomIndex: index, roomId: 0, status: TOURN_ROOM_STATUS.none });
    }
    return rooms;
}

/** Plan entry accepted from the official area table (`layerNumId` optional). */
export interface TournLayerPlanEntry {
    layerId: number;
    roomCount: number;
    layerNumId?: number;
}

/** Fallback level number for a layer id when the table does not provide one. */
function layerNumOf(layerId: number): number {
    if (layerId === 1101) return 101;
    if (layerId === 1201) return 102;
    if (layerId === 1301) return 103;
    return layerId % 1000;
}

/** Create a fresh run: layer 1 processing, every other layer untouched. */
export function createTournRun(areaId: number, plan: ReadonlyArray<TournLayerPlanEntry> = TOURN_LAYER_PLAN): TournRun {
    const effective = plan.length > 0 ? plan : TOURN_LAYER_PLAN;
    return {
        areaId,
        curLayerIndex: 1,
        layers: effective.map((layer, index) => ({
            layerId: layer.layerId,
            layerNumId: layer.layerNumId ?? layerNumOf(layer.layerId),
            layerIndex: index + 1,
            status: index === 0 ? TOURN_LAYER_STATUS.processing : TOURN_LAYER_STATUS.none,
            curRoomIndex: 1,
            rooms: makeRooms(layer.roomCount),
        })),
    };
}

export function currentLayer(run: TournRun): TournLayerSlot {
    return run.layers[run.curLayerIndex - 1];
}

export function currentRoomSlot(run: TournRun): TournRoomSlot {
    return currentLayer(run).rooms[currentLayer(run).curRoomIndex - 1];
}

/** Assign a room to the current slot and mark it as being played. */
export function assignCurrentRoom(run: TournRun, roomId: number): TournRoomSlot {
    const slot = currentRoomSlot(run);
    slot.roomId = roomId;
    slot.status = TOURN_ROOM_STATUS.processing;
    return slot;
}

/**
 * Room type for the next room on the current layer.
 *
 * Mirrors the reference policy; the fallback is a deterministic cycle over the
 * normal room types so a run is reproducible (the reference uses rand()).
 */
export function nextRoomType(run: TournRun): number {
    const layer = currentLayer(run);
    const room = layer.curRoomIndex;
    if (layer.layerNumId === 101 && room === 3) return 1;
    if (layer.layerNumId === 102 && room === 4) return 1;
    if (layer.layerNumId === 103) {
        if (room === 2) return 10;
        if (room === 3) return 1;
        if (room === 4) return 0;
    }
    return NORMAL_ROOM_TYPES[(layer.layerIndex + room) % NORMAL_ROOM_TYPES.length];
}

export interface AdvanceResult {
    layerIndex: number;
    roomIndex: number;
    /** True when the last room of the last layer was finished. */
    finished: boolean;
}

/**
 * Move to the next room exactly like `UpdateRogueTournEnterRoom`:
 * the current room becomes finished; the fourth room of 1101 or the fifth of
 * 1201 finishes the layer and moves to the next one, otherwise the room index
 * advances inside the same layer.
 */
export function advanceTournRun(run: TournRun): AdvanceResult {
    const layer = currentLayer(run);
    layer.rooms[layer.curRoomIndex - 1].status = TOURN_ROOM_STATUS.finish;
    const lastRoom = layer.curRoomIndex === layer.rooms.length;
    const lastLayer = run.curLayerIndex === run.layers.length;
    if (lastRoom && lastLayer) {
        layer.status = TOURN_LAYER_STATUS.finish;
        return { layerIndex: layer.layerIndex, roomIndex: layer.curRoomIndex, finished: true };
    }
    if (lastRoom) {
        layer.status = TOURN_LAYER_STATUS.finish;
        run.curLayerIndex += 1;
    } else {
        layer.curRoomIndex += 1;
    }
    const next = currentLayer(run);
    next.status = TOURN_LAYER_STATUS.processing;
    return { layerIndex: next.layerIndex, roomIndex: next.curRoomIndex, finished: false };
}
