// OSBETAWin4.6.54 DesignData, c24332f35f3f8487b7677c6fc46b9798.bytes.
// DivisionConfig begins its season 2 rows at offset 5026557.
const seasonTwoDivisionCounts = [3, 3, 3, 5, 7, 9, 9, 9, 20];
export const gridFightSeasonTwoDivisions = new Set(seasonTwoDivisionCounts.flatMap(
    (count, rankIndex) => Array.from({ length: count }, (_, progressIndex) =>
        20000 + (rankIndex + 1) * 100 + progressIndex + 1),
));

// DivisionStage rows in bef6962c8251f5368b851ba60ee4f13e.bytes at 5088555.
const enemyDifficultyByRank = [
    [1, 2, 3], [6, 7, 8], [11, 12, 13], [16, 17, 18, 19, 20],
    [23, 24, 25, 26, 27, 28, 29], [32, 33, 34, 35, 36, 37, 38, 39, 40],
    [43, 44, 45, 46, 47, 48, 49, 50, 51], [55, 56, 57, 58, 59, 60, 61, 62, 63],
    [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89],
];

export function gridFightEnemyDifficulty(divisionId: number, quality: number): number {
    const rank = Math.floor((divisionId - 20000) / 100);
    const progress = divisionId % 100;
    const base = enemyDifficultyByRank[rank - 1][progress - 1];
    // BinaryDiffAddRule at offset 4987509 in the c24332 bundle.
    const additions = rank <= 2 ? [0, 0, 0, 0] : rank <= 4 ? [0, 5, 10, 20] : [0, 10, 20, 30];
    return base + additions[quality - 1];
}

// Route rows at offset 5198755, joined with NodeTemplate rows at offset 5060488.
//
// `GridFightStageRoute` ships 26 routes in three shapes: 23 nodes (9+7+7, the
// ranked route, 13 rows), 16 nodes (6+5+5, the overclock replay route, 11 rows)
// and the two tutorial routes 801/802. The ranked routes differ only in their
// camp / elite / boss parameter groups; route 1801 is the one whose chapter
// three elite group (333) and boss group (3051) match the parameters the
// overclock route used, so it is the ranked counterpart of what this handler
// already implemented — the other twelve reskin those two groups.
// Node types: 1 monster, 2 camp monster, 3 elite branch, 4 boss, 5 supply.
// `offersAugment` is the stage display flag (`displayValue.PFEMDGNFHNH`). The
// overclock route carried exactly one camp node per chapter, so the table alone
// cannot tell "every camp node" from "the first camp node"; keep one augment
// node per chapter until the augment flow itself is implemented, so the run
// still offers the same three choices the working configuration did.
const seasonTwoNodes = [
    [1, 1, 180111, 70000001, 1, [900], false, 90303, 3],
    [1, 2, 180112, 70000002, 1, [901], false, 90304, 4],
    [1, 3, 180113, 70000003, 2, [101], true, 90015, 5],
    [1, 4, 180114, 70000004, 2, [102], false, 90016, 5],
    [1, 5, 180115, 70000005, 5, [1], false, 0, 0],
    [1, 6, 180116, 70000006, 2, [104], false, 90017, 5],
    [1, 7, 180117, 70000007, 3, [113], false, 90018, 5],
    [1, 8, 180118, 70000008, 1, [902], false, 90204, 5],
    [1, 9, 180119, 70000009, 4, [105], false, 90104, 5],
    [2, 1, 180121, 70000010, 2, [201], true, 90025, 5],
    [2, 2, 180122, 70000011, 2, [202], false, 90026, 5],
    [2, 3, 180123, 70000012, 5, [2], false, 0, 0],
    [2, 4, 180124, 70000013, 2, [204], false, 90027, 5],
    [2, 5, 180125, 70000014, 3, [213], false, 90028, 5],
    [2, 6, 180126, 70000015, 1, [903], false, 90205, 5],
    [2, 7, 180127, 70000016, 4, [205], false, 90105, 5],
    [3, 1, 180131, 70000017, 2, [301], true, 90035, 5],
    [3, 2, 180132, 70000018, 2, [302], false, 90036, 5],
    [3, 3, 180133, 70000019, 5, [3], false, 0, 0],
    [3, 4, 180134, 70000020, 2, [304], false, 90037, 5],
    [3, 5, 180135, 70000021, 3, [333], false, 90038, 5],
    [3, 6, 180136, 70000022, 1, [904], false, 90206, 5],
    [3, 7, 180137, 70000023, 4, [3051], false, 90106, 5],
] as const;

