import { CmdID } from '../../../proto/cmdId';
import type { NetSession } from '../../NetSession';
import type { starrail } from '../../../proto/starrail';
import type { LightconeJson, RelicJson } from '../../../data/loadFreeData';
import { buildAvatarSync } from '../../manager/avatar_mgr';

/**
 * `/sync` — port of pearl-sr `gameserver/src/commands/sync.zig`.
 *
 * The reference answers "Sync items with config" and then pushes **three**
 * `PlayerSyncScNotify` packets: the whole inventory unequipped, the whole
 * inventory equipped again, and finally the avatar sync. Between the first two
 * it re-reads its avatar config (`ConfigManager.UpdateGameConfig()`), which is
 * how a player picks up edits to `config.json` without relogging.
 *
 * The equivalent user-editable file here is the freesr profile, so the reload is
 * `DataService.updateDataJson()` (re-reads `src/data/freesr-data.json`) and it
 * happens once, before the three packets, because every packet is built from it.
 * The reference's `Uid.resetGlobalUidGens()` / `updateInitialUid()` have no
 * analogue: this port hands out the profile's stable uids
 * (`loadFreeData.LightconeJson.uniqueId` / `RelicJson.uniqueId`) instead of
 * inventing a fresh sequence per response.
 */

const SYNC_REPLY = 'Sync items with config\n';

/** `dress_avatar_id` sent in the first pass: everything is un-equipped. */
const NO_AVATAR = 0;

/**
 * `AvatarManager.createEquipment` — with the dress link on the field this proto
 * revision actually has.
 *
 * NOTE: the shared `loadFreeData.LightconeJson.toEquipmentProto()` writes
 * `charId`, which is **not** a field of `Equipment` (`dress_avatar_id` is, field
 * 9), so protobufjs silently drops it and no lightcone would ever look equipped.
 * The message is rebuilt here rather than editing that shared file (same
 * reasoning as `manager/avatar_mgr.equipRelicList`).
 */
function equipmentProto(lightcone: LightconeJson, dressAvatarId: number): starrail.Equipment {
    return {
        uniqueId: lightcone.uniqueId,
        tid: lightcone.item_id,
        level: lightcone.level,
        rank: lightcone.rank,
        promotion: lightcone.promotion,
        isProtected: true,
        dressAvatarId,
    };
}

/** `AvatarManager.createRelic` — same `charId` caveat as `equipmentProto`. */
function relicProto(relic: RelicJson, dressAvatarId: number): starrail.Relic {
    return {
        uniqueId: relic.uniqueId,
        tid: relic.relic_id,
        level: relic.level,
        mainAffixId: relic.main_affix_id,
        exp: 0,
        isProtected: true,
        dressAvatarId,
        subAffixList: relic.sub_affixes.map((affix) => ({
            affixId: affix.sub_affix_id,
            cnt: affix.count,
            step: affix.step,
        })),
    };
}

/** `sync.zig::onGenerateAndSync`. */
export async function syncCommand(session: NetSession): Promise<string> {
    // Equivalent of the reference's `ConfigManager.UpdateGameConfig()`.
    await session.data.updateDataJson();
    const data = session.data.getDataJson();

    // (1) `syncItems(session, allocator, equip_avatar = false)`: the equipment
    // and relic lists with no owner, which is what makes the client re-read the
    // dress links from the next packet instead of keeping a stale roster.
    await session.sendMessage(CmdID.CmdPlayerSyncScNotify, {
        equipmentList: data.lightcones.map((lightcone) => equipmentProto(lightcone, NO_AVATAR)),
        relicList: data.relics.map((relic) => relicProto(relic, NO_AVATAR)),
    });

    // (2) `syncItems(session, allocator, equip_avatar = true)`: the same lists
    // with the profile's own equip links.
    await session.sendMessage(CmdID.CmdPlayerSyncScNotify, {
        equipmentList: data.lightcones.map((lightcone) =>
            equipmentProto(lightcone, lightcone.equip_avatar),
        ),
        relicList: data.relics.map((relic) => relicProto(relic, relic.equip_avatar)),
    });

    // (3) `onSyncAvatar`: the avatar list plus its path data, built from the
    // profile by the shared avatar manager.
    await session.sendMessage(CmdID.CmdPlayerSyncScNotify, {
        avatarSync: buildAvatarSync(session),
    });

    return SYNC_REPLY;
}
