// 局内装备基础表：数据源 `GridFightEquipment`（上游 4.7 线 ExcelOutput 全表 148 行）。
//
// 来历与版本说明：
// - 4.6.54 客户端的同表镜像在 80962 字节处截断（只能抢救出 95 行，截止 35040103）；
//   本文件改用上游 `DimbreathBot/TurnBasedGameData` 的完整表，`gridFightEquipmentComplete = true`。
// - 4.7 线比 4.6.54 多出 `Radiant` 33 行、`FateEquip` 18 行、`Other` 1 行；类别名与枚举值对齐
//   `dump.cs` 的 `GridFightEquipCategory`（Basic=1 … Intrinsic=15）。
// - 只用于「能不能穿」的服务端判定；真正的属性加成要等战斗属性接线，见 docs/grid-fight.md §8。

export type GridFightEquipCategory =
  | 'Basic'
  | 'Craftable'
  | 'Emblem'
  | 'Crown'
  | 'TraitSpecial'
  | 'Artifacts'
  | 'Radiant'
  | 'Support'
  | 'Other'
  | 'Material'
  | 'Trash'
  | 'GoldTrash'
  | 'Hack'
  | 'FateEquip'
  | 'Intrinsic';

// `dump.cs` 的 `GridFightEquipDressType`：NotUnique=0 / Unique=1 / AllSlotEmpty=2 / Leader=3 /
// TraitOnly=4 / UniqueAndExclusiveTrait=5 / RoleOnly=6。
export type GridFightEquipDressRuleName =
  | 'NotUnique'
  | 'Unique'
  | 'AllSlotEmpty'
  | 'Leader'
  | 'TraitOnly'
  | 'UniqueAndExclusiveTrait'
  | 'RoleOnly';

// 表里实际出现的规则名（`NotUnique` 用 null 表示「无规则」）。
export type GridFightEquipDressRule =
  | 'DressRuleUnique'
  | 'DressRuleAllSlotEmpty'
  | 'DressRuleUniqueAndExclusiveTrait'
  | 'DressRuleTraitOnly'
  | 'DressRuleRoleOnly';

export const gridFightEquipmentComplete = true;

// 每个角色可穿戴的装备槽数 = GridFightConstCommon.GridFight_AvatarDressEquipNum。
export const gridFightEquipSlots = 3;

// `dump.cs` 的 `GridFightEquipCategory` 枚举值（后续报文/表 ID 使用）。
export const gridFightEquipCategoryIds: Readonly<Record<GridFightEquipCategory, number>> = {
  Basic: 1,
  Craftable: 2,
  Emblem: 3,
  Crown: 4,
  TraitSpecial: 5,
  Artifacts: 6,
  Radiant: 7,
  Support: 8,
  Other: 9,
  Material: 10,
  Trash: 11,
  GoldTrash: 12,
  Hack: 13,
  FateEquip: 14,
  Intrinsic: 15,
};

// `dump.cs` 的 `GridFightEquipDressType` 枚举值。
export const gridFightEquipDressRuleIds: Readonly<Record<GridFightEquipDressRuleName, number>> = {
  NotUnique: 0,
  Unique: 1,
  AllSlotEmpty: 2,
  Leader: 3,
  TraitOnly: 4,
  UniqueAndExclusiveTrait: 5,
  RoleOnly: 6,
};

// `dump.cs` 的 `GridFightEquipType`：Implants=1（本表只用到这一种）。
export const gridFightEquipTypeIds = { Implants: 1 } as const;

// `dump.cs` 的 `GridFightEquipFuncType`（装备功能）。
export type GridFightEquipFuncName =
  | 'None'
  | 'AvatarMaxNumberAdd'
  | 'Leader'
  | 'CraftableThiefGlove'
  | 'RadiantThiefGlove'
  | 'OriginEmblem'
  | 'ClassEmblem'
  | 'AddTraitLayer';

export const gridFightEquipFuncTypeIds: Readonly<Record<GridFightEquipFuncName, number>> = {
  None: 0,
  AvatarMaxNumberAdd: 2,
  Leader: 3,
  CraftableThiefGlove: 5,
  RadiantThiefGlove: 6,
  OriginEmblem: 10,
  ClassEmblem: 11,
  AddTraitLayer: 12,
};

