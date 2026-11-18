// 局外天赋树（`GridFightTalent` 13 行 + `GridFightSeasonTalent` 40 行，均为 4.7 线上游表）。
// 天赋用天赋点（`GridFight_TalentPointItemID = 281032`）解锁，`PreTalentIDList` 是前置、
// `Cost` 是单级消耗；本模块只保存静态结构，点数经济尚未建模（启用/重置按免费处理）。

export interface GridFightTalentDef {
    id: number;
    cost: number;
    pre: readonly number[];
    next: readonly number[];
    seasonId?: number;
}

export const gridFightPermanentTalents: readonly GridFightTalentDef[] = [
    { id: 1011, cost: 20, pre: [], next: [] },
    { id: 1021, cost: 20, pre: [1011], next: [] },
    { id: 1022, cost: 20, pre: [1011], next: [] },
    { id: 1031, cost: 60, pre: [1021, 1022], next: [] },
    { id: 1041, cost: 20, pre: [1031], next: [] },
    { id: 1042, cost: 20, pre: [1031], next: [] },
    { id: 1051, cost: 20, pre: [1031], next: [] },
    { id: 1061, cost: 60, pre: [1041], next: [] },
    { id: 1062, cost: 60, pre: [1042], next: [] },
    { id: 1071, cost: 20, pre: [1061], next: [] },
    { id: 1072, cost: 60, pre: [1051], next: [] },
    { id: 1073, cost: 20, pre: [1062], next: [] },
    { id: 1081, cost: 100, pre: [1071, 1072, 1073], next: [] },
];

export const gridFightSeasonTalents: readonly GridFightTalentDef[] = [
    { id: 2011, cost: 20, pre: [], next: [], seasonId: 1 },
    { id: 2021, cost: 20, pre: [2011], next: [], seasonId: 1 },
    { id: 2022, cost: 20, pre: [2011], next: [], seasonId: 1 },
    { id: 2031, cost: 20, pre: [2021], next: [], seasonId: 1 },
    { id: 2032, cost: 20, pre: [2011], next: [], seasonId: 1 },
    { id: 2033, cost: 20, pre: [2022], next: [], seasonId: 1 },
    { id: 2041, cost: 20, pre: [2031, 2042], next: [], seasonId: 1 },
    { id: 2042, cost: 20, pre: [2041, 2032, 2051], next: [], seasonId: 1 },
    { id: 2043, cost: 20, pre: [2044, 2032, 2051], next: [], seasonId: 1 },
    { id: 2044, cost: 20, pre: [2033, 2043], next: [], seasonId: 1 },
    { id: 2051, cost: 60, pre: [2042, 2043], next: [], seasonId: 1 },
    { id: 2061, cost: 60, pre: [2041], next: [], seasonId: 1 },
    { id: 2062, cost: 20, pre: [2051], next: [], seasonId: 1 },
    { id: 2063, cost: 60, pre: [2044], next: [], seasonId: 1 },
    { id: 3011, cost: 100, pre: [2061, 2062, 2063], next: [], seasonId: 1 },
    { id: 3021, cost: 20, pre: [3011], next: [], seasonId: 1 },
    { id: 3022, cost: 20, pre: [3011], next: [], seasonId: 1 },
    { id: 3031, cost: 20, pre: [3021], next: [], seasonId: 1 },
    { id: 3032, cost: 20, pre: [3011], next: [], seasonId: 1 },
    { id: 3033, cost: 20, pre: [3022], next: [], seasonId: 1 },
    { id: 3041, cost: 20, pre: [3031, 3042], next: [], seasonId: 1 },
    { id: 3042, cost: 20, pre: [3041, 3032, 3051], next: [], seasonId: 1 },
    { id: 3043, cost: 20, pre: [3044, 3032, 3051], next: [], seasonId: 1 },
    { id: 3044, cost: 20, pre: [3033, 3043], next: [], seasonId: 1 },
    { id: 3051, cost: 60, pre: [3042, 3043], next: [], seasonId: 1 },
    { id: 3061, cost: 60, pre: [3041], next: [], seasonId: 1 },
    { id: 3062, cost: 20, pre: [3051], next: [], seasonId: 1 },
    { id: 3063, cost: 60, pre: [3044], next: [], seasonId: 1 },
    { id: 4011, cost: 100, pre: [3061, 3062, 3063], next: [], seasonId: 1 },
    { id: 4021, cost: 20, pre: [4011], next: [], seasonId: 1 },
    { id: 4022, cost: 20, pre: [4011], next: [], seasonId: 1 },
    { id: 4031, cost: 60, pre: [4021, 4042], next: [], seasonId: 1 },
    { id: 4032, cost: 60, pre: [4022, 4042], next: [], seasonId: 1 },
    { id: 4041, cost: 20, pre: [4031], next: [], seasonId: 1 },
    { id: 4042, cost: 20, pre: [4031, 4032], next: [], seasonId: 1 },
    { id: 4043, cost: 20, pre: [4032], next: [], seasonId: 1 },
    { id: 4051, cost: 20, pre: [4041], next: [], seasonId: 1 },
    { id: 4052, cost: 60, pre: [4042], next: [], seasonId: 1 },
    { id: 4053, cost: 20, pre: [4043], next: [], seasonId: 1 },
    { id: 4061, cost: 100, pre: [4051, 4052, 4053], next: [], seasonId: 1 },
];

const permanentById = new Map(gridFightPermanentTalents.map((entry) => [entry.id, entry]));
const seasonById = new Map(gridFightSeasonTalents.map((entry) => [entry.id, entry]));

export function gridFightPermanentTalent(id: number): GridFightTalentDef | undefined {
    return permanentById.get(id);
}

export function gridFightSeasonTalent(id: number): GridFightTalentDef | undefined {
    return seasonById.get(id);
}

/** 前置天赋必须全部启用，才能启用这个天赋。 */
export function gridFightTalentUnlockable(def: GridFightTalentDef, enabled: readonly number[]): boolean {
    return def.pre.every((pre) => enabled.includes(pre));
}
