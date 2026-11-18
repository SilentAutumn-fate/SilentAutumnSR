import * as fs from 'fs';
import * as path from 'path';

/**
 * Divergent Universe area table, generated from the official 4.x ExcelOutput
 * export (`RogueTournArea` + `RogueTournLayer` + `RogueTournLayerRoom`).
 *
 * The official rows use obfuscated column names; the generator maps them to the
 * fields below. Only rows whose whole layer list exists in `RogueTournLayerRoom`
 * are kept, so every area comes with a complete layer plan.
 */
export interface TournLayerPlan {
    layerId: number;
    /** Number of rooms on the layer, from `RogueTournLayerRoom`. */
    roomCount: number;
}

export interface TournArea {
    areaId: number;
    /** `Tourn1` / `Tourn2` / `Tourn3`. */
    mode: string;
    /** `Formal` (difficulty tiers) or `Guide` (one tutorial layer). */
    group: string;
    /** 1..5, from the `Difficulty_N` column; 0 when unset. */
    difficultyLevel: number;
    layerIds: number[];
    layerRoomCounts: number[];
    /** `RogueTournLayer.LayerNumID` per layer (the level number inside the mode). */
    layerNumIds: number[];
    difficultyConfigIds: number[];
    /** Set for the hardest difficulty tier of an area. */
    isHard: boolean;
}

export interface TournAreaTable {
    clientVersion: string;
    source: { repository?: string; path?: string; clientVersion?: string; files?: Record<string, { size: number; sha256: string }> };
    areas: TournArea[];
}

function uint32(value: unknown, allowZero = true): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= (allowZero ? 0 : 1) && value <= 0xffffffff;
}

export function parseTournAreaTable(input: unknown): TournAreaTable {
    const value = input as TournAreaTable;
    if (!value || typeof value.clientVersion !== 'string' || !value.clientVersion.trim() ||
        !Array.isArray(value.areas) || value.areas.length === 0) {
        throw new Error('rogue-tourn-areas.json requires clientVersion and a non-empty areas list');
    }
    const ids = new Set<number>();
    const areas = value.areas.map((area, index) => {
        if (!area || !uint32(area.areaId, false) || typeof area.group !== 'string' || !area.group.trim()) {
            throw new Error(`rogue-tourn-areas.json row ${index}: areaId and group are required`);
        }
        if (!Array.isArray(area.layerIds) || area.layerIds.length === 0 ||
            !Array.isArray(area.layerRoomCounts) || area.layerRoomCounts.length !== area.layerIds.length) {
            throw new Error(`rogue-tourn-areas.json row ${index}: layerIds and layerRoomCounts must be parallel and non-empty`);
        }
        for (const layerId of area.layerIds) {
            if (!uint32(layerId, false)) throw new Error(`rogue-tourn-areas.json row ${index}: layer id must be a positive uint32`);
        }
        for (const count of area.layerRoomCounts) {
            if (!uint32(count, false)) throw new Error(`rogue-tourn-areas.json row ${index}: room count must be a positive uint32`);
        }
        if (ids.has(area.areaId)) throw new Error(`rogue-tourn-areas.json duplicate areaId ${area.areaId}`);
        ids.add(area.areaId);
        return area;
    });
    return {
        clientVersion: value.clientVersion.trim(),
        source: value.source ?? {},
        areas,
    };
}

export function loadTournAreaTable(directory: string): TournAreaTable | null {
    const file = path.join(directory, 'rogue-tourn-areas.json');
    if (!fs.existsSync(file)) return null;
    try {
        return parseTournAreaTable(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
        throw new Error(`Cannot load ${file}: ${(error as Error).message}`);
    }
}

export function findTournArea(table: TournAreaTable | null, areaId: number): TournArea | null {
    if (!table || !areaId) return null;
    return table.areas.find((area) => area.areaId === areaId) ?? null;
}

/** Layer plan of one area, ready for the run state machine. */
export function tournLayersForArea(table: TournAreaTable | null, areaId: number): TournLayerPlan[] | null {
    const area = findTournArea(table, areaId);
    if (!area) return null;
    return area.layerIds.map((layerId, index) => ({ layerId, roomCount: area.layerRoomCounts[index] }));
}

/**
 * Area the lobby opens by default: the first formal difficulty-1 area of the
 * first mode (201 in the official 4.x table: layers 1101/1201/1301).
 */
export function defaultTournArea(table: TournAreaTable | null): TournArea | null {
    if (!table) return null;
    const formal = table.areas.filter((area) => area.group === 'Formal');
    const first = formal.find((area) => area.mode === 'Tourn1' && area.difficultyLevel === 1);
    return first ?? formal[0] ?? table.areas[0] ?? null;
}

/** Areas reported to the client: every mode/group, difficulty tiers included. */
export function lobbyTournAreas(table: TournAreaTable | null): TournArea[] {
    if (!table) return [];
    return table.areas.filter((area) => area.group === 'Formal' || area.group === 'Guide');
}
