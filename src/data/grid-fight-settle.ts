// Season 2 settlement curve, transcribed from `GridFightSeasonExpScore`
// (OSBETAWin4.6.54 DesignData, 80 rows).
//
// Every row is the *cumulative* reward for having cleared the run up to that
// (chapter, section): `WeeklyScore` is the weekly score and `Exp` the season
// exp. Two independent proofs that the rows are cumulative and ordered like a
// route instead of being per-node increments:
//
// 1. Row counts match the route shapes exactly. `ScoreRuleID` 1 has 23 rows and
//    describes the standard ranked route (9+7+7, the same shape as route
//    1801), `ScoreRuleID` 2 has 16 rows (the overclock routes 2000-2801), and
//    801/802/803 have 7/11/23 rows, which is exactly the node count of the
//    teaching routes with the same IDs.
// 2. A supply (bonfire) node repeats the value of the node before it: rule 1
//    repeats chapter 1 section 4 at section 5 and chapter 2/3 section 2 at
//    section 3, which are the three bonfire positions of route 1801. Entering a
//    bonfire therefore awards no score, exactly as the run does.
//
// `GridFight_ExtraSeasonExp_Limit` (1500) equals the maximum season exp of
// rule 1, so a full clear of the ranked route saturates the per-run exp.
export type GridFightSettleScore = {
    chapterId: number;
    sectionId: number;
    weeklyScore: number;
    seasonExp: number;
};

// [chapterId, sectionId, weeklyScore, seasonExp]
const scoreRule1Rows = [
    [1, 1, 1200, 25], [1, 2, 2400, 50], [1, 3, 3600, 125],
    [1, 4, 4800, 200], [1, 5, 4800, 200], [1, 6, 6000, 275],
    [1, 7, 7200, 350], [1, 8, 8400, 425], [1, 9, 9600, 500],
    [2, 1, 10800, 575], [2, 2, 12000, 650], [2, 3, 12000, 650],
    [2, 4, 13200, 725], [2, 5, 14400, 800], [2, 6, 15600, 875],
    [2, 7, 16800, 950],
    [3, 1, 18000, 1050], [3, 2, 18000, 1125], [3, 3, 18000, 1125],
    [3, 4, 18000, 1225], [3, 5, 18000, 1325], [3, 6, 18000, 1425],
    [3, 7, 18000, 1500],
];

const scoreRule2Rows = [
    [1, 1, 1800, 40], [1, 2, 3600, 120], [1, 3, 3600, 120],
    [1, 4, 5400, 200], [1, 5, 7200, 280], [1, 6, 9000, 360],
    [2, 1, 10800, 440], [2, 2, 10800, 440], [2, 3, 12600, 520],
    [2, 4, 14400, 600], [2, 5, 16200, 680],
    [3, 1, 18000, 760], [3, 2, 18000, 760], [3, 3, 18000, 840],
    [3, 4, 18000, 920], [3, 5, 18000, 1000],
];

// The teaching routes start with unpopulated rows, which the table stores as
// absent fields; they award nothing until the first scored node.
const scoreRule801Rows = [
    [1, 1, 0, 0], [1, 2, 0, 0], [1, 3, 900, 180], [1, 4, 1800, 360],
    [1, 5, 2700, 540], [1, 6, 3600, 720], [1, 7, 4500, 900],
];

const scoreRule802Rows = [
    [1, 1, 0, 0], [1, 2, 630, 120], [1, 3, 1260, 240], [1, 4, 1890, 360],
    [1, 5, 2520, 480], [1, 6, 3150, 600],
    [2, 1, 3780, 720], [2, 2, 4410, 840], [2, 3, 5040, 960],
    [2, 4, 5670, 1080], [2, 5, 6300, 1200],
];

const scoreRule803Rows = [
    [1, 1, 480, 75], [1, 2, 960, 150], [1, 3, 1440, 225],
    [1, 4, 1920, 300], [1, 5, 1920, 300], [1, 6, 2400, 375],
    [1, 7, 2880, 450], [1, 8, 3360, 525], [1, 9, 3840, 600],
    [2, 1, 4320, 675], [2, 2, 4800, 750], [2, 3, 4800, 750],
    [2, 4, 5280, 825], [2, 5, 5760, 900], [2, 6, 6240, 975],
    [2, 7, 6720, 1050],
    [3, 1, 7200, 1125], [3, 2, 7200, 1200], [3, 3, 7200, 1200],
    [3, 4, 7200, 1275], [3, 5, 7200, 1350], [3, 6, 7200, 1425],
    [3, 7, 7200, 1500],
];

const toRows = (rows: number[][]): GridFightSettleScore[] => rows.map((row) => ({
    chapterId: row[0],
    sectionId: row[1],
    weeklyScore: row[2],
    seasonExp: row[3],
}));

// `GridFightSeasonExpScore` keyed by `ScoreRuleID`, in route node order.
export const gridFightSettleScoreRules = new Map<number, GridFightSettleScore[]>([
    [1, toRows(scoreRule1Rows)],
    [2, toRows(scoreRule2Rows)],
    [801, toRows(scoreRule801Rows)],
    [802, toRows(scoreRule802Rows)],
    [803, toRows(scoreRule803Rows)],
]);

/**
 * The score rule a route settles with. `GridFightDivisionStage.ScoreRule` picks
 * one of these ids per division; the teaching routes share their own id, the
 * overclock family uses rule 2, and every other route is a ranked 23-node route
 * and therefore uses rule 1.
 */
export function gridFightSeasonScoreRuleForRoute(routeId: number): number {
    if (routeId === 801 || routeId === 802 || routeId === 803) return routeId;
    if (routeId >= 2000 && routeId <= 2801) return 2;
    return 1;
}

/** Score for a run that cleared `clearedNodes` nodes of the rule's route. */
export function gridFightSettleScoreAt(ruleId: number, clearedNodes: number): GridFightSettleScore {
    const rows = gridFightSettleScoreRules.get(ruleId);
    if (!rows || clearedNodes <= 0) return { chapterId: 0, sectionId: 0, weeklyScore: 0, seasonExp: 0 };
    return rows[Math.min(clearedNodes, rows.length) - 1];
}

/** Score for a run that stopped at (chapterId, sectionId); 0 when unknown. */
export function gridFightSettleScore(
    ruleId: number, chapterId: number, sectionId: number,
): GridFightSettleScore {
    const rows = gridFightSettleScoreRules.get(ruleId) ?? [];
    const index = rows.findIndex(
        (row) => row.chapterId === chapterId && row.sectionId === sectionId,
    );
    return index < 0
        ? { chapterId, sectionId, weeklyScore: 0, seasonExp: 0 }
        : gridFightSettleScoreAt(ruleId, index + 1);
}
