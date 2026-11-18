import {
  gridFightCanDress,
  gridFightEquipCategoryIds,
  gridFightEquipCategoryOf,
  gridFightEquipDressRule,
  gridFightEquipDressRuleId,
  gridFightEquipDressRuleIds,
  gridFightEquipFuncOf,
  gridFightEquipFuncTypeIds,
  gridFightEquipSlots,
  gridFightEquipment,
  gridFightEquipmentComplete,
  gridFightEquipmentEffects,
} from './grid-fight-equipment';

describe('grid-fight equipment table', () => {
  it('keeps the full upstream table without duplicate ids', () => {
    expect(gridFightEquipment.size).toBe(148);
    expect(gridFightEquipmentComplete).toBe(true);
    const ids = [...gridFightEquipment.keys()];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes the three dress slots declared by the ConstCommon table', () => {
    expect(gridFightEquipSlots).toBe(3);
  });

  it('covers every category carried by the client table', () => {
    const categories = new Set([...gridFightEquipment.values()].map((row) => row.category));
    expect([...categories].sort()).toEqual([
      'Basic',
      'Craftable',
      'Crown',
      'Emblem',
      'FateEquip',
      'GoldTrash',
      'Hack',
      'Material',
      'Other',
      'Radiant',
      'TraitSpecial',
      'Trash',
    ]);
  });

  it('maps category and dress rule names onto the client enum values', () => {
    expect(gridFightEquipCategoryIds.Basic).toBe(1);
    expect(gridFightEquipCategoryIds.Emblem).toBe(3);
    expect(gridFightEquipCategoryIds.Hack).toBe(13);
    expect(gridFightEquipCategoryIds.FateEquip).toBe(14);
    expect(gridFightEquipCategoryIds.Intrinsic).toBe(15);
    expect(gridFightEquipDressRuleIds.NotUnique).toBe(0);
    expect(gridFightEquipDressRuleIds.Unique).toBe(1);
    expect(gridFightEquipDressRuleIds.UniqueAndExclusiveTrait).toBe(5);
    expect(gridFightEquipDressRuleIds.RoleOnly).toBe(6);
    expect(gridFightEquipDressRuleId(352101)).toBe(0);
    expect(gridFightEquipDressRuleId(35030108)).toBe(1);
    expect(gridFightEquipDressRuleId(35052007)).toBe(5);
    expect(gridFightEquipDressRuleId(352301)).toBe(6);
    expect(gridFightEquipDressRuleId(99999999)).toBeNull();
  });

  it('reads the dress rule, category and parameters of the sampled equipment', () => {
    expect(gridFightEquipCategoryOf(35052007)).toBe('Emblem');
    expect(gridFightEquipDressRule(35052007)).toBe('DressRuleUniqueAndExclusiveTrait');
    expect(gridFightEquipment.get(35052007)?.dressRuleParams).toEqual([2007]);
    expect(gridFightEquipCategoryOf(352101)).toBe('Trash');
    expect(gridFightEquipDressRule(352101)).toBeNull();
    expect(gridFightEquipCategoryOf(352201)).toBe('GoldTrash');
    expect(gridFightEquipCategoryOf(352301)).toBe('Hack');
    expect(gridFightEquipDressRule(352301)).toBe('DressRuleRoleOnly');
    expect(gridFightEquipment.get(352301)?.dressRuleParams).toEqual([1006, 15061, 15062, 15063]);
    expect(gridFightEquipment.get(352301)?.equipType).toBe('Implants');
    expect(gridFightEquipCategoryOf(35030101)).toBe('Craftable');
    expect(gridFightEquipDressRule(35030108)).toBe('DressRuleUnique');
    expect(gridFightEquipDressRule(35030404)).toBe('DressRuleAllSlotEmpty');
    expect(gridFightEquipCategoryOf(35040101)).toBe('Radiant');
  });

  it('treats equipment outside the table as unknown instead of guessing', () => {
    expect(gridFightEquipCategoryOf(1)).toBeNull();
    expect(gridFightEquipDressRule(99999999)).toBeNull();
  });

  it('judges dressability by the slot cap and the unique rules', () => {
    expect(gridFightCanDress([], 35030101)).toBe(true);
    expect(gridFightCanDress([35030101, 35030102], 35030103)).toBe(true);
    expect(gridFightCanDress([35030101, 35030102, 35030103], 35030104)).toBe(false);
    expect(gridFightCanDress([35030108], 35030108)).toBe(false);
    expect(gridFightCanDress([35052007], 35052007)).toBe(false);
    expect(gridFightCanDress([35030101], 35052007)).toBe(true);
    expect(gridFightCanDress([35030101], 35030108, { teamEquippedIds: [35030108] })).toBe(false);
    expect(gridFightCanDress([35030101, 35030102], 99999999)).toBe(true);
  });

  it('enforces the role, trait and empty-slot dress rules when context is given', () => {
    // RoleOnly：352301 只能给 1006 / 15061 / 15062 / 15063
    expect(gridFightCanDress([], 352301, { roleId: 1006 })).toBe(true);
    expect(gridFightCanDress([], 352301, { roleId: 15062 })).toBe(true);
    expect(gridFightCanDress([], 352301, { roleId: 1001 })).toBe(false);
    expect(gridFightCanDress([], 352301)).toBe(false);
    // TraitOnly：35100001 要求角色带羁绊 1011
    expect(gridFightCanDress([], 35100001, { roleTraits: [1011, 2001] })).toBe(true);
    expect(gridFightCanDress([], 35100001, { roleTraits: [1001] })).toBe(false);
    expect(gridFightCanDress([], 35100001)).toBe(false);
    // AllSlotEmpty：35030404 只能穿在空槽角色上
    expect(gridFightCanDress([], 35030404)).toBe(true);
    expect(gridFightCanDress([35030101], 35030404)).toBe(false);
    // UniqueAndExclusiveTrait：35052007 只强制队内唯一，不强制羁绊
    expect(gridFightCanDress([], 35052007, { roleTraits: [] })).toBe(true);
  });

  it('aggregates equipment properties, avatar slots and emblem traits', () => {
    expect(gridFightEquipFuncTypeIds.AddTraitLayer).toBe(12);
    expect(gridFightEquipFuncOf(350701)).toBe('AvatarMaxNumberAdd');
    expect(gridFightEquipFuncOf(35051001)).toBe('OriginEmblem');
    expect(gridFightEquipFuncOf(35052001)).toBe('ClassEmblem');
    expect(gridFightEquipFuncOf(352402)).toBe('AddTraitLayer');
    expect(gridFightEquipFuncOf(350101)).toBeNull();
    // 属性按属性名累加：35052002 自带 0.25 击破 + 1.5 击破伤害
    expect(gridFightEquipmentEffects([350201])).toMatchObject({
      avatarMaxNumberAdd: 0,
      properties: [{ property: 'ExtraSpeedAddedRatio1', value: 0.05 }],
    });
    expect(gridFightEquipmentEffects([35052002, 35052002]).properties).toEqual([
      { property: 'StanceBreakAddedRatio', value: 0.5 },
      { property: 'BreakDamageAddedRatioBase', value: 3 },
    ]);
    // 皇冠给一个额外上阵位
    expect(gridFightEquipmentEffects([350701, 350701]).avatarMaxNumberAdd).toBe(2);
    // 徽章与 AddTraitLayer 各给羁绊 +1 层
    const emblems = gridFightEquipmentEffects([35051001, 35052001, 352402, 352402]);
    expect([...emblems.traitCounts.entries()].sort()).toEqual([[1001, 1], [2001, 1], [2012, 2]]);
    // 表外装备不产生效果
    expect(gridFightEquipmentEffects([1, 99999999])).toMatchObject({ avatarMaxNumberAdd: 0, properties: [] });
  });
});
