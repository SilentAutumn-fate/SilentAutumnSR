import * as path from 'path';
import { onGetBagCsReq } from './inventory';
import { starrail } from '../../proto/starrail';
import { loadMaterialCatalog } from '../../data/material-catalog';

describe('sandbox material inventory', () => {
    it('preserves owned equipment and legacy materials when no verified catalog exists', async () => {
        const profile = {
            lightcones: [{ uniqueId: 2007, item_id: 20001, level: 80, rank: 5, promotion: 6, equip_avatar: 1001 }],
            relics: [{ uniqueId: 14, relic_id: 61011, level: 15, main_affix_id: 1, equip_avatar: 1001,
                sub_affixes: [{ sub_affix_id: 1, count: 2, step: 1 }] }],
        };
        const before = JSON.stringify(profile);
        let reply: any;
        await onGetBagCsReq({}, {
            config: { materialCatalog: null },
            data: { getDataJson: () => profile },
            sendRsp: async (_: number, body: any) => {
                reply = starrail.GetBagScRsp.decode(starrail.GetBagScRsp.encode(body).finish());
            },
        } as any);
        expect(reply.materialList.find((i: any) => i.tid === 251001).num).toBe(100);
        expect(reply.equipmentList[0]).toMatchObject({ uniqueId: 2007, tid: 20001, dressAvatarId: 1001, level: 80 });
        expect(reply.relicList[0]).toMatchObject({ uniqueId: 14, tid: 61011, dressAvatarId: 1001, level: 15 });
        expect(JSON.stringify(profile)).toBe(before);
    });
    it('sends catalog stack limits on repeated queries while preserving equipment and unique outfits', async () => {
        const replies: any[] = [];
        const profile = { lightcones: [], relics: [] };
        const session: any = {
            config: { materialCatalog: {
                clientVersion: 'OSBETAWin4.6.54', source: 'test fixture only',
                materials: [{ itemId: 123456, stackLimit: 999 }, { itemId: 227016, stackLimit: 1 }],
            } },
            data: { getDataJson: () => profile },
            sendRsp: async (_: number, body: any) => {
                replies.push(starrail.GetBagScRsp.decode(starrail.GetBagScRsp.encode(body).finish()));
            },
        };
        await onGetBagCsReq({}, session);
        await onGetBagCsReq({}, session);
        for (const reply of replies) {
            expect(reply.materialList.find((i: any) => i.tid === 123456)?.num).toBe(999);
            expect(reply.materialList.filter((i: any) => i.tid === 227016)).toHaveLength(1);
            expect(reply.equipmentList).toEqual([]);
            expect(reply.relicList).toEqual([]);
        }
        expect(profile).toEqual({ lightcones: [], relics: [] });
    });
    it('serves the shipped catalog through GetBag with exact caps and no duplicate ids', async () => {
        const catalog = loadMaterialCatalog(path.resolve(process.cwd(), 'src', 'data', 'resources'));
        expect(catalog?.clientVersion).toBe('OSBETAWin4.6.54');
        expect(catalog!.materials.length).toBeGreaterThan(900);
        const profile = {
            lightcones: [{ uniqueId: 2007, item_id: 20001, level: 80, rank: 5, promotion: 6, equip_avatar: 1001 }],
            relics: [],
        };
        let reply: any;
        await onGetBagCsReq({}, {
            config: { materialCatalog: catalog },
            data: { getDataJson: () => profile },
            sendRsp: async (_: number, body: any) => {
                reply = starrail.GetBagScRsp.decode(starrail.GetBagScRsp.encode(body).finish());
            },
        } as any);
        const ids = reply.materialList.map((row: any) => row.tid);
        expect(new Set(ids).size).toBe(ids.length);
        expect(reply.materialList.length).toBeGreaterThanOrEqual(catalog!.materials.length);
        const caps = new Map(catalog!.materials.map((row) => [row.itemId, row.stackLimit]));
        for (const row of reply.materialList) {
            if (caps.has(row.tid)) expect(row.num).toBe(caps.get(row.tid));
        }
        expect(reply.equipmentList).toHaveLength(1);
    });
});
