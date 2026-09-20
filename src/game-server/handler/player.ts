
import { starrail } from 'src/proto/starrail';
import { NetSession } from "../NetSession"
import { CmdID } from 'src/proto/cmdId';
import Long from "long";

export async function onPlayerHeartBeatCsReq(
    body: starrail.PlayerHeartBeatCsReq,
    player: NetSession,
    dataModule: any | null = null
): Promise<void> {

    // 心跳里下发的 Lua 补丁：改写客户端 UI 文本。
    //   VersionText      —— 游戏左下角显示的版本字段
    //   BetaHintDialog   —— 对话框横幅（服务端名称）
    // 两处均已替换为 SilentAutumnSR。修改此串后需同步递增下面的 downloadData.version，
    // 否则客户端可能因版本号未变而沿用旧文本。
    const base64_string = "Q1MuVW5pdHlFbmdpbmUuR2FtZU9iamVjdC5GaW5kKCJVSVJvb3QvQWJvdmVEaWFsb2cvQmV0YUhpbnREaWFsb2coQ2xvbmUpIik6R2V0Q29tcG9uZW50SW5DaGlsZHJlbih0eXBlb2YoQ1MuUlBHLkNsaWVudC5Mb2NhbGl6ZWRUZXh0KSkudGV4dCA9ICI8Y29sb3I9IzAwRkZGRj48Yj5TaWxlbnRBdXR1bW5TUjwvYj48L2NvbG9yPiIKQ1MuVW5pdHlFbmdpbmUuR2FtZU9iamVjdC5GaW5kKCJWZXJzaW9uVGV4dCIpOkdldENvbXBvbmVudEluQ2hpbGRyZW4odHlwZW9mKENTLlJQRy5DbGllbnQuTG9jYWxpemVkVGV4dCkpLnRleHQgPSAiPGNvbG9yPSNGRjE0OTM+U2lsZW50QXV0dW1uU1I8L2NvbG9yPiI=";
    const bytesDecode = new Uint8Array(Buffer.from(base64_string, 'base64'));
    const proto: starrail.PlayerHeartBeatScRsp = new starrail.PlayerHeartBeatScRsp({
        downloadData:{
            // 由 51 递增到 52：内容已变，强制客户端重新应用补丁
            version: 52,
            time: new Long(new Date().getTime()),
            data: bytesDecode,
        },
        serverTimeMs: new Long(new Date().getTime()),
        retcode: 0,
        clientTimeMs: body.clientTimeMs,
    });
    
    const bufferData = starrail.PlayerHeartBeatScRsp.encode(proto).finish()

    await player.send(
        CmdID.CmdPlayerHeartBeatScRsp,
        bufferData
    );
}
export async function onGetBasicInfoCsReq(
    body: any,
    player: NetSession,
    dataModule: any | null = null
): Promise<void> {
    const proto: starrail.GetBasicInfoScRsp = new starrail.GetBasicInfoScRsp({
        curDay : 1,
        exchangeTimes : 0,
        retcode : 0,
        nextRecoverTime : new Long(2281337),
        weekCocoonFinishedCount : 0
    });

    const bufferData = starrail.GetBasicInfoScRsp.encode(proto).finish()

    await player.send(CmdID.CmdGetBasicInfoScRsp, bufferData);
}