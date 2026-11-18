import { CmdID } from '../../proto/cmdId';
import * as avatars from '../manager/avatar_mgr';
import { onGetAvatarDataCsReq, onDressAvatarSkinCsReq, onTakeOffAvatarSkinCsReq } from './avatar';

describe('Aha skin ownership and selection', () => {
    afterEach(() => jest.restoreAllMocks());

    it('grants Galactic Lottery and persists dressing and taking it off', async () => {
        const player: any = {};
        const replies: any[] = [];
        const save = jest.fn(async () => {});
        const session: any = {
            data: {
                getDataInGame: () => ({ player }),
                getDataJson: () => ({ avatarIds: () => [1511] }),
                getIdMain: () => 8001,
                saveDataInGame: save,
            },
            sendRsp: async (cmd: number, body: any) => { replies.push({ cmd, body }); },
        };
        jest.spyOn(avatars, 'buildAvatarSync').mockReturnValue({ avatarList: [], avatarPathDataInfoList: [] } as any);
        jest.spyOn(avatars, 'syncAvatarData').mockResolvedValue(undefined);

        await onGetAvatarDataCsReq({ isGetAll: true } as any, session);
        expect(replies[0].body.skinList).toContain(1151101);
        await onDressAvatarSkinCsReq({ avatarId: 1511, skinId: 1151101 } as any, session);
        expect(replies.at(-1)).toEqual({ cmd: CmdID.CmdDressAvatarSkinScRsp, body: { retcode: 0 } });
        expect(player.avatarSkinIds[1511]).toBe(1151101);
        expect(save).toHaveBeenCalledTimes(1);
        await onTakeOffAvatarSkinCsReq({ avatarId: 1511 } as any, session);
        expect(player.avatarSkinIds[1511]).toBe(0);
        expect(save).toHaveBeenCalledTimes(2);
    });
});
