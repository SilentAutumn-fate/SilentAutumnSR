import { CmdID } from '../../proto/cmdId';
import { MC_AVATAR_IDS, M7_AVATAR_IDS } from '../../common/constants';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { AvatarJson, JsonData } from '../../data/loadFreeData';
import { createLineup as createSavedLineup } from './lineup_mgr';

/**
 * Avatar builders — the port of pearl-sr's `gameserver/src/manager/avatar_mgr.zig`.
 *
 * DATA-MODEL DIVERGENCE FROM THE ZIG SOURCE (deliberate, per PORTING-GUIDE):
 * pearl-sr computes its avatar id list from `resources/AvatarConfig.json` and
 * invents levels, ranks, relic links and uid counters per response. This server
 * keeps the KainSR/freesr data model instead: the *owned* avatars and their
 * levels, promotion, ranks, skills, relics and lightcones all come from the
 * freesr profile (`session.data.getDataJson()`).
 *
 * The roster contains one `Avatar` per character and one `AvatarPathData`
 * per available path, with skin and enhancement state on each path.
 *
 * Where the freesr profile and pearl-sr's `resources/AvatarConfig.json` disagree
 * the profile wins; every such choice carries a `DEVIATION:` comment.
 */

/**
 * pearl-sr `data.zig` `AvatarSkinMap`: the skin each avatar starts with. Only
 * these six ids ever produce a non-zero `dressed_skin_id` in the reference.
 */
const DEFAULT_SKIN_IDS: [number, number][] = [
    [1001, 1100101],
    [1303, 1130301],
    [1310, 1131001],
    [1415, 1141501],
    [1407, 1140701],
    [1501, 1150101],
];

/** All known skins, including Aha's 4.7 Galactic Lottery outfit. */
export const AVATAR_SKIN_IDS = new Map<number, number>([
    ...DEFAULT_SKIN_IDS,
    [1505, 1150501],
    [1409, 1140901],
    [1511, 1151101],
]);
export const SKIN_LIST = [...AVATAR_SKIN_IDS.values()];
const defaultSkinIds = new Map(DEFAULT_SKIN_IDS);

/**
 * pearl-sr `data.zig` `EnhanceAvatarID`: 11 mutable slots, with 1306 present
 * twice on purpose (the reference table is reproduced verbatim).
 */
const DEFAULT_ENHANCE_AVATAR_IDS: number[] = [
    1005, 1006, 1205, 1212, 1306, 1307, 1306, 1102, 1217, 1310, 1004,
];

/** `has_taken_promotion_reward_list` = Zig `for (1..6) |i|` (half-open). */
const PROMOTION_REWARD_STEPS = [1, 2, 3, 4, 5];

/** `AvatarType_AvatarFormalType` — see `node dev/tools/proto-dump.js AvatarType`. */
const AVATAR_FORMAL_TYPE = 3;

/** Trailblazer paths collapse onto base id 8001; March 7th Rogue onto 1001. */
const TRAILBLAZER_BASE_ID = 8001;
const MARCH_7TH_BASE_ID = 1001;
/** Either March 7th path id (`MultiPathAvatarType` 1001 / 1224). */
const MULTI_PATH_MAR_7TH_ROGUE = 1224;

/** Fallback `LineupAvatar` stats when an id is not in the profile. */
const DEFAULT_HP = 10000;
const DEFAULT_SP = 10000;

/**
 * Per-connection enhancement state.
 */
interface AvatarScratch {
    /** 11 mutable slots (`EnhanceAvatarID`). */
    enhanceIds: number[];
}

const scratchBySession = new WeakMap<NetSession, AvatarScratch>();

function scratchOf(session: NetSession): AvatarScratch {
    let scratch = scratchBySession.get(session);
    if (!scratch) {
        scratch = {
            enhanceIds: [...DEFAULT_ENHANCE_AVATAR_IDS],
        };
        scratchBySession.set(session, scratch);
    }
    return scratch;
}

// ---- id classification -----------------------------------------------------

/** True for any Trailblazer path id (8001..8010). */
export function isTrailblazer(avatarId: number): boolean {
    return MC_AVATAR_IDS.includes(avatarId);
}

/** True for either March 7th path id (1001 knight, 1224 rogue). */
export function isMarch7th(avatarId: number): boolean {
    return M7_AVATAR_IDS.includes(avatarId);
}

/**
 * `base_avatar_id` for an owned avatar — pearl-sr `createAvatar`:
 * 8001..8010 -> 8001, 1224 -> 1001, everything else keeps its own id.
 */
