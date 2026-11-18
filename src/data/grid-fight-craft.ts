// 局内装备合成表：数据源 `GridFightCraftConfig`（57 行，1–58 缺 40）、`GridFightSeasonCraft`
// （赛季 1 全量 57 条、赛季 2 只有 23 条子集）与 `GridFightEquipUpgrade`（37 行 Craftable → Radiant）。
// 这三张表来自上游 `DimbreathBot/TurnBasedGameData`（4.7 线），4.6.54 客户端镜像里没有。

export type GridFightCraftRecipe = {
  craftId: number;
  resultId: number;
  costIds: readonly number[];
};

export const gridFightCraftRecipes: readonly GridFightCraftRecipe[] = [
  { craftId: 1, resultId: 35030101, costIds: [350201,350201] },
  { craftId: 2, resultId: 35030102, costIds: [350202,350201] },
  { craftId: 3, resultId: 35030103, costIds: [350203,350201] },
  { craftId: 4, resultId: 35030104, costIds: [350204,350201] },
  { craftId: 5, resultId: 35030105, costIds: [350205,350201] },
  { craftId: 6, resultId: 35030106, costIds: [350206,350201] },
  { craftId: 7, resultId: 35030107, costIds: [350207,350201] },
  { craftId: 8, resultId: 35030108, costIds: [350208,350201] },
  { craftId: 9, resultId: 35030202, costIds: [350202,350202] },
  { craftId: 10, resultId: 35030203, costIds: [350203,350202] },
  { craftId: 11, resultId: 35030204, costIds: [350204,350202] },
  { craftId: 12, resultId: 35030205, costIds: [350205,350202] },
  { craftId: 13, resultId: 35030206, costIds: [350206,350202] },
  { craftId: 14, resultId: 35030207, costIds: [350207,350202] },
  { craftId: 15, resultId: 35030208, costIds: [350208,350202] },
  { craftId: 16, resultId: 35030303, costIds: [350203,350203] },
  { craftId: 17, resultId: 35030304, costIds: [350204,350203] },
  { craftId: 18, resultId: 35030305, costIds: [350205,350203] },
  { craftId: 19, resultId: 35030306, costIds: [350206,350203] },
  { craftId: 20, resultId: 35030307, costIds: [350207,350203] },
  { craftId: 21, resultId: 35030308, costIds: [350208,350203] },
  { craftId: 22, resultId: 35030404, costIds: [350204,350204] },
  { craftId: 23, resultId: 35030405, costIds: [350205,350204] },
  { craftId: 24, resultId: 35030406, costIds: [350206,350204] },
  { craftId: 25, resultId: 35030407, costIds: [350207,350204] },
  { craftId: 26, resultId: 35030408, costIds: [350208,350204] },
  { craftId: 27, resultId: 35030505, costIds: [350205,350205] },
  { craftId: 28, resultId: 35030506, costIds: [350206,350205] },
  { craftId: 29, resultId: 35030507, costIds: [350207,350205] },
  { craftId: 30, resultId: 35030508, costIds: [350208,350205] },
  { craftId: 31, resultId: 35030606, costIds: [350206,350206] },
  { craftId: 32, resultId: 35030607, costIds: [350207,350206] },
  { craftId: 33, resultId: 35030608, costIds: [350208,350206] },
  { craftId: 34, resultId: 35030707, costIds: [350207,350207] },
  { craftId: 35, resultId: 35030708, costIds: [350208,350207] },
  { craftId: 36, resultId: 35030808, costIds: [350208,350208] },
  { craftId: 37, resultId: 350701, costIds: [350601,350601] },
  { craftId: 38, resultId: 350701, costIds: [350601,350602] },
  { craftId: 39, resultId: 350701, costIds: [350602,350602] },
  { craftId: 41, resultId: 35051003, costIds: [350601,350208] },
  { craftId: 42, resultId: 35051005, costIds: [350601,350206] },
  { craftId: 43, resultId: 35051006, costIds: [350601,350207] },
  { craftId: 44, resultId: 35051007, costIds: [350601,350202] },
  { craftId: 45, resultId: 35051008, costIds: [350601,350205] },
  { craftId: 46, resultId: 35051010, costIds: [350601,350204] },
  { craftId: 47, resultId: 35051011, costIds: [350601,350201] },
  { craftId: 48, resultId: 35051012, costIds: [350601,350203] },
  { craftId: 49, resultId: 35052001, costIds: [350602,350201] },
  { craftId: 50, resultId: 35052002, costIds: [350602,350207] },
  { craftId: 51, resultId: 35052003, costIds: [350602,350204] },
  { craftId: 52, resultId: 35052004, costIds: [350602,350208] },
  { craftId: 53, resultId: 35052008, costIds: [350602,350206] },
  { craftId: 54, resultId: 35052006, costIds: [350602,350205] },
  { craftId: 55, resultId: 35052007, costIds: [350602,350203] },
  { craftId: 56, resultId: 35052011, costIds: [350602,350202] },
  { craftId: 57, resultId: 35052012, costIds: [350602,352101] },
  { craftId: 58, resultId: 35052012, costIds: [350601,352101] },
];