export type GridFightEquipmentEntry = {
  category: GridFightEquipCategory;
  dressRule: GridFightEquipDressRule | null;
  dressRuleParams: readonly number[];
  equipType: 'Implants' | null;
  func: GridFightEquipFuncName;
  funcParams: readonly number[];
  properties: ReadonlyArray<readonly [string, number]>;
};

// [equipmentId, category, dressRule, dressRuleParams, equipType, func, funcParams, properties]
const rows: ReadonlyArray<readonly [number, GridFightEquipCategory, GridFightEquipDressRule | null, readonly number[], 'Implants' | null, GridFightEquipFuncName, readonly number[], ReadonlyArray<readonly [string, number]>]> = [
  [350201, 'Basic', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.05]]],
  [350202, 'Basic', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.1]]],
  [350203, 'Basic', null, [], null, 'None', [], [["ExtraBackPowerAddedRatio1",0.1]]],
  [350204, 'Basic', null, [], null, 'None', [], [["ExtraLuckChance",0.05]]],
  [350205, 'Basic', null, [], null, 'None', [], [["ExtraHPAddedRatio1",0.05]]],
  [350206, 'Basic', null, [], null, 'None', [], [["ExtraAllDamageReduce",0.05]]],
  [350207, 'Basic', null, [], null, 'None', [], [["StanceBreakAddedRatio",0.1]]],
  [350208, 'Basic', null, [], null, 'None', [], [["ExtraInitSP",15]]],
  [350601, 'Material', null, [], null, 'None', [], []],
  [350602, 'Material', null, [], null, 'None', [], []],
  [350701, 'Crown', null, [], null, 'AvatarMaxNumberAdd', [1], []],
  [352101, 'Trash', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.03],["ExtraSpeedAddedRatio1",0.03],["ExtraAllDamageTypeAddedRatio1",0.03],["ExtraBackPowerAddedRatio1",0.03],["ExtraLuckChance",0.03],["ExtraLuckDamage",0.03]]],
  [352201, 'GoldTrash', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraSpeedAddedRatio1",0.3],["ExtraAllDamageTypeAddedRatio1",0.3],["ExtraBackPowerAddedRatio1",0.3],["ExtraLuckChance",0.3],["ExtraLuckDamage",0.3]]],
  [352301, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3]]],
  [352302, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3]]],
  [352303, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3]]],
  [352304, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3]]],
  [352401, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.4]]],
  [352402, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'AddTraitLayer', [2012], [["ExtraFrontPowerAddedRatio1",0.4]]],
  [352404, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'AddTraitLayer', [1002], [["ExtraFrontPowerAddedRatio1",0.4]]],
  [352405, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.4]]],
  [352406, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.4]]],
  [352501, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.5]]],
  [352502, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'AddTraitLayer', [2012], [["ExtraFrontPowerAddedRatio1",0.5]]],
  [352503, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'AddTraitLayer', [1002], [["ExtraFrontPowerAddedRatio1",0.5]]],
  [352504, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.5]]],
  [352505, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.5]]],
  [352506, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.5]]],
  [352507, 'Hack', 'DressRuleRoleOnly', [1006,15061,15062,15063], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.99],["ExtraSpeedAddedRatio1",0.99],["ExtraAllDamageTypeAddedRatio1",0.99],["ExtraAllDamageReduce",0.99],["ExtraLuckChance",0.99],["ExtraLuckDamage",0.99]]],
  [352601, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraBackPowerAddedRatio1",0.3]]],
  [352602, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraBackPowerAddedRatio1",0.3]]],
  [352603, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraBackPowerAddedRatio1",0.3]]],
  [352604, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraAllDamageTypeAddedRatio1",0.2]]],
  [352605, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraSpeedAddedRatio1",0.3],["ExtraAllDamageTypeAddedRatio1",0.3],["ExtraBackPowerAddedRatio1",0.3],["ExtraLuckChance",0.3],["ExtraLuckDamage",0.3]]],
  [352606, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.99],["ExtraSpeedAddedRatio1",0.99],["ExtraAllDamageTypeAddedRatio1",0.99],["ExtraAllDamageReduce",0.99],["ExtraLuckChance",0.99],["ExtraLuckDamage",0.99]]],
  [352607, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraLuckChance",0.2]]],
  [352608, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.1],["ExtraBackPowerAddedRatio1",0.1]]],
  [352701, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraBackPowerAddedRatio1",0.3]]],
  [352702, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraBackPowerAddedRatio1",0.3]]],
  [352703, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraBackPowerAddedRatio1",0.3]]],
  [352704, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraAllDamageTypeAddedRatio1",0.2]]],
  [352705, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.99],["ExtraSpeedAddedRatio1",0.99],["ExtraAllDamageTypeAddedRatio1",0.99],["ExtraAllDamageReduce",0.99],["ExtraLuckChance",0.99],["ExtraLuckDamage",0.99]]],
  [352706, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.99],["ExtraSpeedAddedRatio1",0.99],["ExtraAllDamageTypeAddedRatio1",0.99],["ExtraAllDamageReduce",0.99],["ExtraLuckChance",0.99],["ExtraLuckDamage",0.99]]],
  [352801, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.6],["ExtraBackPowerAddedRatio1",0.6]]],
  [352802, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.6],["ExtraBackPowerAddedRatio1",0.6]]],
  [352803, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraFrontPowerAddedRatio1",0.6],["ExtraBackPowerAddedRatio1",0.6]]],
  [352804, 'FateEquip', null, [], 'Implants', 'None', [], [["ExtraAllDamageTypeAddedRatio1",0.4]]],
  [352901, 'Other', null, [], null, 'None', [], []],
  [35030101, 'Craftable', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.2]]],
  [35030102, 'Craftable', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.1],["ExtraFrontPowerAddedRatio1",0.2],["ExtraBackPowerAddedRatio1",0.2]]],
  [35030103, 'Craftable', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.2],["ExtraBackPowerAddedRatio1",0.3]]],
  [35030104, 'Craftable', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.1],["ExtraLuckChance",0.1]]],
  [35030105, 'Craftable', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.1],["ExtraHPAddedRatio1",0.1],["ExtraAllDamageTypeAddedRatio1",0.15]]],
  [35030106, 'Craftable', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.15],["ExtraAllDamageReduce",0.1]]],
  [35030107, 'Craftable', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.1],["StanceBreakAddedRatio",0.25]]],
  [35030108, 'Craftable', 'DressRuleUnique', [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.25],["ExtraInitSP",30]]],
  [35030202, 'Craftable', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.6],["ExtraAllDamageTypeAddedRatio1",0.15]]],
  [35030203, 'Craftable', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.2],["ExtraBackPowerAddedRatio1",0.2]]],
  [35030204, 'Craftable', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraLuckChance",0.3]]],
  [35030205, 'Craftable', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraBackPowerAddedRatio1",0.3],["ExtraHPAddedRatio1",0.1]]],
  [35030206, 'Craftable', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraAllDamageReduce",0.1]]],
  [35030207, 'Craftable', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.4],["StanceBreakAddedRatio",0.25]]],
  [35030208, 'Craftable', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.2],["ExtraBackPowerAddedRatio1",0.2],["ExtraInitSP",20]]],
  [35030303, 'Craftable', null, [], null, 'None', [], [["ExtraBackPowerAddedRatio1",0.6],["ExtraAllDamageTypeAddedRatio1",0.15]]],
  [35030304, 'Craftable', null, [], null, 'None', [], [["ExtraBackPowerAddedRatio1",0.3],["ExtraLuckChance",0.3]]],
  [35030305, 'Craftable', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.2],["ExtraHPAddedRatio1",0.1],["ExtraBackPowerAddedRatio1",0.2]]],
  [35030306, 'Craftable', null, [], null, 'None', [], [["ExtraAllDamageReduce",0.1],["ExtraFrontPowerAddedRatio1",0.2],["ExtraBackPowerAddedRatio1",0.2]]],
  [35030307, 'Craftable', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.2],["ExtraBackPowerAddedRatio1",0.2],["StanceBreakAddedRatio",0.25],["ExtraSpeedAddedRatio1",0.1]]],
  [35030308, 'Craftable', 'DressRuleUnique', [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.3],["ExtraBackPowerAddedRatio1",0.3],["ExtraInitSP",20]]],
  [35030404, 'Craftable', 'DressRuleAllSlotEmpty', [], null, 'CraftableThiefGlove', [2,3], [["ExtraLuckChance",0.2],["ExtraAllDamageReduce",0.2]]],
  [35030405, 'Craftable', null, [], null, 'None', [], [["ExtraLuckChance",0.1],["ExtraHPAddedRatio1",0.1]]],
  [35030406, 'Craftable', null, [], null, 'None', [], [["ExtraLuckChance",0.2],["ExtraAllDamageReduce",0.1],["ExtraShieldAddedRatio",0.2]]],
  [35030407, 'Craftable', null, [], null, 'None', [], [["ExtraLuckChance",0.1],["StanceBreakAddedRatio",0.25]]],
  [35030408, 'Craftable', null, [], null, 'None', [], [["ExtraLuckChance",0.1],["ExtraInitSP",60]]],
  [35030505, 'Craftable', null, [], null, 'None', [], [["ExtraHPAddedRatio1",0.15],["ExtraHealAddedRatio",0.2]]],
  [35030506, 'Craftable', null, [], null, 'None', [], [["ExtraHPAddedRatio1",0.1],["ExtraHealAddedRatio",0.2],["ExtraShieldAddedRatio",0.2]]],
  [35030507, 'Craftable', null, [], null, 'None', [], [["ExtraHPAddedRatio1",0.1],["StanceBreakAddedRatio",0.25],["ExtraSpeedAddedRatio1",0.15]]],
  [35030508, 'Craftable', 'DressRuleUnique', [], null, 'None', [], [["ExtraHPAddedRatio1",0.15],["ExtraInitSP",20]]],
  [35030606, 'Craftable', null, [], null, 'None', [], [["ExtraAllDamageReduce",0.2]]],
  [35030607, 'Craftable', null, [], null, 'None', [], [["ExtraAllDamageReduce",0.1],["StanceBreakAddedRatio",0.1],["ExtraSpeedAddedRatio1",0.15]]],
  [35030608, 'Craftable', null, [], null, 'None', [], [["ExtraAllDamageReduce",0.1],["ExtraShieldAddedRatio",0.2],["ExtraInitSP",30]]],
  [35030707, 'Craftable', null, [], null, 'None', [], [["StanceBreakAddedRatio",0.5],["BreakDamageAddedRatioBase",2.5]]],
  [35030708, 'Craftable', null, [], null, 'None', [], [["StanceBreakAddedRatio",0.25],["ExtraInitSP",15]]],
  [35030808, 'Craftable', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.2],["ExtraBackPowerAddedRatio1",0.2]]],
  [35040101, 'Radiant', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.4]]],
  [35040102, 'Radiant', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.2],["ExtraFrontPowerAddedRatio1",0.4],["ExtraBackPowerAddedRatio1",0.4]]],
  [35040103, 'Radiant', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.4],["ExtraBackPowerAddedRatio1",0.6]]],
  [35040104, 'Radiant', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.2],["ExtraLuckChance",0.2]]],
  [35040105, 'Radiant', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.2],["ExtraHPAddedRatio1",0.2],["ExtraAllDamageTypeAddedRatio1",0.3]]],
  [35040106, 'Radiant', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.3],["ExtraAllDamageReduce",0.2]]],
  [35040107, 'Radiant', null, [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.2],["StanceBreakAddedRatio",0.5]]],
  [35040108, 'Radiant', 'DressRuleUnique', [], null, 'None', [], [["ExtraSpeedAddedRatio1",0.5],["ExtraInitSP",60]]],
  [35040202, 'Radiant', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",1.2],["ExtraAllDamageTypeAddedRatio1",0.3]]],
  [35040203, 'Radiant', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.4],["ExtraBackPowerAddedRatio1",0.4]]],
  [35040204, 'Radiant', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.6],["ExtraLuckChance",0.6]]],
  [35040205, 'Radiant', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.6],["ExtraBackPowerAddedRatio1",0.6],["ExtraHPAddedRatio1",0.2]]],
  [35040206, 'Radiant', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.6],["ExtraAllDamageReduce",0.2]]],
  [35040207, 'Radiant', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.8],["StanceBreakAddedRatio",0.5]]],
  [35040208, 'Radiant', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.4],["ExtraBackPowerAddedRatio1",0.4],["ExtraInitSP",40]]],
  [35040303, 'Radiant', null, [], null, 'None', [], [["ExtraBackPowerAddedRatio1",1.2],["ExtraAllDamageTypeAddedRatio1",0.3]]],
  [35040304, 'Radiant', null, [], null, 'None', [], [["ExtraBackPowerAddedRatio1",0.6],["ExtraLuckChance",0.6]]],
  [35040305, 'Radiant', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.4],["ExtraHPAddedRatio1",0.2],["ExtraBackPowerAddedRatio1",0.4]]],
  [35040306, 'Radiant', null, [], null, 'None', [], [["ExtraAllDamageReduce",0.2],["ExtraFrontPowerAddedRatio1",0.4],["ExtraBackPowerAddedRatio1",0.4]]],
  [35040307, 'Radiant', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.4],["ExtraBackPowerAddedRatio1",0.4],["StanceBreakAddedRatio",0.5],["ExtraSpeedAddedRatio1",0.2]]],
  [35040308, 'Radiant', 'DressRuleUnique', [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.6],["ExtraBackPowerAddedRatio1",0.6],["ExtraInitSP",40]]],
  [35040404, 'Radiant', 'DressRuleAllSlotEmpty', [], null, 'RadiantThiefGlove', [], [["ExtraLuckChance",0.4],["ExtraAllDamageReduce",0.4]]],
  [35040405, 'Radiant', null, [], null, 'None', [], [["ExtraLuckChance",0.2],["ExtraHPAddedRatio1",0.2]]],
  [35040406, 'Radiant', null, [], null, 'None', [], [["ExtraLuckChance",0.4],["ExtraAllDamageReduce",0.2],["ExtraShieldAddedRatio",0.4]]],
  [35040407, 'Radiant', null, [], null, 'None', [], [["ExtraLuckChance",0.2],["StanceBreakAddedRatio",0.5]]],
  [35040408, 'Radiant', null, [], null, 'None', [], [["ExtraLuckChance",0.2],["ExtraInitSP",120]]],
  [35040505, 'Radiant', null, [], null, 'None', [], [["ExtraHPAddedRatio1",0.3],["ExtraHealAddedRatio",0.4]]],
  [35040506, 'Radiant', null, [], null, 'None', [], [["ExtraHPAddedRatio1",0.2],["ExtraHealAddedRatio",0.4],["ExtraShieldAddedRatio",0.4]]],
  [35040507, 'Radiant', null, [], null, 'None', [], [["ExtraHPAddedRatio1",0.2],["StanceBreakAddedRatio",0.5],["ExtraSpeedAddedRatio1",0.3]]],
  [35040508, 'Radiant', 'DressRuleUnique', [], null, 'None', [], [["ExtraHPAddedRatio1",0.3],["ExtraInitSP",40]]],
  [35040606, 'Radiant', null, [], null, 'None', [], [["ExtraAllDamageReduce",0.4]]],
  [35040607, 'Radiant', null, [], null, 'None', [], [["ExtraAllDamageReduce",0.2],["StanceBreakAddedRatio",0.2],["ExtraSpeedAddedRatio1",0.3]]],
  [35040608, 'Radiant', null, [], null, 'None', [], [["ExtraAllDamageReduce",0.2],["ExtraShieldAddedRatio",0.4],["ExtraInitSP",60]]],
  [35040707, 'Radiant', null, [], null, 'None', [], [["StanceBreakAddedRatio",1],["BreakDamageAddedRatioBase",5]]],
  [35040708, 'Radiant', null, [], null, 'None', [], [["StanceBreakAddedRatio",0.5],["ExtraInitSP",30]]],
  [35040808, 'Radiant', null, [], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.4],["ExtraBackPowerAddedRatio1",0.4]]],
  [35051001, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [1001], null, 'OriginEmblem', [1001], [["ExtraSpeedAddedRatio1",0.1]]],
  [35051003, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [1003], null, 'OriginEmblem', [1003], [["ExtraInitSP",30]]],
  [35051005, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [1005], null, 'OriginEmblem', [1005], [["ExtraAllDamageReduce",0.1]]],
  [35051006, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [1006], null, 'OriginEmblem', [1006], [["StanceBreakAddedRatio",0.25]]],
  [35051007, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [1007], null, 'OriginEmblem', [1007], [["ExtraFrontPowerAddedRatio1",0.2]]],
  [35051008, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [1008], null, 'OriginEmblem', [1008], [["ExtraHPAddedRatio1",0.1]]],
  [35051010, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [1010], null, 'OriginEmblem', [1010], [["ExtraLuckChance",0.1]]],
  [35051011, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [1011], null, 'OriginEmblem', [1011], [["ExtraSpeedAddedRatio1",0.1]]],
  [35051012, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [1012], null, 'OriginEmblem', [1012], [["ExtraBackPowerAddedRatio1",0.2]]],
  [35051013, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [1013], null, 'OriginEmblem', [1013], [["ExtraAllDamageTypeAddedRatio1",0.1]]],
  [35052001, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2001], null, 'ClassEmblem', [2001], [["ExtraSpeedAddedRatio1",0.1]]],
  [35052002, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2002], null, 'ClassEmblem', [2002], [["StanceBreakAddedRatio",0.25],["BreakDamageAddedRatioBase",1.5]]],
  [35052003, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2003], null, 'ClassEmblem', [2003], [["ExtraLuckChance",0.1]]],
  [35052004, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2004], null, 'ClassEmblem', [2004], [["ExtraInitSP",30]]],
  [35052005, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2005], null, 'ClassEmblem', [2005], [["ExtraAllDamageReduce",0.1]]],
  [35052006, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2006], null, 'ClassEmblem', [2006], [["ExtraHPAddedRatio1",0.1]]],
  [35052007, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2007], null, 'ClassEmblem', [2007], [["ExtraBackPowerAddedRatio1",0.2]]],
  [35052008, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2008], null, 'ClassEmblem', [2008], [["ExtraSpeedAddedRatio1",0.1]]],
  [35052009, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2009], null, 'ClassEmblem', [2009], [["ExtraLuckChance",0.1]]],
  [35052010, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2010], null, 'ClassEmblem', [2010], [["ExtraAllDamageReduce",0.1]]],
  [35052011, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2011], null, 'ClassEmblem', [2011], [["ExtraFrontPowerAddedRatio1",0.2]]],
  [35052012, 'Emblem', 'DressRuleUniqueAndExclusiveTrait', [2012], null, 'ClassEmblem', [2012], [["ExtraAllDamageTypeAddedRatio1",0.1]]],
  [35100001, 'TraitSpecial', 'DressRuleTraitOnly', [1011], null, 'None', [], [["ExtraSpeedAddedRatio1",0.1],["StanceBreakAddedRatio",0.25]]],
  [35100002, 'TraitSpecial', 'DressRuleTraitOnly', [1011], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.2],["ExtraBackPowerAddedRatio1",0.2]]],
  [35100003, 'TraitSpecial', 'DressRuleTraitOnly', [1011], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.2],["ExtraBackPowerAddedRatio1",0.2],["StanceBreakAddedRatio",0.25],["ExtraSpeedAddedRatio1",0.1]]],
  [35100011, 'TraitSpecial', 'DressRuleTraitOnly', [1011], null, 'None', [], [["ExtraSpeedAddedRatio1",0.15],["StanceBreakAddedRatio",0.25]]],
  [35100012, 'TraitSpecial', 'DressRuleTraitOnly', [1011], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.4],["ExtraBackPowerAddedRatio1",0.4]]],
  [35100013, 'TraitSpecial', 'DressRuleTraitOnly', [1011], null, 'None', [], [["ExtraFrontPowerAddedRatio1",0.4],["ExtraBackPowerAddedRatio1",0.4],["StanceBreakAddedRatio",0.5],["ExtraSpeedAddedRatio1",0.2]]],
];

