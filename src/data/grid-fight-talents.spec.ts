import {
    gridFightPermanentTalent,
    gridFightPermanentTalents,
    gridFightSeasonTalent,
    gridFightSeasonTalents,
    gridFightTalentUnlockable,
} from './grid-fight-talents';

describe('grid fight meta talents', () => {
    it('keeps the permanent and season talent trees separate', () => {
        expect(gridFightPermanentTalents).toHaveLength(13);
        expect(gridFightSeasonTalents).toHaveLength(40);
        // 两棵树是两套 id 空间，互不相交。
        const permanentIds = new Set(gridFightPermanentTalents.map((entry) => entry.id));
        expect(gridFightSeasonTalents.every((entry) => !permanentIds.has(entry.id))).toBe(true);
        expect(new Set(gridFightPermanentTalents.map((entry) => entry.id)).size).toBe(13);
        expect(new Set(gridFightSeasonTalents.map((entry) => entry.id)).size).toBe(40);
        expect(gridFightSeasonTalents.every((entry) => entry.seasonId === 1)).toBe(true);
    });

    it('resolves every prerequisite inside its own tree', () => {
        const permanentIds = new Set(gridFightPermanentTalents.map((entry) => entry.id));
        const seasonIds = new Set(gridFightSeasonTalents.map((entry) => entry.id));
        for (const entry of gridFightPermanentTalents) {
            expect(entry.pre.every((pre) => permanentIds.has(pre))).toBe(true);
        }
        for (const entry of gridFightSeasonTalents) {
            expect(entry.pre.every((pre) => seasonIds.has(pre))).toBe(true);
        }
        // 根节点没有前置，深层节点有。
        expect(gridFightPermanentTalent(1011)?.pre).toEqual([]);
        expect(gridFightPermanentTalent(1081)?.pre).toEqual([1071, 1072, 1073]);
        expect(gridFightSeasonTalent(2011)?.pre).toEqual([]);
        expect(gridFightSeasonTalent(2011)?.seasonId).toBe(1);
    });

    it('gates a child on all of its prerequisites', () => {
        const leaf = gridFightPermanentTalent(1081)!;
        expect(leaf.cost).toBe(100);
        expect(gridFightTalentUnlockable(leaf, [])).toBe(false);
        expect(gridFightTalentUnlockable(leaf, [1071, 1072])).toBe(false);
        expect(gridFightTalentUnlockable(leaf, [1071, 1072, 1073])).toBe(true);
        const root = gridFightPermanentTalent(1011)!;
        expect(root.cost).toBe(20);
        expect(gridFightTalentUnlockable(root, [])).toBe(true);
        // 表外 id 返回 undefined。
        expect(gridFightPermanentTalent(9999)).toBeUndefined();
        expect(gridFightSeasonTalent(9999)).toBeUndefined();
    });
});