// 赛季 → 可用合成 id（`GridFightSeasonCraft`）。
export const gridFightSeasonCraftIds: ReadonlyMap<number, readonly number[]> = new Map([
  [1, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58]],
  [2, [4,7,10,11,13,17,18,21,22,23,25,27,28,29,31,32,33,34,35,36,37,38,39]],
]);

// `GridFightEquipUpgrade`：成装 → 强化件（如 35030101 → 35040101）。
export const gridFightEquipUpgrades: ReadonlyMap<number, number> = new Map([
  [352101, 352201],
  [35030101, 35040101],
  [35030102, 35040102],
  [35030103, 35040103],
  [35030104, 35040104],
  [35030105, 35040105],
  [35030106, 35040106],
  [35030107, 35040107],
  [35030108, 35040108],
  [35030202, 35040202],
  [35030203, 35040203],
  [35030204, 35040204],
  [35030205, 35040205],
  [35030206, 35040206],
  [35030207, 35040207],
  [35030208, 35040208],
  [35030303, 35040303],
  [35030304, 35040304],
  [35030305, 35040305],
  [35030306, 35040306],
  [35030307, 35040307],
  [35030308, 35040308],
  [35030404, 35040404],
  [35030405, 35040405],
  [35030406, 35040406],
  [35030407, 35040407],
  [35030408, 35040408],
  [35030505, 35040505],
  [35030506, 35040506],
  [35030507, 35040507],
  [35030508, 35040508],
  [35030606, 35040606],
  [35030607, 35040607],
  [35030608, 35040608],
  [35030707, 35040707],
  [35030708, 35040708],
  [35030808, 35040808],
]);

function sameMultiset(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const counts = new Map<number, number>();
  for (const id of left) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of right) {
    const left = counts.get(id) ?? 0;
    if (left === 0) return false;
    counts.set(id, left - 1);
  }
  return true;
}

// 用两个材料的装备 id 反查配方（`CostEquipList` 与材料清单多重集相同）。
// `seasonId` 给了就只在该赛季的子集里找；不给则不按赛季过滤（4.6.54 与 4.7 的赛季表未对齐，先放宽）。
export function gridFightCraftByMaterials(
  materialIds: readonly number[],
  seasonId?: number,
): GridFightCraftRecipe | null {
  const allowed = seasonId === undefined ? null : new Set(gridFightSeasonCraftIds.get(seasonId) ?? []);
  for (const recipe of gridFightCraftRecipes) {
    if (allowed && !allowed.has(recipe.craftId)) continue;
    if (sameMultiset(recipe.costIds, materialIds)) return recipe;
  }
  return null;
}

// 客户端的 `GridFightEquipCraftCsReq` 有三个候选 id 字段（proto 未去混淆），
// 这里允许「目标 id + 材料」的写法：目标必须等于配方的 `resultId`。
export function gridFightCraftByTarget(
  targetId: number,
  materialIds: readonly number[],
  seasonId?: number,
): GridFightCraftRecipe | null {
  const recipe = gridFightCraftByMaterials(materialIds, seasonId);
  if (!recipe) return null;
  return recipe.resultId === targetId ? recipe : null;
}

export function gridFightCraftUpgradeOf(equipmentId: number): number | null {
  return gridFightEquipUpgrades.get(equipmentId) ?? null;
}