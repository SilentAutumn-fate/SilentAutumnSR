import * as fs from 'fs';
import * as path from 'path';

/**
 * Divergent Universe room table.
 *
 * The table is NOT shipped as a readable file by the 4.6.54 client; it is built
 * by `dev/tools/rogue-tourn/build-room-table.js` from an external reference export
 * (2.7.51) and every room is cross-checked against THIS client's MapEntrance
 * table before it is kept, so a room in this file always has a scene the client
 * knows how to load. `clientVersion` records the client the check was run
 * against; it is evidence of compatibility, not proof of playability.
 */
export interface TournRoom {
    roomId: number;
    roomType: number;
    mapEntrance: number;
    groupId: number;
    isRotate: boolean;
    rotateNum: number;
}

export interface TournRoomTable {
    clientVersion: string;
    source: string;
    rooms: TournRoom[];
}

function positiveUint32(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 0xffffffff;
}

function uint32(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

export function parseTournRoomTable(input: unknown): TournRoomTable {
    const value = input as TournRoomTable;
    if (!value || typeof value.clientVersion !== 'string' || !value.clientVersion.trim() ||
        typeof value.source !== 'string' || !value.source.trim() ||
        !Array.isArray(value.rooms) || value.rooms.length === 0) {
        throw new Error('rogue-tourn-rooms.json requires clientVersion, source and non-empty rooms');
    }
    const ids = new Set<number>();
    const rooms = value.rooms.map((row, index) => {
        if (!row || !positiveUint32(row.roomId) || !positiveUint32(row.mapEntrance) ||
            !uint32(row.roomType) || !uint32(row.groupId) || !uint32(row.rotateNum) ||
            typeof row.isRotate !== 'boolean') {
            throw new Error(`rogue-tourn-rooms.json row ${index}: roomId/mapEntrance must be positive uint32, roomType/groupId/rotateNum uint32, isRotate boolean`);
        }
        if (ids.has(row.roomId)) throw new Error(`rogue-tourn-rooms.json duplicate roomId ${row.roomId}`);
        ids.add(row.roomId);
        return {
            roomId: row.roomId,
            roomType: row.roomType,
            mapEntrance: row.mapEntrance,
            groupId: row.groupId,
            isRotate: row.isRotate,
            rotateNum: row.rotateNum,
        };
    });
    return { clientVersion: value.clientVersion.trim(), source: value.source.trim(), rooms };
}

export function loadTournRoomTable(directory: string): TournRoomTable | null {
    const file = path.join(directory, 'rogue-tourn-rooms.json');
    if (!fs.existsSync(file)) return null;
    try { return parseTournRoomTable(JSON.parse(fs.readFileSync(file, 'utf8'))); }
    catch (error) { throw new Error(`Cannot load ${file}: ${(error as Error).message}`); }
}

/**
 * Pick the room a run starts in.
 *
 * `entranceExists` is the compatibility gate: a room whose MapEntrance the
 * client does not know cannot be rendered, so it is skipped instead of guessed.
 * Returns null when the table is empty or nothing survives the gate.
 */
export function pickTournRoom(
    table: TournRoomTable | null,
    entranceExists: (entranceId: number) => boolean,
    preferredRoomId?: number,
): TournRoom | null {
    if (!table) return null;
    if (preferredRoomId) {
        const preferred = table.rooms.find((room) => room.roomId === preferredRoomId);
        if (preferred && entranceExists(preferred.mapEntrance)) return preferred;
    }
    for (const room of table.rooms) {
        if (entranceExists(room.mapEntrance)) return room;
    }
    return null;
}

/**
 * Pick a room of a given `RogueRoomType` (1 boss, 3 battle, 4 encounter,
 * 5 event, 7 shop, 8 reward, 9 adventure, 10 respite — the enum used by the
 * reference server).
 *
 * Deterministic: the lowest `roomId` of that type that survives the entrance
 * gate and has not been used by this run yet (`exclude`). When the table has no
 * unused room of that type, any unused usable room is taken, and when every room
 * has been used the used ones are allowed again — a run must always be able to
 * place the player somewhere the client can render.
 */
export function pickTournRoomByType(
    table: TournRoomTable | null,
    roomType: number,
    entranceExists: (entranceId: number) => boolean,
    exclude: ReadonlySet<number> = new Set(),
): TournRoom | null {
    if (!table) return null;
    const usable = (room: TournRoom) => entranceExists(room.mapEntrance);
    const byId = (left: TournRoom, right: TournRoom) => left.roomId - right.roomId;

    const typed = table.rooms.filter((room) => room.roomType === roomType).sort(byId);
    const unusedTyped = typed.find((room) => !exclude.has(room.roomId) && usable(room));
    if (unusedTyped) return unusedTyped;

    // The requested type is used up. Prefer a physical room the run has not
    // visited yet (the type is only a content hint we cannot render anyway)
    // over walking the player through a room they already cleared.
    const unusedAny = table.rooms
        .filter((room) => !exclude.has(room.roomId) && usable(room))
        .sort(byId)[0];
    if (unusedAny) return unusedAny;

    const usedTyped = typed.find(usable);
    return usedTyped ?? pickTournRoom(table, entranceExists);
}
