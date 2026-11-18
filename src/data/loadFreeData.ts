import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../common/constants';
import type { starrail } from '../proto/starrail';

/**
 * Loader for the daybreak/freesr "freesr-data.json" profile format.
 *
 * The exact same file format as KainSR: a full account snapshot exported by the
 * freesr config tool, describing every owned lightcone, relic and avatar plus a
 * free-form battle_config for the test battle entry points.
 *
 *   {
 *     "avatars":      { "<avatar_id>": { owner_uid, avatar_id, data: { rank, skills }, level, promotion, techniques, sp_value, sp_max } },
 *     "relics":       [ { level, relic_id, relic_set_id, main_affix_id, sub_affixes, internal_uid, equip_avatar } ],
 *     "lightcones":   [ { level, item_id, equip_avatar, rank, promotion, internal_uid } ],
 *     "battle_config":{ battle_type, blessings, custom_stats, cycle_count, stage_id, path_resonance_id, monsters }
 *   }
 */

export type SubAffixJson = {
    sub_affix_id: number;
    count: number;
    step: number;
};

export type DynamicKeyJson = {
    key: string;
    value: number;
};

export class RelicJson {
    constructor(
        public level: number,
        public relic_id: number,
        public relic_set_id: number,
        public main_affix_id: number,
        public sub_affixes: SubAffixJson[],
        public internal_uid: number,
        public equip_avatar: number,
    ) {}

    public static fromJson(json: any): RelicJson {
        return new RelicJson(
            json.level,
            json.relic_id,
            json.relic_set_id,
            json.main_affix_id,
            json.sub_affixes ?? [],
            json.internal_uid,
            json.equip_avatar,
        );
    }

    /** Unique id handed to the client for a relic in the avatar/inventory view. */
    public get uniqueId(): number {
        return 1 + this.internal_uid;
    }

    public toRelicProto(): starrail.Relic {
        return {
            // This proto revision names these fields `tid` / `dressAvatarId`;
            // it has no `id` / `charId`, which would be dropped silently.
            uniqueId: this.uniqueId,
            tid: this.relic_id,
            dressAvatarId: this.equip_avatar,
            exp: 0,
            isProtected: false,
            level: this.level,
            mainAffixId: this.main_affix_id,
            subAffixList: this.sub_affixes.map((v) => ({
                affixId: v.sub_affix_id,
                cnt: v.count,
                step: v.step,
            })),
        };
    }

    public toBattleRelicProto(): starrail.BattleRelic {
        return {
            id: this.relic_id,
            level: this.level,
            mainAffixId: this.main_affix_id,
            uniqueId: this.uniqueId,
            subAffixList: this.sub_affixes.map((v) => ({
                affixId: v.sub_affix_id,
                cnt: v.count,
                step: v.step,
            })),
        };
    }

    /** Relic slot is encoded in the last digit of the relic id. */
    public toEquipRelicProto(): starrail.EquipRelic {
        return {
            // `type` is the slot field in this revision (not `slot`).
            type: this.relic_id % 10,
            relicUniqueId: this.uniqueId,
        };
    }
}

export class LightconeJson {
    constructor(
        public level: number,
        public item_id: number,
        public equip_avatar: number,
        public rank: number,
        public promotion: number,
        public internal_uid: number,
    ) {}

    public static fromJson(json: any): LightconeJson {
        return new LightconeJson(
            json.level,
            json.item_id,
            json.equip_avatar,
            json.rank,
            json.promotion,
            json.internal_uid,
        );
    }

    public get uniqueId(): number {
        return 2000 + this.internal_uid;
    }

    public toEquipmentProto(): starrail.Equipment {
        return {
            // See the note on RelicJson.toRelicProto: `tid` / `dressAvatarId`.
            uniqueId: this.uniqueId,
            tid: this.item_id,
            dressAvatarId: this.equip_avatar,
            exp: 0,
            isProtected: false,
            level: this.level,
            promotion: this.promotion,
            rank: this.rank,
        };
    }

    public toBattleEquipmentProto(): starrail.BattleEquipment {
        return {
            id: this.item_id,
            level: this.level,
            promotion: this.promotion,
            rank: this.rank,
        };
    }
}

export type AvatarDataJson = {
    rank: number;
    skills: { [pointId: string]: number };
};

