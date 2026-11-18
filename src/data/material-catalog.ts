import * as fs from 'fs';
import * as path from 'path';

/** Normalized, reviewed OUTSIDE-mode materials; never infer caps from item IDs. */
export interface MaterialCatalog {
    clientVersion: string;
    source: string;
    materials: { itemId: number; stackLimit: number }[];
}

export interface MaterialStack { tid: number; num: number }

function positiveUint32(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 0xffffffff;
}

export function parseMaterialCatalog(input: unknown): MaterialCatalog {
    const value = input as MaterialCatalog;
    if (!value || typeof value.clientVersion !== 'string' || !value.clientVersion.trim() ||
        typeof value.source !== 'string' || !value.source.trim() ||
        !Array.isArray(value.materials) || value.materials.length === 0) {
        throw new Error('sandbox-materials.json requires clientVersion, source and non-empty materials');
    }
    const ids = new Set<number>();
    const materials = value.materials.map((row, index) => {
        if (!row || !positiveUint32(row.itemId) || !positiveUint32(row.stackLimit)) {
            throw new Error(`sandbox-materials.json row ${index}: itemId and stackLimit must be positive uint32`);
        }
        if (ids.has(row.itemId)) throw new Error(`sandbox-materials.json duplicate itemId ${row.itemId}`);
        ids.add(row.itemId);
        return { itemId: row.itemId, stackLimit: row.stackLimit };
    });
    return { clientVersion: value.clientVersion.trim(), source: value.source.trim(), materials };
}

export function loadMaterialCatalog(directory: string): MaterialCatalog | null {
    const file = path.join(directory, 'sandbox-materials.json');
    if (!fs.existsSync(file)) return null;
    try { return parseMaterialCatalog(JSON.parse(fs.readFileSync(file, 'utf8'))); }
    catch (error) { throw new Error(`Cannot load ${file}: ${(error as Error).message}`); }
}

/** A fresh full stack list for every request; mode-local balances are untouched. */
export function catalogMaterials(
    catalog: MaterialCatalog | null,
    fallback: MaterialStack[],
    outfits: number[],
): MaterialStack[] {
    const result = catalog
        ? catalog.materials.map((row) => ({ tid: row.itemId, num: row.stackLimit }))
        : fallback.map((row) => ({ ...row }));
    const ids = new Set(result.map((row) => row.tid));
    for (const tid of outfits) {
        if (ids.has(tid)) continue;
        result.push({ tid, num: 1 });
        ids.add(tid);
    }
    return result;
}