export const gridFightEquipment = new Map<number, GridFightEquipmentEntry>(
  rows.map(([id, category, dressRule, dressRuleParams, equipType, func, funcParams, properties]) => [
    id,
    { category, dressRule, dressRuleParams, equipType, func, funcParams, properties },
  ]),
);

export function gridFightEquipDressRule(equipmentId: number): GridFightEquipDressRule | null {
  return gridFightEquipment.get(equipmentId)?.dressRule ?? null;
}

export function gridFightEquipCategoryOf(equipmentId: number): GridFightEquipCategory | null {
  return gridFightEquipment.get(equipmentId)?.category ?? null;
}

export function gridFightEquipDressRuleId(equipmentId: number): number | null {
  const entry = gridFightEquipment.get(equipmentId);
  if (!entry) return null;
  return gridFightEquipDressRuleIds[entry.dressRule === null ? 'NotUnique' : entry.dressRule.slice('DressRule'.length) as GridFightEquipDressRuleName];
}

// 穿戴上下文：角色/羁绊/队伍里已穿的装备 id。
export type GridFightDressContext = {
  roleId?: number;
  roleTraits?: readonly number[];
  teamEquippedIds?: readonly number[];
};

function matchesTrait(params: readonly number[], roleTraits: readonly number[] | undefined): boolean {
  if (!params.length) return true;
  if (!roleTraits) return false;
  return params.some((trait) => roleTraits.includes(trait));
}

