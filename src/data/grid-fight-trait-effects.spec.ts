import {
    gridFightTraitAcceptsEffect,
    gridFightTraitEffectLayerParams,
    gridFightTraitEffectLayers,
    gridFightTraitEffectOf,
    gridFightTraitEffects,
    gridFightTraitInfo,
    gridFightTraitInfos,
} from './grid-fight-trait-effects';

describe('grid fight trait effects', () => {
    it('loads every trait effect with its per-layer parameters', () => {
        expect(gridFightTraitEffects).toHaveLength(24);
        expect(gridFightTraitEffectOf(10061)).toMatchObject({ type: 'TraitEffectByJson' });
        expect(gridFightTraitEffectOf(101311)).toMatchObject({ type: 'HolyGrailPray' });
        expect(gridFightTraitEffectLayers.get(10061)).toHaveLength(7);
        expect(gridFightTraitEffectLayerParams(10061, 1)).toEqual([1, 0.1, 0.2, 0.1, 0.1, 0.2, 0.1, 0.18, 15]);
        expect(gridFightTraitEffectLayerParams(10061, 6)).toEqual([2.5, 0.1, 0.2, 0.1, 0.1, 0.2, 0.1, 0.18, 15]);
        expect(gridFightTraitEffectLayerParams(10061, 99)).toBeUndefined();
        expect(gridFightTraitEffectLayerParams(999999, 1)).toBeUndefined();
    });

    it('keeps all 33 traits and every declared effect resolvable', () => {
        expect(gridFightTraitInfos.size).toBe(33);
        expect(gridFightTraitInfo(2012)).toMatchObject({ activation: 'GreaterEqualThan', effects: [20121] });
        expect(gridFightTraitInfo(3006)?.effects).toEqual([30061, 30062, 30063]);
        const withEffects = [...gridFightTraitInfos.values()].filter((trait) => trait.effects.length > 0);
        expect(withEffects).toHaveLength(17);
        for (const trait of withEffects) {
            for (const effectId of trait.effects) {
                expect(gridFightTraitEffectOf(effectId)).toBeDefined();
            }
        }
        expect(gridFightTraitInfo(9999)).toBeUndefined();
    });

    it('accepts only the effects a trait lists, plus zero to clear', () => {
        expect(gridFightTraitAcceptsEffect(3006, 30062)).toBe(true);
        expect(gridFightTraitAcceptsEffect(3006, 10021)).toBe(false);
        expect(gridFightTraitAcceptsEffect(2008, 0)).toBe(true);
        expect(gridFightTraitAcceptsEffect(2008, 10021)).toBe(false);
        expect(gridFightTraitAcceptsEffect(3006, 0)).toBe(true);
        expect(gridFightTraitAcceptsEffect(9999, 0)).toBe(false);
    });
});
