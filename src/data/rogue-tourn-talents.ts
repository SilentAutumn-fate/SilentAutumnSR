import * as fs from 'fs';
import * as path from 'path';

/**
 * Divergent Universe permanent talent tree, generated from the official 4.x
 * ExcelOutput export (`RogueTournPermanentTalent`).
 *
 * The row id is what the client round-trips: `CKHCLKOALKE` appears both in
 * `OKPIPFKONMG` (the server node of the tree) and in
 * `RogueTournEnablePermanentTalentCsReq`, so `talentId` is the only value the
 * payload builder needs. `nextTalentIds` / `cost` are kept so the tree shape can
 * be tested against the official table.
 */
export interface TournTalentCost {
    itemId: number;
    itemNum: number;
}

export interface TournTalent {
    talentId: number;
    nextTalentIds: number[];
    cost: TournTalentCost | null;
}

export interface TournTalentTable {
    clientVersion: string;
    source: Record<string, unknown>;
    talents: TournTalent[];
}

function uint32(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 0xffffffff) {
        throw new Error(`rogue-tourn-talents.json: ${field} must be a positive uint32`);
    }
    return value;
}

function cost(value: unknown, talentId: number): TournTalentCost | null {
    if (value === null || value === undefined) return null;
    const entry = value as TournTalentCost;
    if (typeof entry !== 'object') throw new Error(`rogue-tourn-talents.json: ${talentId}.cost must be an object or null`);
    return {
        itemId: uint32(entry.itemId, `${talentId}.cost.itemId`),
        itemNum: uint32(entry.itemNum, `${talentId}.cost.itemNum`),
    };
}

export function parseTournTalents(input: unknown): TournTalentTable {
    const value = input as TournTalentTable;
    if (!value || typeof value.clientVersion !== 'string' || !value.clientVersion.trim()) {
        throw new Error('rogue-tourn-talents.json requires clientVersion');
    }
    if (!Array.isArray(value.talents)) throw new Error('rogue-tourn-talents.json: talents must be an array');
    const seen = new Set<number>();
    const talents: TournTalent[] = [];
    for (const entry of value.talents) {
        const row = entry as TournTalent;
        if (!row || typeof row !== 'object') throw new Error('rogue-tourn-talents.json: talents must only contain objects');
        const talentId = uint32(row.talentId, 'talents[].talentId');
        if (seen.has(talentId)) continue;
        seen.add(talentId);
        const next: number[] = [];
        if (row.nextTalentIds !== undefined) {
            if (!Array.isArray(row.nextTalentIds)) {
                throw new Error(`rogue-tourn-talents.json: ${talentId}.nextTalentIds must be an array`);
            }
            for (const id of row.nextTalentIds) next.push(uint32(id, `${talentId}.nextTalentIds[]`));
        }
        talents.push({ talentId, nextTalentIds: next, cost: cost(row.cost, talentId) });
    }
    talents.sort((a, b) => a.talentId - b.talentId);
    if (talents.length === 0) throw new Error('rogue-tourn-talents.json: talents must not be empty');
    return {
        clientVersion: value.clientVersion.trim(),
        source: (value.source as Record<string, unknown>) ?? {},
        talents,
    };
}

export function loadTournTalents(directory: string): TournTalentTable | null {
    const file = path.join(directory, 'rogue-tourn-talents.json');
    if (!fs.existsSync(file)) return null;
    try {
        return parseTournTalents(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
        throw new Error(`Cannot load ${file}: ${(error as Error).message}`);
    }
}

/** Every talent id, sorted (already unique after parsing). */
export function talentIds(table: TournTalentTable | null): number[] {
    return table ? table.talents.map((talent) => talent.talentId) : [];
}
