import {
    gridFightAvatarMaxNumber,
    gridFightLevelPropertyBonus,
    gridFightLevelUpExp,
} from './grid-fight-stages';

// GridFightLevelV2 is the in-run level table: level cap, deploy cap and the flat
// battle bonus every level grants. The three columns must stay aligned by index.
describe('grid fight in-run levels', () => {
    it('keeps the level curve, deploy cap and property bonus aligned per level', () => {
        expect(gridFightLevelUpExp).toHaveLength(10);
        expect(gridFightAvatarMaxNumber).toHaveLength(10);
        expect(gridFightLevelPropertyBonus).toHaveLength(10);

        // Level 10 is the cap: its LevelUpExp is 0 by construction.
        expect(gridFightLevelUpExp[9]).toBe(0);

        // Levels 1–3 grant nothing; 4–10 add +100 attack and +200 HP per level.
        expect(gridFightLevelPropertyBonus.slice(0, 3))
            .toEqual([{ attack: 0, hp: 0 }, { attack: 0, hp: 0 }, { attack: 0, hp: 0 }]);
        for (let level = 3; level < 10; level += 1) {
            expect(gridFightLevelPropertyBonus[level]).toEqual({
                attack: (level - 2) * 100,
                hp: (level - 2) * 200,
            });
        }

        // The deploy cap is the identity 1..10, so level N deploys N roles.
        expect(gridFightAvatarMaxNumber).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
});
