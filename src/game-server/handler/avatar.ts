
import { starrail } from 'src/proto/starrail';
import { NetSession } from "../NetSession"
import { CmdID } from 'src/proto/cmdId';
import { UidGenerator } from './inventory';
import { DataService } from 'src/data/data.service';
import { JsonData } from 'src/data/loadFreeData';

const UNLOCKED_AVATARS: number[] = [
    8001, 8002, 8003, 8004, 8005, 8006, 1001, 1002, 1003, 1004, 1005, 1006, 1008, 1009, 1013, 1101,
    1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1201, 1202, 1203, 1204, 1205,
    1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1217, 1301, 1302, 1303, 1304, 1305,
    1306, 1307, 1308, 1309, 1312, 1315, 1310, 1314, 1315, 1221, 1218, 1220, 1222, 1223, 1224
];

export async function onGetAvatarDataCsReq(
    body: starrail.GetAvatarDataCsReq,
    player: NetSession,
    dataModule: DataService | null = null
) {
    await dataModule.updateDataJson();
    const jsonData: JsonData = dataModule.getDataJson();

    const avatarList: starrail.Avatar[] = [];
    // 4.5.51: rank / 技能树 / 遗器随 avatarPathDataInfoList 下发（见 to_avatar_path_data_proto）
    const avatarPathDataInfoList: starrail.AvatarPathData[] = [];

    for (const id of UNLOCKED_AVATARS) {
        const avatarJson = jsonData.avatars[id];
        const lightcone = avatarJson ? jsonData.lightcones.find(lc => lc.equip_avatar === id) : undefined;
        const relics = avatarJson ? jsonData.relics.filter(r => r.equip_avatar === id) : [];

        if (avatarJson) {
            const multiPath = [1001, 1224, 8001, 8002, 8003, 8004, 8005, 8006];
            if (multiPath.includes(id)) {
                let avatarType: starrail.MultiPathAvatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_None;
                switch (id) {
                    case 8001:
                        avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_BoyWarriorType;
                        break;
                    case 8002:
                        avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_GirlWarriorType;
                        break;
                    case 8003:
                        avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_BoyKnightType;
                        break;
                    case 8004:
                        avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_GirlKnightType;
                        break;
                    case 8005:
                        avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_BoyShamanType;
                        break;
                    case 8006:
                        avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_GirlShamanType;
                        break;
                    case 1224:
                        avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_Mar7ThRogueType;
                        break;
                    case 1001:
                        avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_Mar7ThKnightType;
                        break;
                    default:
                        avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_None;
                        break;
                }

                const proto1 = new starrail.SetAvatarPathScRsp({
                    retcode: 0,
                    avatarId: avatarType
                });
                const bufferData1 = starrail.SetAvatarPathScRsp.encode(proto1).finish();
                await player.send(CmdID.CmdSetAvatarPathScRsp, bufferData1);
            }
            avatarList.push(avatarJson.to_avatar_proto(lightcone, relics));
            avatarPathDataInfoList.push(avatarJson.to_avatar_path_data_proto(lightcone, relics));
        } else {
            avatarList.push(new starrail.Avatar({
                baseAvatarId: id,
                level: 80,
                promotion: 6,
                // 4.5.51: Avatar.rank 已移除（迁至 AvatarPathData.rank）
                hasTakenPromotionRewardList: Array.from({ length: 5 }, (_, index) => index + 1)
            }));
            // 与 pearl-sr 的 createAllAvatarPathData 一致：无配置角色 rank = 6
            avatarPathDataInfoList.push(new starrail.AvatarPathData({
                avatarId: id,
                rank: 6,
                pathEquipmentId: 0,
            }));
        }
    }

    const proto = new starrail.GetAvatarDataScRsp({
        retcode: 0,
        isGetAll: true,
        avatarList: avatarList,
        avatarPathDataInfoList: avatarPathDataInfoList,
    });

    const bufferData = starrail.GetAvatarDataScRsp.encode(proto).finish();
    await player.send(CmdID.CmdGetAvatarDataScRsp, bufferData);
}


export async function onGetAvatarDataCsReqNew(
    body: starrail.GetAvatarDataCsReq,
    player: NetSession,
    dataModule: any | null = null
) {
    const genId: UidGenerator = new UidGenerator();
    const avatar_list: starrail.Avatar[] = [];
    const avatar_path_data_list: starrail.AvatarPathData[] = [];

    // Add unlocked avatars
    for (let i = 0; i < UNLOCKED_AVATARS.length; i++) {
        const baseAvatarId = UNLOCKED_AVATARS[i];
        const avatar = new starrail.Avatar({
            baseAvatarId,
            level: 80,
            promotion: 6,
            hasTakenPromotionRewardList: Array.from({ length: 5 }, (_, index) => index + 1)
        });
        avatar_list.push(avatar);
        // 4.5.51: rank 随 AvatarPathData 下发
        avatar_path_data_list.push(new starrail.AvatarPathData({
            avatarId: baseAvatarId,
            rank: 6,
        }));
    }
    // Create response
    const proto = new starrail.GetAvatarDataScRsp({
        retcode: 0,
        isGetAll: true,
        avatarList: avatar_list,
        avatarPathDataInfoList: avatar_path_data_list,
    });

    // Encode and send response
    const bufferData = starrail.GetAvatarDataScRsp.encode(proto).finish();
    await player.send(CmdID.CmdGetAvatarDataScRsp, bufferData);
}

// 4.5.51: GetMultiPathAvatarInfoScRsp 消息已从协议中移除，
// CmdGetMultiPathAvatarInfoCsReq 亦不在 4.5.51 的 CmdId 表中。
// 多命途信息改为随 GetAvatarDataScRsp.avatarPathDataInfoList (AvatarPathData)
// 一并下发，见 TODO-4.5.51-MULTIPATH。
// 原 handler 已移除，对应注册也已在 NetSession.ts 中删除。