function matchesRole(params: readonly number[], roleId: number | undefined): boolean {
  if (!params.length) return true;
  if (roleId === undefined) return false;
  return params.includes(roleId);
}

// 穿戴可行性（纯规则判定，不涉及线上报文）：
// - 槽位上限 = GridFight_AvatarDressEquipNum（3）；
// - Unique / UniqueAndExclusiveTrait：同一件装备在队内不能重复出现（`teamEquippedIds`）；
// - AllSlotEmpty：只能穿在空槽角色身上；
// - RoleOnly：角色必须在 `DressRuleParamList` 里；TraitOnly：角色必须带参数里的羁绊；
// - Leader（表内 0 行）语义未验证，放行；
// - UniqueAndExclusiveTrait 的「exclusive」部分语义未实机验证，这里只强制唯一性，参数留档；
// - 表外装备按「未知」放行，不猜规则。
export function gridFightCanDress(
  equippedIds: readonly number[],
  equipmentId: number,
  context: GridFightDressContext = {},
): boolean {
  const slots = equippedIds.filter((id) => id > 0).length;
  if (slots >= gridFightEquipSlots) {
    return false;
  }
  const entry = gridFightEquipment.get(equipmentId);
  if (!entry) return true;
  const equippedElsewhere = (context.teamEquippedIds ?? []).includes(equipmentId);
  switch (entry.dressRule) {
    case 'DressRuleUnique':
    case 'DressRuleUniqueAndExclusiveTrait':
      return !equippedElsewhere && !equippedIds.includes(equipmentId);
    case 'DressRuleAllSlotEmpty':
      return equippedIds.every((id) => id <= 0);
    case 'DressRuleRoleOnly':
      return matchesRole(entry.dressRuleParams, context.roleId);
    case 'DressRuleTraitOnly':
      return matchesTrait(entry.dressRuleParams, context.roleTraits);
    default:
      return true;
  }
}

