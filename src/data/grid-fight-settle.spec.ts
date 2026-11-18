import {
    gridFightSeasonScoreRuleForRoute, gridFightSettleScore, gridFightSettleScoreAt, gridFightSettleScoreRules,
} from './grid-fight-settle';
import { gridFightSeasonTwoRoute } from './grid-fight-stages';

const rowsOf = (ruleId: number) => gridFightSettleScoreRules.get(ruleId)!;

it('keeps one settlement row per route node', () => {
    expect(rowsOf(1)).toHaveLength(23);
    expect(rowsOf(2)).toHaveLength(16);
    expect(rowsOf(801)).toHaveLength(7);
    expect(rowsOf(802)).toHaveLength(11);
    expect(rowsOf(803)).toHaveLength(23);
    expect(gridFightSeasonTwoRoute.nodes).toHaveLength(rowsOf(1).length);
});

it('leaves the bonfire nodes unscored and increases monotonically', () => {
    const rows = rowsOf(1);
    const at = (chapterId: number, sectionId: number) =>
        rows.find((row) => row.chapterId === chapterId && row.sectionId === sectionId)!;
    const score = (chapterId: number, sectionId: number) => {
        const row = at(chapterId, sectionId);
        return { weeklyScore: row.weeklyScore, seasonExp: row.seasonExp };
    };
    // The three bonfires of route 1801 are chapter 1 section 5 and chapter 2/3 section 3.
    expect(score(1, 5)).toEqual(score(1, 4));
    expect(score(2, 3)).toEqual(score(2, 2));
    expect(score(3, 3)).toEqual(score(3, 2));
    // The rows follow the route order, so both counters never decrease.
    for (let index = 1; index < rows.length; index += 1) {
        expect(rows[index].weeklyScore).toBeGreaterThanOrEqual(rows[index - 1].weeklyScore);
        expect(rows[index].seasonExp).toBeGreaterThanOrEqual(rows[index - 1].seasonExp);
    }
    const nodes = gridFightSeasonTwoRoute.nodes;
    expect(rows.map((row) => [row.chapterId, row.sectionId]))
        .toEqual(nodes.map((node) => [node.chapterId, node.sectionId]));
});

it('saturates a full ranked clear at the extra season exp limit', () => {
    expect(gridFightSettleScoreAt(1, 23)).toMatchObject({ weeklyScore: 18000, seasonExp: 1500 });
    // GridFight_ExtraSeasonExp_Limit is 1500, the same as a full clear.
    expect(gridFightSettleScoreAt(1, 99)).toEqual(gridFightSettleScoreAt(1, 23));
    expect(gridFightSettleScoreAt(1, 0)).toMatchObject({ weeklyScore: 0, seasonExp: 0 });
    expect(gridFightSettleScoreAt(1, 1)).toMatchObject({ weeklyScore: 1200, seasonExp: 25 });
});

it('maps routes to the score rule of their shape', () => {
    expect(gridFightSeasonScoreRuleForRoute(1801)).toBe(1);
    expect(gridFightSeasonScoreRuleForRoute(100)).toBe(1);
    // The overclock family reuses rule 2, the teaching routes keep their own id.
    expect(gridFightSeasonScoreRuleForRoute(2000)).toBe(2);
    expect(gridFightSeasonScoreRuleForRoute(2801)).toBe(2);
    expect(gridFightSeasonScoreRuleForRoute(801)).toBe(801);
    expect(gridFightSeasonScoreRuleForRoute(802)).toBe(802);
    expect(gridFightSeasonScoreRuleForRoute(803)).toBe(803);
});

it('resolves the cumulative score of a known node', () => {
    expect(gridFightSettleScore(1, 2, 3)).toEqual({
        chapterId: 2, sectionId: 3, weeklyScore: 12000, seasonExp: 650,
    });
    // The teaching curves start with unscored rows.
    expect(gridFightSettleScore(801, 1, 1)).toMatchObject({ weeklyScore: 0, seasonExp: 0 });
    expect(gridFightSettleScore(801, 1, 3)).toMatchObject({ weeklyScore: 900, seasonExp: 180 });
    // Unknown rules and nodes award nothing instead of throwing.
    expect(gridFightSettleScore(999, 1, 1)).toMatchObject({ weeklyScore: 0, seasonExp: 0 });
    expect(gridFightSettleScore(1, 9, 9)).toMatchObject({ weeklyScore: 0, seasonExp: 0 });
});
