import type { NetSession } from '../NetSession';
import type { AvatarJson, BattleConfigJson, RelicJson } from '../../data/loadFreeData';
import type { StageConfig } from './config_mgr';
import { isEnhanced } from './avatar_mgr';
import { selectedAvatarIds } from './lineup_mgr';
import {
    challengeBlessings,
    challengeMode,
    challengeStageId,
    isChallengeMode,
} from './challenge_mgr';
import {
    getFunModeAvatarIds,
    getFunModeHp,
    isFirstChallengeNode,
    isFunMode,
} from '../scene/commands/value';

/**
 * Battle construction — port of pearl-sr `manager/battle_mgr.zig`
 * (`BattleManager`, `ChallegeStageManager`) plus the process-global state
 * `services/battle.zig` and `services/lineup.zig` keep beside it.
 *
 * Sources: `docs/spec-battle-challenge.md` §12.0 (builders), §12.0.5 (buff list
 * order and contents), §12.0.6 (monster waves), §12.0.8 (the two callers) and
 * §12.10 (every hard-coded id).
 *
 * DATA-MODEL DIVERGENCE (deliberate, per PORTING-GUIDE): pearl-sr reads its
 * avatar templates, relics and lightcones out of `config.json → avatar_config`,
 * and the battle's waves/level out of `config.json → battle_config`. This server
 * has neither: everything about an avatar comes from the freesr profile
 * (`session.data.getDataJson()`) and the design-data tables come from
 * `ConfigManager`. The *shape* of every message below is pearl-sr's; the values
 * are the profile's, and every place where that changes what the client sees
 * carries a `DEVIATION:` comment.
 *
 * Process-global state, made per-connection here (a WeakMap keyed by the session,
 * so one player cannot retarget another's battle):
 *
 *   `services/battle.zig`  on_battle    -> `isOnBattle` / `startBattle` / `endBattle`
 *   `services/lineup.zig`  leader_slot  -> `setLeaderSlot` / `leaderSlotOf`
 *
 * `Logic.Challenge()` is NOT duplicated here: `manager/challenge_mgr.ts` owns it
 * and this module reads it through that module's accessors. `leaderSlot` does live
 * here rather than in `manager/lineup_mgr.ts` (where pearl-sr keeps it) because
 * that module's export surface is frozen to three functions by the PORTING-GUIDE;
 * the ownership inversion is the only difference.
 */

// ---- constants (origin: pearl-sr manager/battle_mgr.zig) --------------------

/** `AvatarType_AvatarFormalType` — 3 in this proto, 1 in the freesr loader. */
const AVATAR_FORMAL_TYPE = 3;
/** `createBattleInfo` hard-codes world_level 6 for every non-empty battle. */
const BATTLE_WORLD_LEVEL = 6;
/** `config.json → battle_config.battle_id` (default 1); the profile has no field. */
const DEFAULT_BATTLE_ID = 1;
/** `config.json → battle_config.cycle_count` — 30 rounds for MOC/AS. */
const DEFAULT_ROUNDS_LIMIT = 30;
/** `challengeMode === 1` (Pure Fiction) gets 4 rounds instead (§12.0.8). */
const PURE_FICTION_ROUNDS_LIMIT = 4;
/** `Logic.Challenge().GetChallengeMode()`'s Pure Fiction value (§14.0.2). */
const PURE_FICTION_MODE = 1;
/** `0xFFFFFFFF` — both the wave flag and the "no owner" index. */
const MAX_U32 = 0xffffffff;
/** `BattleAvatar.hp` — pearl-sr writes `avatarConf.hp * 100` (config.json: 100). */
const BATTLE_AVATAR_HP = 10000;
/** `SpBarInfo` is a 0…10000 fixed-point percentage of the avatar's energy. */
const BATTLE_SP_BAR_MAX = 10000;
/** pearl-sr's literal `cur_sp` when the avatar's energy is unknown. */
const BATTLE_SP_BAR_DEFAULT_CUR = 5000;
/** `BattleManager.selectedAvatarID` is exactly 4 slots wide. */
const ROSTER_SLOTS = 4;
/** `BattleBuff.dynamic_values` key used by every buff this module writes. */
const SKILL_INDEX_KEY = 'SkillIndex';

/** `services/lineup.zig` `leader_slot` defaults to 0 and is never bounds-checked. */
const DEFAULT_LEADER_SLOT = 0;