export function gridFightEquipFuncOf(equipmentId: number): GridFightEquipFuncName | null {
  return gridFightEquipment.get(equipmentId)?.func ?? null;
}

// 一组装备（同一角色的已穿槽位）叠加后的效果：
// - `avatarMaxNumberAdd`：`GridFightEquipFuncType.AvatarMaxNumberAdd`（皇冠 350701 参数 [1]）加的上阵人数；
// - `traitCounts`：徽章（OriginEmblem/ClassEmblem 参数=羁绊 id）与 `AddTraitLayer` 各给该羁绊 +1 层；
// - `properties`：`GeneralPropertyList` 按属性名累加，供后续战斗属性接线。
export type GridFightEquipmentEffects = {
  avatarMaxNumberAdd: number;
  traitCounts: ReadonlyMap<number, number>;
  properties: ReadonlyArray<{ property: string; value: number }>;
};

export function gridFightEquipmentEffects(equipmentIds: readonly number[]): GridFightEquipmentEffects {
  let avatarMaxNumberAdd = 0;
  const traitCounts = new Map<number, number>();
  const properties = new Map<string, number>();
  for (const equipmentId of equipmentIds) {
    const entry = gridFightEquipment.get(equipmentId);
    if (!entry) continue;
    for (const [property, value] of entry.properties) {
      properties.set(property, (properties.get(property) ?? 0) + value);
    }
    const param = entry.funcParams[0];
    if (param === undefined) continue;
    if (entry.func === 'AvatarMaxNumberAdd') {
      avatarMaxNumberAdd += param;
    } else if (entry.func === 'OriginEmblem' || entry.func === 'ClassEmblem' || entry.func === 'AddTraitLayer') {
      traitCounts.set(param, (traitCounts.get(param) ?? 0) + 1);
    }
  }
  return {
    avatarMaxNumberAdd,
    traitCounts,
    properties: [...properties.entries()].map(([property, value]) => ({ property, value })),
  };
}