export function baseAvatarId(avatarId: number): number {
    if (isTrailblazer(avatarId)) return TRAILBLAZER_BASE_ID;
    if (avatarId === MULTI_PATH_MAR_7TH_ROGUE) return MARCH_7TH_BASE_ID;
    return avatarId;
}

/**
 * `cur_multi_path_avatar_type` — the *currently selected* path for a multipath
 * avatar, or the avatar's own id otherwise. This is what makes the client show
 * the right Trailblazer/March 7th form after `CmdSetAvatarPathCsReq`, and the
 * same resolution pearl-sr's `LineupManager.createLineup` applies to a roster
 * entry (without it a lineup saved as `8006` would keep playing the Harmony
 * Trailblazer after the player switched paths).
 */
export function currentPathId(session: NetSession, avatarId: number): number {
    if (isTrailblazer(avatarId)) return session.data.getIdMain();
    if (isMarch7th(avatarId)) return session.data.getIdM7();
    return avatarId;
}

// ---- skin / enhancement tables ---------------------------------------------

/** pearl-sr `getSkinId`: first match wins, 0 when the avatar has no entry. */
export function getSkinId(session: NetSession, avatarId: number): number {
    return session.data.getDataInGame().player.avatarSkinIds?.[avatarId] ??
        defaultSkinIds.get(avatarId) ?? 0;
}

/** Save explicit selections, including 0 when the player removes a default skin. */
export function updateSkinId(session: NetSession, avatarId: number, skinId: number): void {
    const player = session.data.getDataInGame().player;
    (player.avatarSkinIds ??= {})[avatarId] = skinId;
}

/** True when the avatar sits in the `EnhanceAvatarID` slots. */
export function isEnhanced(session: NetSession, avatarId: number): boolean {
    return scratchOf(session).enhanceIds.includes(avatarId);
}

/**
 * pearl-sr `onSetAvatarEnhancedId` slot manipulation, reproduced exactly:
 * `enhanced_id == 0` clears the **first** matching slot; any other value adds
 * the avatar to the first free (`0`) slot and is a no-op when already present.
 */
export function applyEnhancedId(session: NetSession, avatarId: number, enhancedId: number): void {
    const slots = scratchOf(session).enhanceIds;
    if (enhancedId === 0) {
        const index = slots.indexOf(avatarId);
        if (index !== -1) slots[index] = 0;
        return;
    }
    if (slots.includes(avatarId)) return;
    const free = slots.indexOf(0);
    if (free !== -1) slots[free] = avatarId;
}

export function outfitIdsOf(session: NetSession): number[] {
    return [...(session.data.getDataInGame().player.outfitIds ?? [])];
}

export function setOutfitIds(session: NetSession, ids: number[]): void {
    session.data.getDataInGame().player.outfitIds = [...ids];
}

// ---- builders --------------------------------------------------------------

/**
 * `EquipRelic` links for one avatar.
 *
 * `relic_id % 10` is the slot digit (1..6) of an HSR relic id, which is what
 * `RelicJson.toEquipRelicProto()` writes into the `type` field — pearl-sr instead
 * numbers the six links 0..5 from the config order.
 */
function equipRelicList(json: JsonData, avatarId: number): starrail.EquipRelic[] {
    return json.relicsOf(avatarId).map((relic) => relic.toEquipRelicProto());
}

/**
 * The freesr skill tree: `data.skills` is already a `point id -> level` map whose
 * keys are real `AvatarSkillTreeConfig.PointID` values.
 *
 * DEVIATION: pearl-sr iterates `AvatarSkillTreeConfig.json`, keeps only rows with
 * `Level == MaxLevel` and writes the *anchor index* of the `AnchorType` string
 * ("Point01" -> 1) into `point_id`, because its loader never stores the parsed
 * `PointID` column. Using the profile's own point ids keeps this list consistent
 * with `Avatar.skilltree_list`, which the battle simulator consumes.
 */
function skillTree(avatar: AvatarJson | undefined): starrail.AvatarPathSkillTree[] {
    if (!avatar) return [];
    return Object.entries(avatar.data.skills).map(([pointId, level]) => ({
        pointId: Number(pointId),
        level: Number(level),
    }));
}

/** pearl-sr `createAvatar`: the owned avatar with its profile values. */
export function createAvatar(session: NetSession, avatar: AvatarJson): starrail.Avatar {
    const json = session.data.getDataJson();
    // NOTE: this proto revision's `Avatar` carries only level / promotion / exp,
    // the lightcone link and the path/base ids — no rank, skill tree or relic
    // list. Those live in `AvatarPathData`, which is sent alongside (see
    // `createAvatarPathData`), exactly as pearl-sr splits them.
    const proto = avatar.toAvatarProto(json.lightconeOf(avatar.avatar_id));
    proto.baseAvatarId = baseAvatarId(avatar.avatar_id);
    proto.curMultiPathAvatarType = currentPathId(session, avatar.avatar_id);
    proto.hasTakenPromotionRewardList = PROMOTION_REWARD_STEPS.filter((step) => step <= avatar.promotion);
    return proto;
}