export class AvatarJson {
    constructor(
        public owner_uid: number,
        public avatar_id: number,
        public data: AvatarDataJson,
        public level: number,
        public promotion: number,
        public techniques: number[],
        public sp_value: number,
        public sp_max: number,
    ) {}

    public static fromJson(json: any): AvatarJson {
        return new AvatarJson(
            json.owner_uid ?? 0,
            json.avatar_id,
            { rank: json.data?.rank ?? 0, skills: json.data?.skills ?? {} },
            json.level,
            json.promotion,
            json.techniques ?? [],
            json.sp_value ?? 10000,
            json.sp_max ?? 10000,
        );
    }

    private skilltreeList(): starrail.AvatarSkillTree[] {
        return Object.entries(this.data.skills).map(([pointId, level]) => ({
            pointId: Number(pointId),
            level: Number(level),
        }));
    }

    /**
     * The `Avatar` message in this revision carries only level/promotion/exp and
     * the ids — it has NO `rank`, `skilltreeList` or `equipRelicList`. Those live
     * in `AvatarPathData`, which is sent alongside in
     * `GetAvatarDataScRsp.avatarPathDataInfoList`; build it with
     * `toAvatarPathDataProto()`.
     */
    public toAvatarProto(lightcone?: LightconeJson): starrail.Avatar {
        return {
            baseAvatarId: this.avatar_id,
            exp: 0,
            level: this.level,
            promotion: this.promotion,
            equipmentUniqueId: lightcone ? lightcone.uniqueId : 0,
        };
    }

    /** Rank, skill tree and equipped relics for the character screen. */
    public toAvatarPathDataProto(
        lightcone?: LightconeJson,
        relics: RelicJson[] = [],
    ): starrail.AvatarPathData {
        return {
            avatarId: this.avatar_id,
            rank: this.data.rank,
            pathEquipmentId: lightcone ? lightcone.uniqueId : 0,
            equipRelicList: relics.map((r) => r.toEquipRelicProto()),
            avatarPathSkillTree: Object.entries(this.data.skills).map(([pointId, level]) => ({
                pointId: Number(pointId),
                level: Number(level),
            })),
            dressedSkinId: 0,
            unlockTimestamp: 0,
            unkEnhancedId: 0,
        };
    }

    /** Avatar as handed to the battle simulator, plus its technique buffs. */
    public toBattleAvatarProto(
        index: number,
        lightcone?: LightconeJson,
        relics: RelicJson[] = [],
    ): [starrail.BattleAvatar, starrail.BattleBuff[]] {
        const battleAvatar: starrail.BattleAvatar = {
            index,
            avatarType: 1, // AVATAR_FORMAL_TYPE
            id: this.avatar_id,
            level: this.level,
            rank: this.data.rank,
            skilltreeList: this.skilltreeList(),
            equipmentList: lightcone ? [lightcone.toBattleEquipmentProto()] : [],
            hp: 10000,
            promotion: this.promotion,
            relicList: relics.map((r) => r.toBattleRelicProto()),
            worldLevel: 6,
            // SpBarInfo uses curSp/maxSp, not spCur/spNeed.
            spBar: { curSp: this.sp_value || 10000, maxSp: this.sp_max || 10000 },
        };

        const buffs = this.techniques.map(
            (buffId): starrail.BattleBuff => ({
                waveFlag: 0xffffffff,
                ownerIndex: index,
                level: 1,
                id: buffId,
            }),
        );

        return [battleAvatar, buffs];
    }

    public toLineupAvatarProto(slot: number): starrail.LineupAvatar {
        return {
            id: this.avatar_id,
            hp: 10000,
            satiety: 100,
            avatarType: 1,
            // SpBarInfo uses curSp/maxSp, not spCur/spNeed.
            spBar: { curSp: this.sp_value || 10000, maxSp: this.sp_max || 10000 },
            slot,
        };
    }
}

export class MonsterJson {
    constructor(
        public monster_id: number,
        public level: number,
        public amount: number,
    ) {}

    public static fromJson(json: any): MonsterJson {
        return new MonsterJson(json.monster_id, json.level, json.amount ?? 1);
    }

    /**
     * NOTE: this proto names the type SceneMonster (not SceneMonsterData) and
     * SceneMonsterWave.monster_param (not monster_wave_param).
     */
    public toSceneMonster(): starrail.SceneMonster {
        return { monsterId: this.monster_id, maxHp: 0, curHp: 0 };
    }

