import { starrail } from 'src/proto/starrail';
import { NetSession } from "../NetSession"
import { CmdID } from 'src/proto/cmdId';
import { DataService } from 'src/data/data.service';
import Long from 'long';
import { onGetAvatarDataCsReq, onGetAvatarDataCsReqNew, onGetBagCsReq, onGetBagCsReqNew, onGetCurLineupDataCsReq } from '.';

export async function onGetFriendListInfoCsReq(
    body: any,
    player: NetSession,
    dataModule: DataService | null = null
): Promise<void> {
    const proto: starrail.GetFriendListInfoScRsp = new starrail.GetFriendListInfoScRsp({
        retcode: 0,
        friendList: []
    })

    // 4.5.51: FriendInfo -> FriendSimpleInfo，player_simple_info -> player_info，
    //         assist_simple_info_list -> assist_info_list
    const simpleFriend: starrail.FriendSimpleInfo = new starrail.FriendSimpleInfo({
        playerInfo: {
            nickname: "FireFly",
            level: 70,
            uid: 1314,
            platform: starrail.PlatformType.PC,
            onlineStatus: starrail.FriendOnlineStatus.FRIEND_ONLINE_STATUS_ONLINE,
            // 已核对 4.5.51 的 AssistSimpleInfo：avatar_id/level/dressed_skin_id/pos
            // 与旧版一致，仅外层字段名改为 assist_info_list
            assistInfoList: [{
                avatarId: 1310,
                level: 80,
                dressedSkinId: 0,
                pos: 0
            }],
        }
    })

    proto.friendList.push(simpleFriend)
    const bufferData = starrail.GetFriendListInfoScRsp.encode(proto).finish()
    await player.send(CmdID.CmdGetFriendListInfoScRsp, bufferData);
}

// 4.5.51: 聊天消息改为 message_datas / chat_data(oneof) 嵌套结构，
//         RevcMsgScNotify 也不再直接携带 message_text / form_id / to_id / extra_id
async function DisplayMessage(
    body: starrail.SendMsgCsReq,
    player: NetSession,
    text: string
) {
    const incoming = body.messageDatas;
    const proto: starrail.RevcMsgScNotify = new starrail.RevcMsgScNotify({
        chatType: body.chatType,
        toUid: 1314,
        recvMessageData: {
            messageDatas: [
                {
                    messageType: starrail.MsgType.MsgType_CustomText,
                    chatData: {
                        messageText: text,
                        extraId: incoming?.chatData?.extraId,
                    },
                },
            ],
        },
    })

    const bufferData = starrail.RevcMsgScNotify.encode(proto).finish()
    await player.send(CmdID.CmdRevcMsgScNotify, bufferData);
}


export async function onSendMsgCsReq(
    body: starrail.SendMsgCsReq,
    player: NetSession,
    dataModule: DataService | null = null
): Promise<void> {

    const messageText = body.messageDatas?.chatData?.messageText ?? '';

    if (messageText.startsWith("/update")) {
        await dataModule.updateDataJson()
        await onGetAvatarDataCsReqNew(new starrail.GetAvatarDataCsReq({}), player, dataModule)
        await onGetBagCsReqNew({}, player, dataModule)
        await onGetCurLineupDataCsReq({}, player, dataModule)
        await onGetBagCsReq({}, player, dataModule)
        await onGetAvatarDataCsReq(new starrail.GetAvatarDataCsReq({}), player, dataModule)
        const text = "Update freesr-data.json successfully!"
        await DisplayMessage(body, player, text)

    }
    else if (messageText.startsWith("/id")) {
        const data = messageText.split(' ')
        try {
            const idChar = parseInt(data[1])

            if (idChar <= 8400 && idChar >= 8000) {
                const text = "Update Path MC successfully!"
                await dataModule.getUpdateIdChar(idChar, player)
                await DisplayMessage(body, player, text)
            }
            else if (idChar == 1001 || idChar >= 1224) {
                const text ="Update Path M7 successfully!"
                await dataModule.getUpdateIdChar(idChar, player)
                await DisplayMessage(body, player, text)
            }
            else {
                const text = "This id is not valid!"
                await DisplayMessage(body, player, text)
            }
        }
        catch(e) {
            console.log(e)
        }
    }
    else if (messageText.startsWith("/help")) {
        const text = `/update to update new data from freesr-data.json\n/id + idChar ex: /id 8006 in-game to update new Path for this character`
        await DisplayMessage(body, player, text)
    }
    else {
        const text = "This id command valid!"
        await DisplayMessage(body, player, text)
    }

    const proto: starrail.SendMsgScRsp = new starrail.SendMsgScRsp({
        retcode: 0,
        endTime: new Long(Date.now()),
    })

    const bufferData = starrail.SendMsgScRsp.encode(proto).finish()
    await player.send(CmdID.CmdSendMsgScRsp, bufferData);
}