export const gridFightSeasonTwoRoute = {
    id: 1801,
    nodes: seasonTwoNodes.map(
        ([chapterId, sectionId, nodeTemplateId, stageId, nodeType, parameters, offersAugment, penaltyBonusRuleId, basicGoldReward]) => ({
            chapterId, sectionId, nodeTemplateId, stageId, nodeType, parameters,
            offersAugment, penaltyBonusRuleId, basicGoldReward,
        }),
    ),
};

export type RouteNode = (typeof gridFightSeasonTwoRoute.nodes)[number];

// StageRow entries 70000001–70000023 in bef6962c8251f5368b851ba60ee4f13e.bytes.
// All share these values and omit EliteGroup.
export const gridFightStageMonsterParam = { level: 90, hardLevelGroup: 1, eliteGroup: 0 };

// GridFightPenaltyRule rows keyed by the client route's PenaltyBonusRuleID.
// Route 1801 uses the 90xxx block; every row is field-for-field identical to the
// 92xxx row the overclock route used, so the balance is unchanged.
// For a total loss use the configured threshold-fail penalty, or the basic
// penalty when the row has no threshold-fail value.
export const gridFightBattleRules = new Map([
    [90303, { rounds: 99, lossHp: 0 }],
    [90304, { rounds: 99, lossHp: 0 }],
    [90015, { rounds: 18, lossHp: 5 }],
    [90016, { rounds: 18, lossHp: 5 }],
    [90017, { rounds: 18, lossHp: 5 }],
    [90018, { rounds: 18, lossHp: 5 }],
    [90025, { rounds: 15, lossHp: 10 }],
    [90026, { rounds: 15, lossHp: 10 }],
    [90027, { rounds: 15, lossHp: 10 }],
    [90028, { rounds: 15, lossHp: 10 }],
    [90035, { rounds: 12, lossHp: 15 }],
    [90036, { rounds: 12, lossHp: 15 }],
    [90037, { rounds: 12, lossHp: 15 }],
    [90038, { rounds: 12, lossHp: 15 }],
    [90204, { rounds: 99, lossHp: 0 }],
    [90205, { rounds: 99, lossHp: 0 }],
    [90206, { rounds: 99, lossHp: 0 }],
    [90104, { rounds: 20, lossHp: 20 }],
    [90105, { rounds: 16, lossHp: 30 }],
    [90106, { rounds: 16, lossHp: 40 }],
]);

// GridFightLevelV2, levels 1–10. Level 10 is capped.
export const gridFightLevelUpExp = [2, 2, 6, 8, 20, 36, 48, 60, 72, 0];
// GridFightLevelV2.AvatarMaxNumber, levels 1–10: how many roles may be
// deployed on the field at each level. The rest stay on the bench. The season
// starts at level 3 with exactly three deployed roles, which is what pins this
// column to the deploy cap and not to the total roster size.
export const gridFightAvatarMaxNumber = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// GridFightLevelV2.GeneralPropertyList, levels 1–10: flat battle bonuses granted
// by the in-run level. Levels 1–3 carry no value in the table, 4–10 scale
// linearly (+100 attack / +200 HP per level above 3). Not wired into the battle
// snapshot yet: the client-side encoding of `BattleAvatar` properties is not
// verified, and a wrong property entry is worse than a missing bonus.
export const gridFightLevelPropertyBonus = [
    { attack: 0, hp: 0 },
    { attack: 0, hp: 0 },
    { attack: 0, hp: 0 },
    { attack: 100, hp: 200 },
    { attack: 200, hp: 400 },
    { attack: 300, hp: 600 },
    { attack: 400, hp: 800 },
    { attack: 500, hp: 1000 },
    { attack: 600, hp: 1200 },
    { attack: 700, hp: 1400 },
];
// GridFightConstCommon (ConstValueName → Value). These are the in-run economy
// numbers the handler used to hard-code; each name is the table's ConstValueName
// so the value can be re-checked against the dump at any time.
export const gridFightInitialPlayerHp = 100;       // GridFight_InitGlobalPlayerHP
export const gridFightStartingLevel = 3;           // GridFight_LotteryShopStartLevel
export const gridFightGainExpPerWave = 2;          // GridFight_GainExpWhenWaveEnd
export const gridFightGainExpPerBossWave = 10;     // GridFight_GainExpWhenBossWaveEnd
export const gridFightLevelUpGold = 4;             // GridFight_LevelUpGold
export const gridFightRefreshGold = 2;             // GridFight_LotteryRefreshGold
export const gridFightCardNumberPerRefresh = 5;    // GridFight_CardNumberPerRefresh
export const gridFightDepositPerInterest = 10;     // GridFight_DepositPerInterest
export const gridFightInterestMax = 5;             // GridFight_GainInterestMax
export const gridFightMaxEquipTrack = 3;           // GridFight_MaxEquipTrackNum
export const gridFightMaxTraitTrack = 3;           // GridFight_MaxTraitTrackNum
export const gridFightTalentPointItemId = 281032;  // GridFight_TalentPointItemID
// GridFightVictoryBonus rows 1–6 in the 4.6.54 DesignData bundle.
export const gridFightVictoryGold = [0, 1, 2, 2, 2, 3, 4];
export const gridFightRarityWeights = [
    [100, 0, 0, 0, 0],
    [100, 0, 0, 0, 0],
    [75, 25, 0, 0, 0],
    [55, 30, 15, 0, 0],
    [45, 33, 20, 2, 0],
    [30, 40, 25, 5, 0],
    [19, 30, 40, 10, 1],
    [18, 25, 32, 22, 3],
    [15, 20, 25, 30, 10],
    [5, 10, 20, 40, 25],
];

