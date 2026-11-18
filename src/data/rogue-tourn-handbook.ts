import * as fs from 'fs';
import * as path from 'path';

/**
 * Divergent Universe handbook id pools, generated from the official 4.x
 * ExcelOutput export.
 *
 * Handbook miracle IDs identify collection entries. Gameplay miracle IDs
 * identify effects and may differ from the corresponding collection entry.
 */
export interface TournHandbook {
    clientVersion: string;
    source: Record<string, unknown>;
    formulaIds: number[];
    miracleIds: number[];
    buffIds: number[];
    collectionIds: number[];
    handbookMiracleIds: number[];
}

function idList(value: unknown, field: string): number[] {
    if (!Array.isArray(value)) throw new Error(`rogue-tourn-handbook.json: ${field} must be an array`);
    const result: number[] = [];
    const seen = new Set<number>();
    for (const id of value) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id > 0xffffffff) {
            throw new Error(`rogue-tourn-handbook.json: ${field} must only contain positive uint32 ids`);
        }
        if (seen.has(id)) continue;
        seen.add(id);
        result.push(id);
    }
    return result;
}

export function parseTournHandbook(input: unknown): TournHandbook {
    const value = input as TournHandbook;
    if (!value || typeof value.clientVersion !== 'string' || !value.clientVersion.trim()) {
        throw new Error('rogue-tourn-handbook.json requires clientVersion');
    }
    const handbook: TournHandbook = {
        clientVersion: value.clientVersion.trim(),
        source: (value.source as Record<string, unknown>) ?? {},
        formulaIds: idList(value.formulaIds, 'formulaIds'),
        miracleIds: idList(value.miracleIds, 'miracleIds'),
        buffIds: idList(value.buffIds, 'buffIds'),
        collectionIds: idList(value.collectionIds, 'collectionIds'),
        handbookMiracleIds: idList(value.handbookMiracleIds, 'handbookMiracleIds'),
    };
    if (handbook.miracleIds.length === 0) throw new Error('rogue-tourn-handbook.json: miracleIds must not be empty');
    return handbook;
}

export function loadTournHandbook(directory: string): TournHandbook | null {
    const file = path.join(directory, 'rogue-tourn-handbook.json');
    if (!fs.existsSync(file)) return null;
    try {
        return parseTournHandbook(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
        throw new Error(`Cannot load ${file}: ${(error as Error).message}`);
    }
}

/** Every handbook id, sorted and de-duplicated (all categories merged). */
export function handbookUnlockIds(handbook: TournHandbook | null): number[] {
    if (!handbook) return [];
    const merged = new Set<number>();
    for (const list of [
        handbook.formulaIds,
        handbook.miracleIds,
        handbook.handbookMiracleIds,
        handbook.buffIds,
        handbook.collectionIds,
    ]) {
        for (const id of list) merged.add(id);
    }
    return [...merged].sort((a, b) => a - b);
}