/**
 * `addTechniqueBuffs`'s id remap: the *buffed* avatar is the base form of the
 * Trailblazer path the roster entry points at.
 */
const TECHNIQUE_AVATAR_REMAP: [number, number][] = [
    [8004, 8003],
    [8006, 8005],
    [8008, 8007],
    [8010, 8009],
];

/** `data.zig:26` `IgnoreToughness` — extra buff for these ids. */
const IGNORE_TOUGHNESS_AVATAR_IDS = [1006, 1308, 1317];
const IGNORE_TOUGHNESS_BUFF_ID = 1000119;

interface TechniqueBuffRule {
    avatarId: number;
    buffs: {
        id: number;
        /** `owner_is_avatar`: false means `owner_index = leader_slot`. */
        ownerIsAvatar: boolean;
        dynamicValues: [string, number][];
    }[];
}

/**
 * The `technique_buffs` table, verbatim (`battle_mgr.zig:103-236`). The FIRST rule
 * whose `avatarId` matches wins and contributes all of its buffs in order;
 * `addTechniqueBuffs` falls back to `buffedAvatarId * 100 + 1` only when no rule
 * matched. Do not reorder it or "complete" the lists from the freesr profile's own
 * `techniques` array — the reference sends this exact subset.
 */
const TECHNIQUE_BUFF_RULES: TechniqueBuffRule[] = [
    {
        avatarId: 1208,
        buffs: [
            { id: 120801, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            { id: 120802, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
        ],
    },
    {
        avatarId: 1224,
        buffs: [
            { id: 122402, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            { id: 122403, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            {
                id: 122401,
                ownerIsAvatar: true,
                dynamicValues: [
                    ['#ADF_1', 3],
                    ['#ADF_2', 3],
                ],
            },
        ],
    },
    {
        avatarId: 1304,
        buffs: [{ id: 130403, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 3]] }],
    },
    {
        avatarId: 1306,
        buffs: [
            { id: 130601, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            { id: 130602, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
        ],
    },
    {
        avatarId: 1308,
        buffs: [{ id: 130803, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] }],
    },
    {
        avatarId: 1309,
        buffs: [
            { id: 130901, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            { id: 130902, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
        ],
    },
    {
        avatarId: 1310,
        buffs: [
            { id: 131001, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            { id: 131002, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            { id: 1000112, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
        ],
    },
    {
        avatarId: 1412,
        buffs: [
            { id: 141201, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            { id: 1000121, ownerIsAvatar: false, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
        ],
    },
    {
        avatarId: 1414,
        buffs: [
            { id: 141401, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            { id: 1000121, ownerIsAvatar: false, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
        ],
    },
    {
        avatarId: 1510,
        buffs: [
            { id: 151001, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            { id: 151002, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
        ],
    },
    {
        avatarId: 1503,
        buffs: [
            { id: 150301, ownerIsAvatar: true, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
            { id: 1000121, ownerIsAvatar: false, dynamicValues: [[SKILL_INDEX_KEY, 0]] },
        ],
    },
];

/**
 * `addTriggerAttack`'s `getAttackerBuffId()`: the leader's element picks the buff.
 * The element comes from `resources/AvatarConfig.json` (`DamageType`), which is
 * design data — the freesr profile has no element column.
 */
const ATTACKER_BUFF_BY_ELEMENT: [string, number][] = [
    ['Physical', 1000111],
    ['Fire', 1000112],
    ['Ice', 1000113],
    ['Thunder', 1000114],
    ['Wind', 1000115],
    ['Quantum', 1000116],
    ['Imaginary', 1000117],
];
/** `AvatarConfig.Element.None` — an id with no config row yields buff id 0. */
const NO_ATTACKER_BUFF = 0;

/** `addGlobalPassive`: `owner_index` is the literal 1, not `leader_slot`. */
const GLOBAL_PASSIVE_OWNER_INDEX = 1;
/** `[owned avatar id, buff id]` — conditional on owning 1407 / 1506. */
const GLOBAL_PASSIVES: [number, number][] = [
    [1407, 140703],
    [1506, 150602],
];

/** `addStageInvasion`: `3034000 + InvasionID`, challenge fights only. */
const STAGE_INVASION_BUFF_BASE = 3034000;

/** `addBattleTargets`: the stage-id bands that carry target progress. */
const PF_STAGE_ID_RANGES: [number, number][] = [
    [30019000, 30019100],
    [30021000, 30021100],
    [30301000, 30399900],
];
const AS_STAGE_ID_RANGE: [number, number] = [420100, 420900];
const PF_TARGET_HEAD_CHALLENGE_ID = 10003;
const PF_TARGET_HEAD_PLAIN_ID = 10002;
const PF_TARGET_TOTAL_PROGRESS = 80000;
/** Node 2 (`!FirstNode`) in challenge mode is already half-cleared. */
const PF_TARGET_NODE2_PROGRESS = 40000;
const PF_TARGET_TAIL_IDS = [2001, 2002];
const AS_TARGET_HEAD_ID = 90005;
const AS_TARGET_HEAD_PROGRESS = 2000;

// ---- per-session state ------------------------------------------------------

interface BattleScratch {
    activeBattle?: any;
    /** `services/lineup.zig` `leader_slot`. */
    leaderSlot: number;
}

const scratchBySession = new WeakMap<NetSession, BattleScratch>();

function scratchOf(session: NetSession): BattleScratch {
    let scratch = scratchBySession.get(session);
    if (!scratch) {
        scratch = { leaderSlot: DEFAULT_LEADER_SLOT };
        scratchBySession.set(session, scratch);
    }
    return scratch;
}

// ---- exported state (the reference's cross-module globals) -------------------

/** `services/battle.zig` `on_battle` — "a normal (non-challenge) fight is on". */
export function activeBattleInfo(session: NetSession): any {
    return session.battle ? scratchOf(session).activeBattle ?? null : null;
}

/**
 * `on_battle = true` (§12.1–§12.4, §12.5's non-challenge trigger battle) plus the
 * shared battle context: `NetSession.battle` and `PlayerState.battleEntered` are
 * the rest of this server's copy of "what the client is in".
 */
export function startBattle(session: NetSession, battle: any): void {
    scratchOf(session).activeBattle = battle;
    session.battle = {
        battleId: Number(battle?.battleId ?? DEFAULT_BATTLE_ID),
        stageId: Number(battle?.stageId ?? 0),
        avatarIds: (battle?.battleAvatarList ?? []).map((avatar: any) => Number(avatar?.id ?? 0)),
    };
    session.state.battleEntered = true;
}

/**
 * `on_battle = false`. §12.7 is the ONLY writer in pearl-sr (hazard 1: the flag is
 * never reset on login), which is why §12.6 answers `null` until the first trigger
 * battle of a connection — reproduced here.
 */
export function endBattle(session: NetSession): void {
    scratchOf(session).activeBattle = undefined;
    session.battle = null;
    session.state.battleEntered = false;
}

/** `services/lineup.zig` `leader_slot`, written by `onChangeLineupLeader`. */
export function setLeaderSlot(session: NetSession, slot: number): void {
    scratchOf(session).leaderSlot = Number(slot) || 0;
}

/** The RAW `leader_slot`, as `onChangeLineupLeader` stored it (no clamping). */
export function leaderSlotOf(session: NetSession): number {
    if (session.challengeId || session.challengePeakId || session.challengeTierceId) return 0;
    const saved = session.data.getDataInGame();
    if (saved.lineupTeams?.[saved.currentLineupIndex]) {
        const team = saved.team();
        return team.slots[team.leaderSlot] ? team.leaderSlot : saved.lineupEntries()[0]?.[0] ?? 0;
    }
    return scratchOf(session).leaderSlot;
}

/**
 * `leaderSlot` is not bounds-checked in Zig (hazard 3): `leader_slot >= 4` reads
 * past the end of the 4-slot roster. An out-of-range read falls back to slot 0
 * here, which is the reference's behaviour for a fresh connection anyway (the
 * default is 0).
 */
function safeLeaderSlot(session: NetSession, rosterLength: number): number {
    const slot = leaderSlotOf(session);
    return Number.isInteger(slot) && slot >= 0 && slot < rosterLength ? slot : 0;
}

// ---- avatar / wave data ------------------------------------------------------

/** The ids a battle is built from: `funMode ? funmodeAvatarID : selectedAvatarID`. */
function rosterIds(session: NetSession): number[] {
    // `getFunModeAvatarID` is NOT truncated to 4 slots (§16.2.4) and is filled by
    // the `/funmode on` chat command, so it is read, never duplicated here.
    if (isFunMode(session)) return [...getFunModeAvatarIds(session)];
    // `selectedAvatarIds` reads the shared "last lineup the client was told
    // about" slot, which every `buildLineup` path keeps in step — including the
    // challenge module's own `buildChallengeLineup` (§16.2.4: *every* lineup
    // build overwrites the battle roster).
    return selectedAvatarIds(session, ROSTER_SLOTS);
}

/**
 * `createBattleAvatar(avatarConf)` from the freesr profile.
 *
 * Returns null for an id the profile does not know: pearl-sr's equivalent is an id
 * with no `config.json` entry, which silently produces no `BattleAvatar`
 * (§12.0.7) — that is also how a 0-filled roster slot disappears. Two identical
 * roster ids therefore produce two identical avatars, as in the reference.
 */
export function createBattleAvatar(session: NetSession, avatarId: number): any | null {
    const json = session.data.getDataJson();
    const avatar = json.avatar(avatarId);
    if (!avatar) return null;

    const lightcone = json.lightconeOf(avatarId);
    return {
        avatarType: AVATAR_FORMAL_TYPE,
        id: avatarId,
        level: Number(avatar.level ?? 0),
        rank: Number(avatar.data?.rank ?? 0),
        // `index` is deliberately NOT written: pearl-sr leaves it 0 for every
        // avatar, so the client assigns battle positions itself (hazard 7).
        skilltreeList: battleSkillTree(session, avatarId),
        // An unequipped avatar must have an empty list. A zero-ID entry makes
        // the client look up a nonexistent light cone during battle setup.
        equipmentList: lightcone && lightcone.item_id > 0 ? [{
            id: lightcone.item_id,
            level: lightcone.level,
            promotion: lightcone.promotion,
            rank: lightcone.rank,
        }] : [],
        hp: BATTLE_AVATAR_HP,
        promotion: Number(avatar.promotion ?? 0),
        relicList: json.relicsOf(avatarId).map(battleRelic),
        spBar: battleSpBar(avatar),
        // The mutable `Data.EnhanceAvatarID` table lives with the avatar module
        // (`/value` and `onSetAvatarEnhancedId` are its writers).
        enhancedId: isEnhanced(session, avatarId) ? 1 : 0,
    };
}

/**
 * `BattleAvatar.sp_bar`.
 *
 * pearl-sr writes `{ cur_sp: avatarConf.sp * 100, max_sp: 10000 }` from
 * `config.json` (sp: 50 -> 5000/10000): the bar is a 0…10000 fixed-point
 * percentage, not a raw energy value. DEVIATION: the freesr profile records the
 * real energy pair (sp_value / sp_max, e.g. 55 / 110), so the same percentage is
 * computed from it — which reproduces pearl-sr's literals exactly for a 100-max
 * avatar — and avatars the export never recorded keep pearl-sr's defaults.
 */
function battleSpBar(avatar: AvatarJson): any {
    const max = Math.max(0, Number(avatar.sp_max ?? 0));
    const cur = Math.max(0, Number(avatar.sp_value ?? 0));
    if (max <= 0) return { curSp: BATTLE_SP_BAR_DEFAULT_CUR, maxSp: BATTLE_SP_BAR_MAX };

    const ratio = Math.round((cur / max) * BATTLE_SP_BAR_MAX);
    return { curSp: Math.min(BATTLE_SP_BAR_MAX, ratio), maxSp: BATTLE_SP_BAR_MAX };
}

/**
 * `BattleRelic`.
 *
 * §12.0.4 writes `id`/`level`/`main_affix_id` and one affix per recorded
 * `stat:cnt:step` token, skipping zero stats; `unique_id`, `set_id`, `type` and
 * `rarity` are never written, so they stay 0 — the profile's `internal_uid` (and
 * therefore `RelicJson.uniqueId`) is deliberately NOT used here, and the list must
 * not be padded to four entries either (hazard 6).
 */
function battleRelic(relic: RelicJson): any {
    return {
        id: Number(relic.relic_id ?? 0),
        level: Number(relic.level ?? 0),
        mainAffixId: Number(relic.main_affix_id ?? 0),
        subAffixList: (relic.sub_affixes ?? []).map((affix) => ({
            affixId: Number(affix.sub_affix_id ?? 0),
            cnt: Number(affix.count ?? 0),
            step: Number(affix.step ?? 0),
        })),
    };
}

/**
 * `BattleAvatar.skilltree_list`: every `AvatarSkillTreeConfig` row of the avatar
 * whose `Level === MaxLevel`, in table order, written as
 * `{ point_id: PointID, level: MaxLevel }` (§12.0.4).
 *
 * NOTE: the profile side (`AvatarPathData.avatar_path_skill_tree`) keeps using the
 * profile's own point ids and levels; the reference keeps the two lists separate
 * as well, and this is the list the client's battle simulator consumes.
 */
function battleSkillTree(session: NetSession, avatarId: number): any[] {
    return session.config
        .skillTreeOf(avatarId)
        .filter((skill) => skill.Level === skill.MaxLevel)
        .map((skill) => ({ pointId: Number(skill.PointID), level: Number(skill.MaxLevel) }));
}

/** One battle wave: the level to report and the monster ids it contains. */
interface BattleWave {
    level: number;
    monsterIds: number[];
}

/**
 * `config.json → battle_config.monster_wave`'s equivalent: the profile's own
 * waves. DEVIATION: pearl-sr reports ONE `monster_level` (82) for every wave,
 * while the profile stores a level per monster, so each wave reports the highest
 * level it contains (the same rule `MonsterJson.toSceneMonsterWave` applies on the
 * profile side).
 */
function profileWaves(config: BattleConfigJson): BattleWave[] {
    return (config?.monsters ?? []).map((wave) => ({
        level: wave.reduce((max, monster) => Math.max(max, Number(monster.level ?? 0)), 0),
        monsterIds: wave.map((monster) => Number(monster.monster_id ?? 0)),
    }));
}

/**
 * `resources/StageConfig.json`'s waves for the challenge battle: `MonsterList` is
 * one array of monster ids per wave, plus one `Level` for the whole stage
 * (§12.0.8).
 *
 * NOTE: `config_mgr.ts` declares `StageConfig.MonsterList` as `number[]`; the table
 * really holds `number[][]`. The cast is deliberate — the declaration is wrong, not
 * the data (the same situation `scene_mgr.ts` documents for
 * `FloorSavedValuesConfig`).
 */
function stageWaves(stage: StageConfig): BattleWave[] {
    const waves = (stage?.MonsterList ?? []) as unknown as number[][];
    return waves.map((monsterIds) => ({
        level: Number(stage.Level ?? 0),
        monsterIds: Array.isArray(monsterIds) ? monsterIds.map(Number) : [],
    }));
}

// ---- BattleBuff helpers ------------------------------------------------------

/**
 * A `BattleBuff` exactly as every §12.0.5 builder writes it: level 1, wave flag
 * `0xFFFFFFFF`, a fresh single-element `target_index_list` of `[0]`, and the
 * dynamic values the caller supplies.
 */
function battleBuff(id: number, ownerIndex: number, dynamicValues: Record<string, number>): any {
    return {
        id,
        level: 1,
        ownerIndex,
        waveFlag: MAX_U32,
        targetIndexList: [0],
        dynamicValues,
    };
}

function skillIndexValues(value: number): Record<string, number> {
    return { [SKILL_INDEX_KEY]: value };
}

// ---- the five buff builders (§12.0.5) ---------------------------------------

/**
 * §12.0.5.1 `addTechniqueBuffs` — per avatar, in roster order.
 *
 * DEVIATION: pearl-sr skips an avatar whose `config.json` entry clears
 * `use_technique`. The freesr profile instead records the techniques the account
 * has applied (`AvatarJson.techniques`), so a non-empty list is the equivalent
 * "technique switched on" test; for the base avatars the reference's fallback buff
 * id is `id * 100 + 1`, which is exactly the single technique id the profile lists
 * for them.
 */
function addTechniqueBuffs(
    session: NetSession,
    battle: any,
    avatarId: number,
    avatarIndex: number,
    rosterLength: number,
): void {
    const profileAvatar = session.data.getDataJson().avatar(avatarId);
    if (!profileAvatar || (profileAvatar.techniques ?? []).length === 0) return;

    const remap = TECHNIQUE_AVATAR_REMAP.find(([from]) => from === avatarId);
    const buffedAvatarId = remap ? remap[1] : avatarId;

    // Added IN ADDITION to a matched rule, whenever the buffed id is listed.
    if (IGNORE_TOUGHNESS_AVATAR_IDS.includes(buffedAvatarId)) {
        battle.buffList.push(
            battleBuff(IGNORE_TOUGHNESS_BUFF_ID, avatarIndex, skillIndexValues(0)),
        );
    }

    // First matching rule wins; the search order is the table's.
    const rule = TECHNIQUE_BUFF_RULES.find((entry) => entry.avatarId === buffedAvatarId);
    if (rule) {
        for (const buff of rule.buffs) {
            const dynamicValues: Record<string, number> = {};
            for (const [key, value] of buff.dynamicValues) dynamicValues[key] = value;
            battle.buffList.push(
                battleBuff(
                    buff.id,
                    buff.ownerIsAvatar ? avatarIndex : safeLeaderSlot(session, rosterLength),
                    dynamicValues,
                ),
            );
        }
        return;
    }

    battle.buffList.push(battleBuff(buffedAvatarId * 100 + 1, avatarIndex, skillIndexValues(0)));
}

/** §12.0.5.2 `addTriggerAttack` — exactly one buff, owned by the leader slot. */
function addTriggerAttack(session: NetSession, battle: any, rosterLength: number): void {
    battle.buffList.push(
        battleBuff(
            attackerBuffId(session, rosterLength),
            safeLeaderSlot(session, rosterLength),
            skillIndexValues(1),
        ),
    );
}

/**
 * `getAttackerBuffId()`: the leader's element picks the buff. The element is
 * design data; an id with no `AvatarConfig` row (a 0-filled slot, or an avatar the
 * roster holds but the table does not) is `Element.None` -> buff id 0, exactly as
 * in the reference.
 */
function attackerBuffId(session: NetSession, rosterLength: number): number {
    // Indexes the same array the battle was built from, with the same clamp.
    const roster = isFunMode(session)
        ? getFunModeAvatarIds(session)
        : selectedAvatarIds(session, ROSTER_SLOTS);
    const avatarId = Number(roster[safeLeaderSlot(session, rosterLength)] ?? 0);
    const element = session.config.getAvatar(avatarId)?.DamageType;
    const entry = ATTACKER_BUFF_BY_ELEMENT.find(([damageType]) => damageType === element);
    return entry ? entry[1] : NO_ATTACKER_BUFF;
}

/** §12.0.5.3 `addStageBlessings` — one buff per id, `owner_index` 0xFFFFFFFF. */
function addStageBlessings(battle: any, blessings: number[]): void {
    for (const blessing of blessings) {
        battle.buffList.push(battleBuff(Number(blessing), MAX_U32, skillIndexValues(0)));
    }
}

/**
 * §12.0.5.4 `addGlobalPassive` — depends on the avatars the account OWNS.
 *
 * DEVIATION: pearl-sr tests its boot-computed `Data.AllAvatars` list (the
 * `AvatarConfig` rows whose `AdventurePlayerID` matches); on this server the freesr
 * profile IS the owned-avatar list, so membership is a profile lookup.
 * `owner_index` is the literal 1 in both cases.
 */
function addGlobalPassive(session: NetSession, battle: any): void {
    const json = session.data.getDataJson();
    for (const [avatarId, buffId] of GLOBAL_PASSIVES) {
        if (!json.avatar(avatarId)) continue;
        battle.buffList.push(battleBuff(buffId, GLOBAL_PASSIVE_OWNER_INDEX, skillIndexValues(0)));
    }
}

/**
 * §12.0.5.5 `addStageInvasion` — a challenge-only regen buff, driven by
 * `Logic.Challenge().challengeStageID`. That id is 0 outside a challenge, so the
 * lookup normally misses and nothing is added — but note that this runs for the
 * NON-challenge battle too, exactly as in the reference.
 *
 * `ConfigManager.stageInvasionConfig` is keyed by `StageID`, so a duplicated row
 * collapses onto the last one — the same "last match wins" the Zig loop has
 * because it never breaks (hazard 5).
 */
function addStageInvasion(session: NetSession, battle: any, rosterLength: number): void {
    const stageId = challengeStageId(session);
    if (!stageId) return;

    const invasionId = Number(session.config.stageInvasionConfig.get(stageId)?.InvasionID ?? 0);
    if (!invasionId) return;

    battle.buffList.push(
        battleBuff(
            STAGE_INVASION_BUFF_BASE + invasionId,
            safeLeaderSlot(session, rosterLength),
            skillIndexValues(1),
        ),
    );
}

/** Inclusive `Zig a...b` range test. */
function inRange(value: number, [lo, hi]: [number, number]): boolean {
    return value >= lo && value <= hi;
}

/**
 * §12.0.2 `addBattleTargets` — the progress lists, attached only for the PF and AS
 * stage-id bands.
 *
 * `battle_target_info` is a map; protobufjs encodes a plain object whose keys are
 * the numeric map keys. The PF branch writes keys 1, 2, 3 and 5: Zig's `for (2..4)`
 * is half-open, so only 2 and 3 get empty lists and key 4 is absent.
 */
function addBattleTargets(session: NetSession, battle: any): void {
    const stageId = Number(battle.stageId ?? 0);
    const challengeMode_ = isChallengeMode(session);
    const firstNode = isFirstChallengeNode(session);

    if (PF_STAGE_ID_RANGES.some((range) => inRange(stageId, range))) {
        const headId = challengeMode_ ? PF_TARGET_HEAD_CHALLENGE_ID : PF_TARGET_HEAD_PLAIN_ID;
        // `!challengeMode || firstNode` -> progress 0, i.e. only a challenge on the
        // second node starts half-cleared.
        const progress = !challengeMode_ || firstNode ? 0 : PF_TARGET_NODE2_PROGRESS;
        battle.battleTargetInfo = {
            1: {
                battleTargetList: [
                    { id: headId, progress, totalProgress: PF_TARGET_TOTAL_PROGRESS },
                ],
            },
            2: { battleTargetList: [] },
            3: { battleTargetList: [] },
            5: {
                battleTargetList: PF_TARGET_TAIL_IDS.map((id) => ({
                    id,
                    progress: 0,
                    totalProgress: 0,
                })),
            },
        };
        return;
    }

    if (inRange(stageId, AS_STAGE_ID_RANGE)) {
        battle.battleTargetInfo = {
            1: {
                battleTargetList: [
                    { id: AS_TARGET_HEAD_ID, progress: AS_TARGET_HEAD_PROGRESS, totalProgress: 0 },
                ],
            },
        };
    }
    // Anything else keeps the map empty, as in the reference.
}

// ---- the two builders (§12.0.8) ---------------------------------------------

/**
 * `createBattleInfo(waveLen, stageId, roundsLimit)`.
 *
 * Every other field stays at its proto default, which is exactly what pearl-sr's
 * zero-initialised struct sends: `battle_event` and `battle_target_info` are
 * empty, `IMEKCMNFLDI` is false and the six obfuscated submessages are null. The
 * three repeated fields the builders append to must exist as arrays here (an empty
 * list encodes to nothing, so the bytes match the reference either way).
 */
function createBattleInfo(waveLen: number, stageId: number, roundsLimit: number): any {
    return {
        battleId: DEFAULT_BATTLE_ID,
        stageId,
        // `@mod(std.time.timestamp(), 0xFFFFFFFF)` — seconds-resolution wall clock.
        logicRandomSeed: Math.floor(Date.now() / 1000) % MAX_U32,
        roundsLimit,
        monsterWaveLength: waveLen,
        // Hard-coded 6 for every battle that reaches this function; the empty
        // challenge battle never does, so its world_level really is 0.
        worldLevel: BATTLE_WORLD_LEVEL,
        monsterWaveList: [],
        battleAvatarList: [],
        buffList: [],
    };
}

/**
 * `addMonsterWaves(waveConfigs, monsterLevel)`.
 *
 * Only `monster_param.level`, `monster_id` and `max_hp` are written;
 * `cur_hp`/`extra_info` stay unset and `battle_stage_id`/`battle_wave_id` stay 0 —
 * the wave index is implicit in the list position. `max_hp` is
 * `Logic.FunMode().GetHp()`, which is 0 outside fun mode, so monsters normally have
 * no HP at all and the client-side simulator supplies it.
 *
 * NOTE: this proto has no `wave_index` field on `SceneMonsterWave` (unlike
 * `loadFreeData.MonsterJson.toSceneMonsterWave`, which writes one and has it
 * silently dropped), and the parameter message is `SceneMonsterWaveParam`, not
 * `BattleMonsterParam`.
 */
function addMonsterWaves(battle: any, waves: BattleWave[], maxHp: number): void {
    for (const wave of waves) {
        battle.monsterWaveList.push({
            monsterParam: { level: wave.level },
            monsterList: wave.monsterIds.map((monsterId) => ({ monsterId, maxHp })),
        });
    }
}

/**
 * `commonBattleSetup` — the shared tail of both builders. Order matters: the buff
 * list is techniques (per avatar) → trigger attack → blessings → global passives →
 * stage invasion (§12.0.5).
 */
function commonBattleSetup(
    session: NetSession,
    battle: any,
    avatarIds: number[],
    waves: BattleWave[],
    blessings: number[],
): void {
    const rosterLength = avatarIds.length;
    let avatarIndex = 0;

    // A full scan per selected id: duplicates produce duplicate avatars, and each
    // one gets its own `avatarIndex` for the technique-buff owner index.
    for (const selectedId of avatarIds) {
        const avatar = createBattleAvatar(session, selectedId);
        if (!avatar) continue;
        addTechniqueBuffs(session, battle, selectedId, avatarIndex, rosterLength);
        battle.battleAvatarList.push(avatar);
        avatarIndex += 1;
    }

    addMonsterWaves(battle, waves, getFunModeHp(session));
    addTriggerAttack(session, battle, rosterLength);
    addStageBlessings(battle, blessings);
    addGlobalPassive(session, battle);
    addStageInvasion(session, battle, rosterLength);
    addBattleTargets(session, battle);
}

/** `BattleManager.createBattle()` — the non-challenge battle (§12.1–§12.4, §12.6). */
export function createBattle(session: NetSession, eventId = 0): any {
    const config = session.data.getDataJson().battle_config;
    const stage = eventId ? session.config.getStage(eventId) : undefined;
    const configuredWaves = stage ? stageWaves(stage).filter((wave) => wave.monsterIds.length) : [];
    const waves = configuredWaves.length ? configuredWaves : profileWaves(config);

    const battle = createBattleInfo(
        waves.length,
        configuredWaves.length ? eventId : Number(config?.stage_id ?? 0),
        Number(config?.cycle_count ?? DEFAULT_ROUNDS_LIMIT),
    );

    commonBattleSetup(
        session,
        battle,
        rosterIds(session),
        waves,
        // `config.json → battle_config.blessings` is a list of blessing ids;
        // §12.0.5.3 writes level 1 and `SkillIndex: 0` for each of them
        // regardless of what the profile's entry carries.
        (config?.blessings ?? []).map((blessing) => Number(blessing.id ?? 0)),
    );

    return battle;
}

/**
 * `ChallegeStageManager.createChallegeStage()` (sic — the Zig name) — the
 * `resources/StageConfig.json`-driven battle for §12.5's challenge branch and
 * §12.6.
 *
 * Two reference behaviours are reproduced deliberately:
 *
 *  1. the gate is `FoundStage()` (`challenge_stageID !== 0`), NOT `ChallengeMode()`
 *     — when it is false the result is a `SceneBattleInfo` with EVERY field at its
 *     default, `world_level: 0` included, because `createBattleInfo` is never
 *     called;
 *  2. the FIRST matching `StageID` wins (the Zig loop `break`s), unlike
 *     `addStageInvasion`'s last-match-wins.
 *
 * The roster is the battle global (§12.0.7), which the challenge module has
 * already overwritten with the challenge line-up by the time this runs — see
 * `manager/challenge_mgr.ts` `buildChallengeLineup`.
 */
export function createChallengeStage(session: NetSession): any {
    const stageId = challengeStageId(session);
    if (!stageId) return {};

    const stage = session.config.getStage(stageId);
    if (!stage) {
        // DEVIATION: pearl-sr returns `error.StageNotFound`, whose propagation
        // aborts the handler so the client receives NO reply at all (§12.0.8 (2),
        // hazard 4) — a stale challenge id then breaks SceneCastSkill and
        // GetCurBattleInfo as well, because both build this eagerly. A missing
        // StageConfig row is a data error, and leaving the client waiting forever is
        // worse than an empty battle, so the default SceneBattleInfo is returned and
        // the mismatch is logged.
        console.error(
            `[battle] challenge stage ${stageId} has no StageConfig row; returning an ` +
                'empty SceneBattleInfo instead of leaving the request unanswered',
        );
        return {};
    }

    const waves = stageWaves(stage);
    const battle = createBattleInfo(
        waves.length,
        Number(stage.StageID ?? 0),
        challengeMode(session) !== PURE_FICTION_MODE
            ? DEFAULT_ROUNDS_LIMIT
            : PURE_FICTION_ROUNDS_LIMIT,
    );

    commonBattleSetup(session, battle, rosterIds(session), waves, challengeBlessings(session));

    return battle;
}