/** pearl-sr `createAvatarPathData`: rank, skin, enhancement, gear and skills. */
export function createAvatarPathData(
    session: NetSession,
    avatarId: number,
): starrail.AvatarPathData {
    const json = session.data.getDataJson();
    const avatar = json.avatar(avatarId);
    const lightcone = json.lightconeOf(avatarId);
    return {
        avatarId,
        rank: avatar?.data.rank ?? 0,
        dressedSkinId: getSkinId(session, avatarId),
        unkEnhancedId: isEnhanced(session, avatarId) ? 1 : 0,
        // The profile's own lightcone unique id, so `AvatarPathData` and the bag
        // agree. pearl-sr instead invents a fresh id per response and never links
        // it to `Avatar.equipment_unique_id`.
        pathEquipmentId: lightcone ? lightcone.uniqueId : 0,
        equipRelicList: equipRelicList(json, avatarId),
        avatarPathSkillTree: skillTree(avatar),
    };
}

/**
 * One owned Avatar per character, with a separate entry for each available path.
 */
export function buildAvatarSync(session: NetSession): starrail.AvatarSync {
    const json = session.data.getDataJson();
    const avatarList: starrail.Avatar[] = [];
    const avatarPathDataInfoList: starrail.AvatarPathData[] = [];
    const seen = new Set<number>();

    for (const id of json.avatarIds()) {
        if (isTrailblazer(id) && id % 2 !== session.data.getIdMain() % 2) continue;
        avatarPathDataInfoList.push(createAvatarPathData(session, id));
        const baseId = baseAvatarId(id);
        if (seen.has(baseId)) continue;
        const avatar = json.avatar(currentPathId(session, id)) ?? json.avatar(id);
        if (avatar) {
            seen.add(baseId);
            avatarList.push(createAvatar(session, avatar));
        }
    }

    return { avatarList, avatarPathDataInfoList };
}

/**
 * pearl-sr `syncAvatarData`: one unsolicited full `AvatarSync` notify, sent after
 * every path / skin / enhancement change. Its uid-counter reset has no analogue
 * here — the profile's uids are stable, so nothing has to be renumbered.
 */
export async function syncAvatarData(session: NetSession): Promise<void> {
    await session.sendMessage(CmdID.CmdPlayerSyncScNotify, {
        avatarSync: buildAvatarSync(session),
    });
}

/** The saved Trailblazer selection also identifies the body variant. */
export function playerGender(session: NetSession): number {
    return session.data.getIdMain() % 2 === 0 ? 2 : 1;
}

function lineupAvatar(
    json: JsonData,
    avatarId: number,
    slot: number,
): starrail.LineupAvatar {
    const avatar = json.avatar(avatarId);
    return {
        id: avatarId,
        slot,
        satiety: 0,
        hp: DEFAULT_HP,
        // DEVIATION: pearl-sr hard-codes cur_sp/max_sp = 10000/10000 and invents
        // its roster from config.json; the profile carries the real sp values.
        // A profile that leaves `sp_value` at 0 means "unset", so the bar starts
        // full (cur == max) rather than empty. (Note that
        // `loadFreeData.toLineupAvatarProto` writes `spNeed`, which is not a
        // SpBarInfo field; the field is `maxSp`.)
        spBar: {
            curSp: avatar?.sp_value || avatar?.sp_max || DEFAULT_SP,
            maxSp: avatar?.sp_max || DEFAULT_SP,
        },
        avatarType: AVATAR_FORMAL_TYPE,
    };
}

/**
 * The lineup sent by `CmdSyncLineupNotify`, built from the persisted roster in
 * `data-in-game.json` rather than pearl-sr's config-derived team. Multipath
 * entries are resolved to the currently selected path, which is the reason
 * `CmdSetAvatarPathCsReq` has to notify the lineup at all.
 */
export function buildLineup(session: NetSession): starrail.LineupInfo {
    const lineup = createSavedLineup(session);
    // Keep profile HP/SP values while sharing slots, name, index and leader.
    lineup.avatarList = lineup.avatarList.map((avatar: any) =>
        lineupAvatar(session.data.getDataJson(), avatar.id, avatar.slot));
    return lineup;
}
