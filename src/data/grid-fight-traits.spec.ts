import {
    gridFightActiveTraits,
    gridFightRoleTraits,
    gridFightTraitGroup,
    gridFightTraitLayers,
    gridFightTraitTier,
    gridFightTraitsOfRole,
} from './grid-fight-traits';
import { gridFightShopPools } from './grid-fight-stages';

describe('GridFight trait data', () => {
    it('covers exactly the season-one shop pool', () => {
        expect(gridFightRoleTraits.size).toBe(77);
        const covered = gridFightShopPools.map(
            (pool) => pool.filter((roleId) => gridFightRoleTraits.has(roleId)).length,
        );
        expect(covered).toEqual([21, 15, 15, 15, 11]);
        expect(gridFightTraitsOfRole(1009)).toEqual([1003, 2008]);
        expect(gridFightTraitsOfRole(999999)).toEqual([]);
    });

    it('splits the 32 traits into the three id groups', () => {
        const traits = new Set<number>();
        for (const list of gridFightRoleTraits.values()) for (const traitId of list) traits.add(traitId);
        expect(traits.size).toBe(32);
        const groups = { 1: 0, 2: 0, 3: 0 };
        for (const traitId of traits) {
            const group = gridFightTraitGroup(traitId);
            expect(group).toBeDefined();
            groups[group as 1 | 2 | 3] += 1;
        }
        expect(groups).toEqual({ 1: 13, 2: 12, 3: 7 });
        expect(gridFightTraitGroup(4001)).toBeUndefined();
        expect(gridFightTraitGroup(999)).toBeUndefined();
    });

    it('counts the traits of the deployed roles, most frequent first', () => {
        const active = gridFightActiveTraits([1009, 1201, 1218]);
        expect(active.map((trait) => [trait.traitId, trait.count, trait.group])).toEqual([
            [2008, 2, 2],
            [1003, 1, 1],
            [1007, 1, 1],
            [1008, 1, 1],
            [2007, 1, 2],
            [2011, 1, 2],
        ]);
        expect(active[0].tier).toMatchObject({ layer: 2, quality: 'Copper', mazebuffId: 35200801 });
        expect(active[1].tier).toBeUndefined();
        expect(gridFightActiveTraits([])).toEqual([]);
    });

    it('resolves the trait tier from the layer thresholds', () => {
        expect(gridFightTraitLayers.size).toBe(32);
        expect(gridFightTraitLayers.get(1001)?.map((layer) => layer.layer)).toEqual([2, 4, 6]);
        expect(gridFightTraitLayers.get(3003)?.map((layer) => layer.layer)).toEqual([1]);
        expect(gridFightTraitTier(1001, 1)).toBeUndefined();
        expect(gridFightTraitTier(1001, 2)).toMatchObject({ layer: 2, quality: 'Copper' });
        expect(gridFightTraitTier(1001, 4)).toMatchObject({ layer: 4, quality: 'Silver' });
        expect(gridFightTraitTier(1001, 9)).toMatchObject({ layer: 6, quality: 'Gold' });
        expect(gridFightTraitTier(2008, 6)?.properties).toEqual([['ExtraDOTDamageAddedRatio1', 2]]);
        expect(gridFightTraitTier(3003, 1)).toMatchObject({ layer: 1, quality: 'Unique' });
        expect(gridFightTraitTier(999999, 10)).toBeUndefined();
    });

    it('counts a repeated role id only once and ignores unknown roles', () => {
        expect(gridFightActiveTraits([1009, 1009, 1201, 424242])).toEqual(gridFightActiveTraits([1009, 1201]));
        expect(gridFightActiveTraits([424242])).toEqual([]);
    });
});