    public static toSceneMonsterWave(
        waveIndex: number,
        monsters: MonsterJson[],
    ): starrail.SceneMonsterWave {
        return {
            waveIndex: waveIndex < 1 ? waveIndex + 1 : waveIndex,
            monsterParam: {
                level: monsters.reduce((max, m) => Math.max(max, m.level), 0),
            },
            monsterList: monsters.map((m) => m.toSceneMonster()),
        };
    }

    public static toSceneMonsterWaves(monsters: MonsterJson[][]): starrail.SceneMonsterWave[] {
        return monsters.map((wave, index) => MonsterJson.toSceneMonsterWave(index + 1, wave));
    }
}

export class BattleBuffJson {
    constructor(
        public level: number,
        public id: number,
        public dynamic_key?: DynamicKeyJson,
    ) {}

    public static fromJson(json: any): BattleBuffJson {
        return new BattleBuffJson(json.level, json.id, json.dynamic_key);
    }

    public toBattleBuffProto(): starrail.BattleBuff {
        return {
            id: this.id,
            level: this.level,
            waveFlag: 0xffffffff,
            ownerIndex: 0xffffffff,
            dynamicValues: this.dynamic_key
                ? { [this.dynamic_key.key]: this.dynamic_key.value }
                : {},
        };
    }
}

/** Battle kinds the freesr editor can export. */
export enum BattleTypeJson {
    Default = 0,
    MOC = 1,
    PF = 2,
    SU = 3,
    AS = 4,
}

export class BattleConfigJson {
    constructor(
        public battle_type: string,
        public blessings: BattleBuffJson[],
        public custom_stats: SubAffixJson[],
        public cycle_count: number,
        public stage_id: number,
        public path_resonance_id: number,
        public monsters: MonsterJson[][],
    ) {}

    public static fromJson(json: any): BattleConfigJson {
        return new BattleConfigJson(
            json?.battle_type ?? 'Default',
            (json?.blessings ?? []).map(BattleBuffJson.fromJson),
            json?.custom_stats ?? [],
            json?.cycle_count ?? 30,
            json?.stage_id ?? 0,
            json?.path_resonance_id ?? 0,
            (json?.monsters ?? []).map((wave: any[]) => wave.map(MonsterJson.fromJson)),
        );
    }
}

export class JsonData {
    public lightcones: LightconeJson[] = [];
    public relics: RelicJson[] = [];
    public avatars: { [key: string]: AvatarJson } = {};
    public battle_config: BattleConfigJson = BattleConfigJson.fromJson({});

    public loadFromObject(jsonData: any): JsonData {
        this.lightcones = (jsonData.lightcones ?? []).map(LightconeJson.fromJson);
        this.relics = (jsonData.relics ?? []).map(RelicJson.fromJson);
        this.avatars = Object.fromEntries(
            Object.entries(jsonData.avatars ?? {}).map(([key, value]) => [
                key,
                AvatarJson.fromJson(value),
            ]),
        );
        this.battle_config = BattleConfigJson.fromJson(jsonData.battle_config ?? {});
        return this;
    }

    public async loadJson(filePath: string): Promise<JsonData> {
        const fileContent = await fs.promises.readFile(filePath, 'utf-8');
        return this.loadFromObject(JSON.parse(fileContent));
    }

    /** Relics equipped by one avatar, ordered by slot. */
    public relicsOf(avatarId: number): RelicJson[] {
        return this.relics
            .filter((r) => r.equip_avatar === avatarId)
            .sort((a, b) => (a.relic_id % 10) - (b.relic_id % 10));
    }

    public lightconeOf(avatarId: number): LightconeJson | undefined {
        return this.lightcones.find((l) => l.equip_avatar === avatarId);
    }

    public avatar(id: number): AvatarJson | undefined {
        return this.avatars[String(id)];
    }

    /** Avatar ids present in the profile, numerically ordered. */
    public avatarIds(): number[] {
        return Object.values(this.avatars)
            .map((a) => a.avatar_id)
            .sort((a, b) => a - b);
    }
}

export function resolveDataPath(...parts: string[]): string {
    return path.join(DATA_DIR, ...parts);
}
