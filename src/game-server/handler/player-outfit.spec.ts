import { DataInGame } from '../../data/loadDataInGame';
import { starrail } from '../../proto/starrail';
import { onGetBagCsReq, PLAYER_OUTFIT_LIST } from './inventory';
import { onSetPlayerOutfitCsReq } from './avatar';
import { outfitIdsOf } from '../manager/avatar_mgr';

describe('all Trailblazer outfits', () => {
    const newOutfits = [227017, 227018, 227019, 227020, 227021, 227022];

    it('grants all 21 outfit items exactly once in the encoded bag', async () => {
        let reply: any;
        await onGetBagCsReq({}, {
            config: { materialCatalog: null },
            data: { getDataJson: () => ({ lightcones: [], relics: [] }) },
            sendRsp: async (_: number, body: any) => {
                reply = starrail.GetBagScRsp.decode(starrail.GetBagScRsp.encode(body).finish());
            },
        } as any);
        expect(PLAYER_OUTFIT_LIST).toHaveLength(21);
        for (const tid of newOutfits) {
            expect(reply.materialList.filter((item: any) => item.tid === tid))
                .toEqual([expect.objectContaining({ tid, num: 1 })]);
        }
    });

    it.each(newOutfits)('accepts and saves outfit %i through a save reload', async (id) => {
        let saved = DataInGame.fromJson({});
        const replies: any[] = [];
        const notifications: any[] = [];
        const save = jest.fn(async () => { saved = DataInGame.fromJson(saved.toJson()); });
        const session: any = {
            data: { getDataInGame: () => saved, saveDataInGame: save },
            sendRsp: async (_: number, body: any) => { replies.push(body); },
            sendMessage: async (_: number, body: any) => { notifications.push(body); },
        };
        await onSetPlayerOutfitCsReq({ playerOutfitData: { EAKOLIJOEPA: [id] } } as any, session);
        expect(replies).toEqual([{ retcode: 0 }]);
        expect(save).toHaveBeenCalledTimes(1);
        expect(outfitIdsOf(session)).toEqual([id]);
        expect(notifications[0].playerOutfitData.EAKOLIJOEPA).toEqual([id]);
    });
});
