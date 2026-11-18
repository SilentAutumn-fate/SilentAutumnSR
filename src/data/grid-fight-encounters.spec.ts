import { RouteNode, gridFightSeasonTwoRoute, gridFightStageMonsterParam } from './grid-fight-stages';
import {
    encounterForNode, divisionHpMultiplier, stageLevelFor,
} from './grid-fight-encounters';

const nodeOfType = (nodeType: number): RouteNode =>
    gridFightSeasonTwoRoute.nodes.find((node) => node.nodeType === nodeType)!;

const chapterNode = (chapterId: number, nodeType: number): RouteNode =>
    gridFightSeasonTwoRoute.nodes.find(
        (node) => node.chapterId === chapterId && node.nodeType === nodeType,
    )!;

describe('grid fight encounters', () => {
    it('reads the stage HP table and falls back to the first chapter', () => {
        expect(stageLevelFor(70000001)).toEqual({ attack: 20000, hp: 16000 });
        expect(stageLevelFor(70000023)).toEqual({ attack: 250000, hp: 40000 });
        expect(stageLevelFor(1)).toEqual({ attack: 20000, hp: 16000 });
        // Only season one divisions have a row; season two is neutral.
        expect(divisionHpMultiplier(20920)).toBe(1);
    });

    it('returns no encounter for the bonfire node', () => {
        expect(encounterForNode(nodeOfType(5), { runId: 1, divisionId: 20920 })).toEqual([]);
    });

    it('composes every battle node by node type', () => {
        const options = { runId: 7, divisionId: 20920 };
        const monster = encounterForNode(chapterNode(1, 1), options);
        expect(monster).toHaveLength(2);
        expect(monster.every((entry) => entry.roleStar === 1)).toBe(true);

        const camp = encounterForNode(chapterNode(1, 2), options);
        expect(camp).toHaveLength(3);
        expect(camp.every((entry) => entry.roleStar === 2)).toBe(true);

        const elite = encounterForNode(chapterNode(1, 3), options);
        expect(elite).toHaveLength(2);
        expect(elite.every((entry) => entry.roleStar === 3)).toBe(true);
        // Elite rows are MonsterTier 6 in GridFightMonster.
        const elitePool = [100401201, 100402301, 101401201, 100402302];
        expect(elite.every((entry) => elitePool.includes(entry.monsterId))).toBe(true);
        expect(new Set(elite.map((entry) => entry.monsterId)).size).toBe(2);

        const boss = encounterForNode(chapterNode(1, 4), options);
        expect(boss).toHaveLength(1);
        expect(boss[0].roleStar).toBe(4);
        expect([1004016, 1004028, 1014016]).toContain(boss[0].monsterId);
    });

    it('picks monsters from the chapter the node belongs to', () => {
        for (const chapter of [1, 2, 3]) {
            const prefix = String(chapter * 10).padStart(2, '0');
            const encountered = encounterForNode(chapterNode(chapter, 1), {
                runId: 3, divisionId: 20920,
            });
            expect(encountered.length).toBeGreaterThan(0);
            for (const entry of encountered) {
                expect(String(entry.monsterId).startsWith(prefix)).toBe(true);
            }
        }
    });

    it('is deterministic per run and stage but rolls per option', () => {
        const node = chapterNode(1, 3);
        const first = encounterForNode(node, { runId: 42, divisionId: 20920, optionId: 11301 });
        const again = encounterForNode(node, { runId: 42, divisionId: 20920, optionId: 11301 });
        expect(again).toEqual(first);
        // Option 11302 is the other elite branch; across a handful of runs it
        // must not always be identical to option 11301.
        const pairs = Array.from({ length: 12 }, (_, index) => {
            const left = encounterForNode(node, { runId: index, divisionId: 20920, optionId: 11301 });
            const right = encounterForNode(node, { runId: index, divisionId: 20920, optionId: 11302 });
            return left.map((entry) => entry.monsterId).join() === right.map((entry) => entry.monsterId).join();
        });
        expect(pairs.some((same) => !same)).toBe(true);
    });

    it('splits the stage HP pool across the encounter', () => {
        const options = { runId: 5, divisionId: 20920 };
        for (const nodeType of [1, 2, 3, 4]) {
            const node = nodeOfType(nodeType);
            const encountered = encounterForNode(node, options);
            const total = encountered.reduce((sum, entry) => sum + entry.maxHp, 0);
            expect(total).toBe(stageLevelFor(node.stageId).hp);
            expect(encountered.every((entry) => entry.maxHp > 0)).toBe(true);
        }
    });

    it('keeps the monster parameter payload shared by every stage', () => {
        expect(gridFightStageMonsterParam).toEqual({ level: 90, hardLevelGroup: 1, eliteGroup: 0 });
    });
});
