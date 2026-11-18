import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadMaterialCatalog, parseMaterialCatalog, catalogMaterials } from './material-catalog';

const fixture = () => ({
    clientVersion: 'OSBETAWin4.6.54', source: 'synthetic test data',
    materials: [{ itemId: 123456, stackLimit: 999 }],
});

describe('material catalog validation', () => {
    it('retains provenance and exact caps, without inventing additional materials', () => {
        const catalog = parseMaterialCatalog(fixture());
        expect(catalog.clientVersion).toBe('OSBETAWin4.6.54');
        expect(catalogMaterials(catalog, [{ tid: 99, num: 100 }], [])).toEqual([{ tid: 123456, num: 999 }]);
    });
    it.each([0, -1, 1.5, 4294967296, NaN, '999'])('rejects invalid cap %s', (cap) => {
        const input: any = fixture(); input.materials[0].stackLimit = cap;
        expect(() => parseMaterialCatalog(input)).toThrow();
    });
    it.each([0, -1, 1.5, 4294967296, '123456'])('rejects invalid item ID %s', (id) => {
        const input: any = fixture(); input.materials[0].itemId = id;
        expect(() => parseMaterialCatalog(input)).toThrow();
    });
    it('rejects duplicates and an empty or unlabelled catalog', () => {
        const input = fixture(); input.materials.push(input.materials[0]);
        expect(() => parseMaterialCatalog(input)).toThrow(/duplicate/i);
        expect(() => parseMaterialCatalog({ ...fixture(), materials: [] })).toThrow();
        expect(() => parseMaterialCatalog({ ...fixture(), source: '' })).toThrow();
        expect(() => parseMaterialCatalog({ ...fixture(), clientVersion: '' })).toThrow();
    });
    it('returns independent responses and preserves legacy inventory if the catalog is absent', () => {
        const fallback = [{ tid: 42, num: 100 }];
        const first = catalogMaterials(null, fallback, [42, 43]);
        expect(first).toEqual([{ tid: 42, num: 100 }, { tid: 43, num: 1 }]);
        first[0].num = 1;
        expect(catalogMaterials(null, fallback, [43])[0].num).toBe(100);
    });
    it('distinguishes missing, valid and malformed files', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sasr-material-test-'));
        const file = path.join(dir, 'sandbox-materials.json');
        try {
            expect(loadMaterialCatalog(dir)).toBeNull();
            fs.writeFileSync(file, JSON.stringify(fixture()));
            expect(loadMaterialCatalog(dir)?.materials[0].stackLimit).toBe(999);
            fs.writeFileSync(file, '{');
            expect(() => loadMaterialCatalog(dir)).toThrow(/sandbox-materials/);
        } finally {
            if (fs.existsSync(file)) fs.unlinkSync(file);
            fs.rmdirSync(dir);
        }
    });
});
