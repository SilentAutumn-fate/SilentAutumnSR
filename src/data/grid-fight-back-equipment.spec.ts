import {
    gridFightBackEquipment,
    gridFightBackEquipmentFor,
    gridFightBackEquipmentLevels,
    gridFightBackEquipmentOwners,
} from './grid-fight-back-equipment';

describe('grid-fight back equipment', () => {
    it('covers 33 back-row roles with five levels each', () => {
        expect(gridFightBackEquipmentLevels).toBe(5);
        expect(gridFightBackEquipmentOwners()).toHaveLength(33);
        expect([...gridFightBackEquipment.keys()]).toEqual(gridFightBackEquipmentOwners().slice().sort((a, b) => a - b));
        for (const entries of gridFightBackEquipment.values()) {
            expect(entries.map((entry) => entry.level)).toEqual([1, 2, 3, 4, 5]);
        }
    });

    it('keeps the official relic id and properties of a sample role', () => {
        expect(gridFightBackEquipmentFor(1003, 1)).toEqual({
            level: 1,
            equipmentId: 23000,
            ownerProperties: [['ExtraAllDamageTypeAddedRatio3', 0.06]],
            allMemberProperties: [],
        });
        expect(gridFightBackEquipmentFor(1003, 5)?.level).toBe(5);
        expect(gridFightBackEquipmentFor(1003, 5)?.equipmentId).toBeGreaterThanOrEqual(23000);
    });

    it('clamps the level and rejects roles that have no back equipment', () => {
        expect(gridFightBackEquipmentFor(1003, 0)?.level).toBe(1);
        expect(gridFightBackEquipmentFor(1003, 99)?.level).toBe(5);
        expect(gridFightBackEquipmentFor(1009)).toBeUndefined();
    });

    it('exposes properties of every level for at least one all-member bonus entry', () => {
        const entries = [...gridFightBackEquipment.values()].flat();
        const withTeamBonus = entries.filter((entry) => entry.allMemberProperties.length > 0);
        expect(withTeamBonus.length).toBeGreaterThan(0);
        expect(withTeamBonus[0].allMemberProperties[0][0]).toMatch(/^Extra/);
        for (const entry of withTeamBonus) {
            expect(entry.allMemberProperties.every(([, value]) => typeof value === 'number')).toBe(true);
        }
    });
});
