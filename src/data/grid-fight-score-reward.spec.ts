import {
    gridFightScoreRewardByRank,
    gridFightScoreRewardByRewardId,
    gridFightScoreRewardRanks,
    gridFightScoreRewards,
} from './grid-fight-score-reward';

describe('weekly score ladder', () => {
    it('lists the twelve 1500-point ranks with their reward ids', () => {
        expect(gridFightScoreRewards).toHaveLength(12);
        expect(gridFightScoreRewards.map((row) => row.rank)).toEqual(
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        );
        expect(gridFightScoreRewards.map((row) => row.score)).toEqual(
            [1500, 3000, 4500, 6000, 7500, 9000, 10500, 12000, 13500, 15000, 16500, 18000],
        );
        expect(gridFightScoreRewards.map((row) => row.rewardId)).toEqual(
            [312901, 312902, 312903, 312904, 312905, 312906, 312907, 312908, 312909, 312910, 312911, 312912],
        );
    });

    it('resolves a row by rank or by reward id', () => {
        expect(gridFightScoreRewardByRank(1)).toEqual({ rank: 1, score: 1500, rewardId: 312901 });
        expect(gridFightScoreRewardByRewardId(312912)).toEqual({ rank: 12, score: 18000, rewardId: 312912 });
        expect(gridFightScoreRewardByRank(0)).toBeUndefined();
        expect(gridFightScoreRewardByRank(13)).toBeUndefined();
        expect(gridFightScoreRewardByRewardId(312913)).toBeUndefined();
    });

    it('only unlocks the ranks whose score threshold is reached', () => {
        expect(gridFightScoreRewardRanks(0)).toEqual([]);
        expect(gridFightScoreRewardRanks(1499)).toEqual([]);
        expect(gridFightScoreRewardRanks(1500)).toEqual([1]);
        expect(gridFightScoreRewardRanks(3000)).toEqual([1, 2]);
        expect(gridFightScoreRewardRanks(17999)).toHaveLength(11);
        expect(gridFightScoreRewardRanks(18000)).toHaveLength(12);
    });
});
