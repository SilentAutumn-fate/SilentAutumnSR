import { CmdID } from '../../proto/cmdId';
import { SERVER_NAME } from '../../common/constants';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { LightconeJson, RelicJson } from '../../data/loadFreeData';
import type { HandlerEntry } from './types';
import { catalogMaterials } from '../../data/material-catalog';

/**
 * Inventory: bag contents and item use.
 *
 *   GetBagCsReq   (534) -> GetBagScRsp   (525)
 *   UseItemCsReq  (558) -> UseItemScRsp  (556), preceded by SyncLineupNotify (742)
 *
 * Data-model divergence from the reference (pearl-sr, Zig): pearl-sr keeps no
 * inventory at all — every bag entry is rebuilt per request by scanning its own
 * four-avatar `config.json` team through AvatarManager.createEquipment /
 * createRelic, with unique ids minted from a process-global counter. This port
 * has a real profile (freesr-data.json), so the equipment/relic lists come from
 * `session.data.getDataJson()` and carry the profile's own stable ids — the same
 * ones the avatar handler shows on the character screen. The response *shape*
 * (and the material tables, which are reference constants) is unchanged.
 */

/**
 * pearl-sr `data.zig` Data.ItemList — the stack of "owned" materials reported at
 * 100 each. There is no material model in the port, so the reference table is
 * reproduced verbatim.
 */
const ITEM_LIST = [251001, 251002, 251003, 251004, 101, 238, 239];

/** All 21 known PlayerOutfit items, granted at one each (including 4.7 additions). */
export const PLAYER_OUTFIT_LIST = [
    227016, 227015, 229001, 227004, 227013, 227012, 227010, 227009, 227008, 227007, 227006, 227005,
    227003, 227002, 227001,
    227017, 227018, 227019, 227020, 227021, 227022,
];

/** AvatarType_AvatarFormalType. */
const AVATAR_FORMAL_TYPE = 3;

/** Lineup members that widen the technique-point pool (pearl-sr buildLineup). */
const WIDE_MP_AVATAR_IDS = [1408, 1510];

/**
 * Bag entry for one owned lightcone.
 *
 * `uniqueId` is the profile's id (2000 + internal_uid, see LightconeJson) rather
 * than a freshly minted one: the client correlates bag equipment with the
 * `equipmentUniqueId` it was given for avatars, so they must agree. Everything
 * else matches pearl-sr's createEquipment: level/rank/promotion from the config,
 * `dressAvatarId` = the avatar wearing it (0 when unequipped) and
 * `isProtected = true`.
 */
function bagEquipment(lightcone: LightconeJson): starrail.Equipment {
    return {
        uniqueId: lightcone.uniqueId,
        tid: lightcone.item_id,
        level: lightcone.level,
        rank: lightcone.rank,
        promotion: lightcone.promotion,
        dressAvatarId: lightcone.equip_avatar,
        exp: 0,
        isProtected: true,
    };
}

/**
 * Bag entry for one owned relic.
 *
 * Divergence: pearl-sr always writes exactly four `subAffixList` entries because
 * its relic config format has four fixed stat slots (missing ones decode as
 * 0/0/0). The freesr profile carries the real affix list, so it is emitted as-is
 * (1..4 entries) instead of being zero-padded.
 */
function bagRelic(relic: RelicJson): starrail.Relic {
    return {
        uniqueId: relic.uniqueId,
        tid: relic.relic_id,
        level: relic.level,
        mainAffixId: relic.main_affix_id,
        dressAvatarId: relic.equip_avatar,
        exp: 0,
        isProtected: true,
        subAffixList: relic.sub_affixes.map((affix) => ({
            affixId: affix.sub_affix_id,
            cnt: affix.count,
            step: affix.step,
        })),
    };
}

/**
 * Lineup sent by CmdSyncLineupNotify.
 *
 * pearl-sr rebuilds the lineup from its `config.json` team on every call
 * (LineupManager.createLineup) — the team is config data there because it has no
 * saved player state. The equivalent in this port is the persisted lineup in
 * data-in-game.json, which is what the client itself edits, so that is what is
 * echoed back. Per-avatar values match pearl-sr's buildLineup: hp 10000,
 * satiety 0, sp 10000/10000, AVATAR_FORMAL_TYPE, `slot` = position in the list.
 */
function currentLineup(session: NetSession): starrail.LineupInfo {
    const members = session.data.getDataInGame().lineupEntries().map(([, avatarId]) => avatarId);
    const mp = members.some((id) => WIDE_MP_AVATAR_IDS.includes(id)) ? 7 : 5;
    return {
        // pearl-sr hard-codes "PearlSR" here; SERVER_NAME is this port's equivalent.
        name: SERVER_NAME,
        mp,
        maxMp: mp,
        avatarList: members.map((id, index) => ({
            id,
            slot: index,
            satiety: 0,
            hp: 10000,
            spBar: { curSp: 10000, maxSp: 10000 },
            avatarType: AVATAR_FORMAL_TYPE,
        })),
    };
}

/** GetBagCsReq has no fields; the whole response is config/profile derived. */
export async function onGetBagCsReq(_req: starrail.GetBagCsReq, session: NetSession): Promise<void> {
    const profile = session.data.getDataJson();

    await session.sendRsp(CmdID.CmdGetBagScRsp, {
        retcode: 0,
        materialList: catalogMaterials(
            session.config.materialCatalog,
            ITEM_LIST.map((tid) => ({ tid, num: 100 })),
            PLAYER_OUTFIT_LIST,
        ),
        equipmentList: profile.lightcones.map(bagEquipment),
        relicList: profile.relics.map(bagRelic),
    });
}

/**
 * UseItemCsReq: pearl-sr reads only useItemId/useItemCount, never consumes the
 * item and grants nothing. It does push a SyncLineupNotify *before* the ScRsp
 * (the client refreshes its team from it), which is reproduced here.
 */
export async function onUseItemCsReq(req: starrail.UseItemCsReq, session: NetSession): Promise<void> {
    await session.sendMessage(CmdID.CmdSyncLineupNotify, {
        lineup: currentLineup(session),
    });

    await session.sendRsp(CmdID.CmdUseItemScRsp, {
        retcode: 0,
        useItemId: req?.useItemId ?? 0,
        useItemCount: req?.useItemCount ?? 0,
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetBagCsReq, action: onGetBagCsReq },
    { cmdId: CmdID.CmdUseItemCsReq, action: onUseItemCsReq },
];
