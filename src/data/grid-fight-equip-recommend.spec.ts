import { gridFightEquipCategoryOf } from './grid-fight-equipment';
import {
    gridFightEquipRecommendations,
    gridFightRecommendationForRole,
    gridFightRecommendRolesForEquip,
    gridFightRoleRecommendations,
    gridFightTraitEquipRelations,
    gridFightTraitEquipsFor,
} from './grid-fight-equip-recommend';
import { gridFightShopPools } from './grid-fight-stages';

describe('grid fight equipment recommendations', () => {
    it('covers every pool role and only recommends catalog equipment', () => {
        const poolRoles = new Set(gridFightShopPools.flat());
        expect(poolRoles.size).toBe(77);
        expect(gridFightRoleRecommendations.size).toBe(77);
        expect([...gridFightRoleRecommendations.keys()].every((roleId) => poolRoles.has(roleId))).toBe(true);
        for (const entry of gridFightRoleRecommendations.values()) {
            for (const equipmentId of [...entry.front, ...entry.back]) {
                expect(gridFightEquipCategoryOf(equipmentId)).not.toBeNull();
            }
        }
        // 前排推荐的并集与后排一致（1001/1003 这类角色两行内容相同）。
        const sample = gridFightRecommendationForRole(1001)!;
        expect(sample.front).toEqual(sample.back);
        expect(sample.front).toContain(35030203);
        expect(gridFightRecommendationForRole(999999)).toBeUndefined();
    });

    it('inverts equipment to recommended roles', () => {
        expect(gridFightEquipRecommendations.size).toBe(133);
        expect([...gridFightEquipRecommendations.keys()].every(
            (equipmentId) => gridFightEquipCategoryOf(equipmentId) !== null,
        )).toBe(true);
        const poolRoles = new Set(gridFightShopPools.flat());
        for (const roles of gridFightEquipRecommendations.values()) {
            expect(roles.every((roleId) => poolRoles.has(roleId))).toBe(true);
        }
        const roles = gridFightRecommendRolesForEquip(35030101);
        expect(roles).toHaveLength(6);
        expect(roles).toContain(1310);
        // 表外装备没有推荐角色，也不会抛错。
        expect(gridFightRecommendRolesForEquip(999999)).toEqual([]);
    });

    it('exposes the three trait to equipment relations', () => {
        expect(gridFightTraitEquipRelations.size).toBe(3);
        expect(gridFightTraitEquipsFor(35030107)).toEqual([35100001, 35100011]);
        expect(gridFightTraitEquipsFor(35030307)).toEqual([35100003, 35100013]);
        expect(gridFightTraitEquipsFor(350201)).toEqual([]);
    });
});
