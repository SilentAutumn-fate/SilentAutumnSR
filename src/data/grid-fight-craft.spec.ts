import {
  gridFightCraftByMaterials,
  gridFightCraftByTarget,
  gridFightCraftRecipes,
  gridFightCraftUpgradeOf,
  gridFightEquipUpgrades,
  gridFightSeasonCraftIds,
} from './grid-fight-craft';

describe('grid-fight craft table', () => {
  it('keeps the upstream recipe table without duplicate craft ids', () => {
    expect(gridFightCraftRecipes).toHaveLength(57);
    const ids = gridFightCraftRecipes.map((recipe) => recipe.craftId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(gridFightCraftRecipes.every((recipe) => recipe.costIds.length === 2)).toBe(true);
    expect(gridFightCraftRecipes.find((recipe) => recipe.craftId === 1)).toEqual({
      craftId: 1,
      resultId: 35030101,
      costIds: [350201, 350201],
    });
  });

  it('separates the season craft subsets', () => {
    expect(gridFightSeasonCraftIds.get(1)).toHaveLength(57);
    expect(gridFightSeasonCraftIds.get(2)).toHaveLength(23);
    expect(gridFightSeasonCraftIds.get(2)).toContain(4);
    expect(gridFightSeasonCraftIds.get(2)).not.toContain(1);
  });

  it('resolves a recipe from the two materials, in any order', () => {
    expect(gridFightCraftByMaterials([350201, 350201])?.resultId).toBe(35030101);
    expect(gridFightCraftByMaterials([350201, 350202])?.resultId).toBe(35030102);
    expect(gridFightCraftByMaterials([350202, 350201])?.resultId).toBe(35030102);
    expect(gridFightCraftByMaterials([350201, 35040101])).toBeNull();
    expect(gridFightCraftByMaterials([350201])).toBeNull();
    expect(gridFightCraftByMaterials([])).toBeNull();
  });

  it('filters recipes by season when one is given', () => {
    expect(gridFightCraftByMaterials([350201, 350201], 1)?.resultId).toBe(35030101);
    expect(gridFightCraftByMaterials([350201, 350201], 2)).toBeNull();
  });

  it('matches an explicit target id against the material recipe', () => {
    expect(gridFightCraftByTarget(35030101, [350201, 350201])?.craftId).toBe(1);
    expect(gridFightCraftByTarget(35030102, [350201, 350201])).toBeNull();
    expect(gridFightCraftByTarget(35030102, [350201, 350202])?.craftId).toBe(2);
  });

  it('exposes the craftable to radiant upgrade table', () => {
    expect(gridFightEquipUpgrades.size).toBe(37);
    expect(gridFightCraftUpgradeOf(35030101)).toBe(35040101);
    expect(gridFightCraftUpgradeOf(350201)).toBeNull();
  });
});
