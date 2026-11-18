// 周常积分奖励阶梯（`GridFightScoreReward`，4.7 线上游表，4.6.54 镜像没有）。
// 12 档：每 1500 分一档（1500–18000），`Reward` 是奖励 id（312901–312912）。
// 18000 正好是 `GridFightSeasonExpScore` 标准路线满通关的周常积分。

export interface GridFightScoreReward {
    rank: number;
    score: number;
    rewardId: number;
}

export const gridFightScoreRewards: readonly GridFightScoreReward[] = [
    { rank: 1, score: 1500, rewardId: 312901 },
    { rank: 2, score: 3000, rewardId: 312902 },
    { rank: 3, score: 4500, rewardId: 312903 },
    { rank: 4, score: 6000, rewardId: 312904 },
    { rank: 5, score: 7500, rewardId: 312905 },
    { rank: 6, score: 9000, rewardId: 312906 },
    { rank: 7, score: 10500, rewardId: 312907 },
    { rank: 8, score: 12000, rewardId: 312908 },
    { rank: 9, score: 13500, rewardId: 312909 },
    { rank: 10, score: 15000, rewardId: 312910 },
    { rank: 11, score: 16500, rewardId: 312911 },
    { rank: 12, score: 18000, rewardId: 312912 },
];

export function gridFightScoreRewardByRank(rank: number): GridFightScoreReward | undefined {
    return gridFightScoreRewards.find((row) => row.rank === rank);
}

export function gridFightScoreRewardByRewardId(rewardId: number): GridFightScoreReward | undefined {
    return gridFightScoreRewards.find((row) => row.rewardId === rewardId);
}

/** Ranks whose score threshold is reached by `weeklyScore` (1-based, ascending). */
export function gridFightScoreRewardRanks(weeklyScore: number): number[] {
    return gridFightScoreRewards.filter((row) => weeklyScore >= row.score).map((row) => row.rank);
}