// GridFightRoleBasicInfo shop entries available in season 2, grouped by Rarity.
// Alternate forms share one battle avatar with their base role, so the shop keeps
// the role ID (pricing and rarity are per role) and only the battle avatar is
// remapped — see `gridFightBattleAvatarId`.
export const gridFightShopPools = [
    [1001, 1009, 1013, 1108, 1201, 1202, 1205, 1217, 1218, 1220, 1223, 1301, 1314, 1317, 1402, 1404, 1406, 1502, 1321, 1508, 12041],
    [1106, 1213, 1222, 1303, 1304, 1306, 1403, 1409, 1414, 1302, 1504, 1505, 1005, 1507, 1509],
    [1003, 1014, 1102, 1105, 1212, 1225, 1305, 1308, 1405, 1408, 1412, 1510, 1313, 12042, 15061],
    [1006, 1104, 1203, 1208, 1209, 1309, 1315, 1401, 1407, 1410, 1413, 8007, 1501, 8009, 15062],
    [1004, 1015, 1112, 1204, 1221, 1307, 1310, 1415, 15063, 11011, 11012],
];

// GridFightRoleBasicInfo.RoleID -> AvatarID for the alternate forms. Every other
// role uses its own ID for both, so only the differing rows are listed here.
export const gridFightRoleAvatars = new Map([
    [12041, 1204], [12042, 1204],
    [15061, 1506], [15062, 1506], [15063, 1506],
    [11011, 1101], [11012, 1101],
]);

export function gridFightBattleAvatarId(roleId: number): number {
    return gridFightRoleAvatars.get(roleId) ?? roleId;
}

// GridFightShopPrice, indexed by rarity and star rank.
export const gridFightSellPrices = [
    [1, 3, 9, 27],
    [2, 5, 17, 51],
    [3, 8, 26, 78],
    [4, 11, 35, 105],
    [5, 14, 44, 132],
];

// GridFightShopPrice buy column, indexed by rarity and star rank. One-star
// purchases cost the same as the sell column, but two stars and above diverge
// (rarity 2 / star 2 = 6 buy vs 5 sell), so both columns have to stay separate.
export const gridFightBuyPrices = [
    [1, 3, 9, 27],
    [2, 6, 18, 54],
    [3, 9, 27, 81],
    [4, 12, 36, 108],
    [5, 15, 45, 135],
];

// Roles with a fourth star row in GridFightRoleStar.
export const gridFightFourStarRoles = new Set([
    1001, 1005, 1009, 1013, 1106, 1108, 1201, 1202, 1205, 1213, 1217, 1218,
    1220, 1222, 1223, 1301, 1302, 1303, 1304, 1306, 1314, 1317, 1321, 1402,
    1403, 1404, 1406, 1409, 1414, 1502, 1504, 1505, 1507, 1508, 1509,
]);
