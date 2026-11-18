import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadTournRoomTable, parseTournRoomTable, pickTournRoom } from './rogue-tourn-rooms';

const table = {
    clientVersion: 'OSBETAWin4.6.54',
    source: 'test fixture',
    rooms: [
        { roomId: 11011013, roomType: 1, mapEntrance: 8040101, groupId: 0, isRotate: false, rotateNum: 0 },
        { roomId: 11011014, roomType: 2, mapEntrance: 8040102, groupId: 7, isRotate: true, rotateNum: 2 },
    ],
};

describe('divergent universe room table', () => {
    it('parses the generated table shape', () => {
        const parsed = parseTournRoomTable(table);
        expect(parsed.rooms).toHaveLength(2);
        expect(parsed.rooms[1]).toMatchObject({ roomId: 11011014, isRotate: true, rotateNum: 2 });
    });

    it('rejects duplicate room ids and non-positive entrances', () => {
        expect(() => parseTournRoomTable({ ...table, rooms: [table.rooms[0], table.rooms[0]] })).toThrow(/duplicate roomId/);
        expect(() => parseTournRoomTable({ ...table, rooms: [{ ...table.rooms[0], mapEntrance: 0 }] })).toThrow(/positive uint32/);
        expect(() => parseTournRoomTable({ ...table, rooms: [] })).toThrow(/non-empty rooms/);
    });

    it('returns null when the generated file is absent', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tourn-rooms-'));
        expect(loadTournRoomTable(dir)).toBeNull();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('loads the shipped table and every entrance gate passes for it', () => {
        const shipped = loadTournRoomTable(path.resolve(process.cwd(), 'src', 'data', 'resources'));
        expect(shipped!.clientVersion).toBe('OSBETAWin4.6.54');
        expect(shipped!.rooms.length).toBe(34);
        // The generator only keeps rooms whose MapEntrance exists in this
        // client, so the table must be internally consistent about it.
        const entrances = JSON.parse(fs.readFileSync(
            path.resolve(process.cwd(), 'src', 'data', 'resources', 'MapEntrance.json'), 'utf8',
        )).map_entrance_config as Array<{ ID: number }>;
        const known = new Set(entrances.map((row) => row.ID));
        for (const room of shipped!.rooms) expect(known.has(room.mapEntrance)).toBe(true);
    });

    it('skips rooms whose scene the client cannot load', () => {
        const parsed = parseTournRoomTable(table);
        expect(pickTournRoom(parsed, () => false)).toBeNull();
        expect(pickTournRoom(parsed, (id) => id === 8040102)?.roomId).toBe(11011014);
        expect(pickTournRoom(parsed, () => true, 11011014)?.roomId).toBe(11011014);
        expect(pickTournRoom(parsed, () => true, 999)?.roomId).toBe(11011013);
        expect(pickTournRoom(null, () => true)).toBeNull();
    });
});
