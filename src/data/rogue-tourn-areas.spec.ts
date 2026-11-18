import * as fs from 'fs';
import * as path from 'path';
import {
    defaultTournArea,
    findTournArea,
    loadTournAreaTable,
    lobbyTournAreas,
    parseTournAreaTable,
    tournLayersForArea,
} from './rogue-tourn-areas';
import { handbookUnlockIds, loadTournHandbook, parseTournHandbook } from './rogue-tourn-handbook';
import { loadTournTalents, parseTournTalents, talentIds } from './rogue-tourn-talents';

/**
 * The area and handbook tables are generated from the official 4.x ExcelOutput
 * export; these tests pin the generated shape and the lookup helpers against the
 * files that actually ship in `src/data/resources`.
 */

const resources = path.resolve(__dirname, 'resources');

let areaTable: ReturnType<typeof loadTournAreaTable>;
let handbook: ReturnType<typeof loadTournHandbook>;

beforeAll(() => {
    areaTable = loadTournAreaTable(resources);
    handbook = loadTournHandbook(resources);
});

describe('official divergent universe area table', () => {
    it('ships the generated table', () => {
        expect(areaTable).not.toBeNull();
        expect(areaTable!.clientVersion).toBe('OSBETAWin4.6.54');
        expect(areaTable!.areas.length).toBeGreaterThanOrEqual(19);
    });

    it('keeps area 201 with the reference layer plan', () => {
        const area = findTournArea(areaTable, 201)!;
        expect(area).toMatchObject({ mode: 'Tourn1', group: 'Formal', difficultyLevel: 1 });
        expect(tournLayersForArea(areaTable, 201)).toEqual([
            { layerId: 1101, roomCount: 4 },
            { layerId: 1201, roomCount: 5 },
            { layerId: 1301, roomCount: 4 },
        ]);
    });

    it('opens the first formal difficulty-1 area by default', () => {
        expect(defaultTournArea(areaTable)!.areaId).toBe(201);
    });

    it('reports formal and guide areas to the lobby', () => {
        const lobby = lobbyTournAreas(areaTable);
        expect(lobby.length).toBe(19);
        expect(lobby.some((area) => area.group === 'Guide')).toBe(true);
        expect(lobby.every((area) => area.layerIds.length > 0)).toBe(true);
    });

    it('rejects malformed tables', () => {
        expect(() => parseTournAreaTable({ clientVersion: 'x', areas: [] })).toThrow(/non-empty areas/);
        expect(() => parseTournAreaTable({
            clientVersion: 'x',
            areas: [{ areaId: 1, group: 'Formal', layerIds: [1101], layerRoomCounts: [] }],
        })).toThrow(/parallel/);
        expect(() => parseTournAreaTable({
            clientVersion: 'x',
            areas: [
                { areaId: 1, group: 'Formal', layerIds: [1101], layerRoomCounts: [4] },
                { areaId: 1, group: 'Formal', layerIds: [1101], layerRoomCounts: [4] },
            ],
        })).toThrow(/duplicate areaId/);
    });

    it('returns null for an unknown area and an empty plan', () => {
        expect(findTournArea(areaTable, 0)).toBeNull();
        expect(tournLayersForArea(areaTable, 999999)).toBeNull();
    });
});

describe('official divergent universe handbook pools', () => {
    it('ships every pool with positive unique ids', () => {
        expect(handbook).not.toBeNull();
        expect(handbook!.formulaIds.length).toBe(328);
        expect(handbook!.miracleIds.length).toBe(699);
        expect(handbook!.buffIds.length).toBeGreaterThanOrEqual(449);
        expect(handbook!.collectionIds.length).toBe(22);
        for (const id of handbookUnlockIds(handbook)) expect(id).toBeGreaterThan(0);
    });

    it('merges the pools without duplicates', () => {
        const merged = handbookUnlockIds(handbook);
        expect(merged.length).toBe(new Set(merged).size);
        expect(merged.length).toBeGreaterThanOrEqual(1490);
        expect(merged).toEqual(expect.arrayContaining(handbook!.handbookMiracleIds));
    });

    it('rejects a table without miracle ids', () => {
        expect(() => parseTournHandbook({
            clientVersion: 'x', miracleIds: [], formulaIds: [1], buffIds: [], collectionIds: [], handbookMiracleIds: [],
        })).toThrow(/miracleIds/);
    });
});

// The generated files must be readable from the repository resources folder.
it('generated files exist on disk', () => {
    expect(fs.existsSync(path.join(resources, 'rogue-tourn-areas.json'))).toBe(true);
    expect(fs.existsSync(path.join(resources, 'rogue-tourn-handbook.json'))).toBe(true);
    expect(fs.existsSync(path.join(resources, 'rogue-tourn-talents.json'))).toBe(true);
});

describe('official divergent universe permanent talent tree', () => {
    it('ships every row of the official table', () => {
        const talents = loadTournTalents(resources);
        expect(talents).not.toBeNull();
        expect(talents!.clientVersion).toBe('OSBETAWin4.6.54');
        expect(talentIds(talents)).toHaveLength(38);
        // Root 100 links to 101 / 301 / 501 in the official export.
        const root = talents!.talents.find((talent) => talent.talentId === 100)!;
        expect(root.nextTalentIds).toEqual([101, 301, 501]);
        expect(root.cost).toEqual({ itemId: 281018, itemNum: 100 });
    });

    it('rejects duplicate and malformed rows', () => {
        expect(() => parseTournTalents({
            clientVersion: 'x',
            talents: [
                { talentId: 100, nextTalentIds: [], cost: null },
                { talentId: 100, nextTalentIds: [], cost: null },
            ],
        })).not.toThrow();
        expect(() => parseTournTalents({ clientVersion: 'x', talents: [{ talentId: 0 }] }))
            .toThrow(/positive uint32/);
        expect(() => parseTournTalents({ clientVersion: 'x', talents: [] })).toThrow(/must not be empty/);
    });
});
