import { starrail } from 'src/proto/starrail';
import Long from 'long';
import { NetSession } from "../NetSession"
import { CmdID } from 'src/proto/cmdId';

export async function onPlayerGetTokenCsReq( 
    body: starrail.PlayerGetTokenCsReq | any, 
    player: NetSession,
    dataModule: any | null = null
) {

    const proto: starrail.PlayerGetTokenScRsp = new starrail.PlayerGetTokenScRsp({
        retcode: 0,
        // 4.5.51: PlayerGetTokenScRsp 已移除 msg 字段（改用 stop_desc / authkey）
        uid: 1334,
        secretKeySeed: new Long(0)
    });

    const bufferData = starrail.PlayerGetTokenScRsp.encode(proto).finish()

    await player.send(CmdID.CmdPlayerGetTokenScRsp, bufferData);
}

export async function onPlayerLoginCsReq(
    body: starrail.PlayerLoginCsReq | any,
    player: NetSession,
    dataModule: any | null = null
): Promise<void> {
    const proto: starrail.PlayerLoginScRsp = new starrail.PlayerLoginScRsp({
        retcode: 0,
        loginRandom: body.loginRandom,
        serverTimestampMs: new Long(new Date().getTime()),
        stamina: 240,
        basicInfo: {
            nickname: "SilentAutumnSR",
            level: 70,
            worldLevel: 6,
            stamina: 100,
        },
      });
    const bufferData = starrail.PlayerLoginScRsp.encode(proto).finish()

    await player.send(CmdID.CmdPlayerLoginScRsp, bufferData);
}
