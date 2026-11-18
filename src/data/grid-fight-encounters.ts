// Enemy encounters for the season-two route.
//
// The official season-two formation table (the one that turns a node's
// ParamList into a camp, a wave list and a difficulty row) is not part of any
// local data set. Everything below is derived from tables the 4.6.x client does
// ship, and is therefore an approximation that keeps the flow faithful:
//
//  - GridFightStageLevelValue (23 rows): `LevelBaseAttack` / `LevelBaseHP` for
//    every route stage, e.g. 70000001 -> 20000/16000 and 70000023 -> 250000/40000.
//  - GridFightMonster (162 rows): `MonsterID` -> `MonsterTier` plus the
//    `Star1..Star4EliteGroup3` mapping. The monster id prefix selects the
//    chapter: `10` chapter one, `20` chapter two, `30` chapter three (`80` is
//    the tutorial chapter).
//  - GridFightDivisionStage (97 rows, season one only): `LevelBaseHPMultiRatio`
//    per division. Season-two divisions have no row yet, so the ratio stays 1.
//
// Composition by node type (Monster=1, CampMonster=2, EliteBranch=3, Boss=4):
//  - Monster: two minions, monster star 1.
//  - CampMonster: three minions, monster star 2.
//  - EliteBranch: two elites (`MonsterTier` 6), monster star 3.
//  - Boss: one boss (`MonsterTier` 5), monster star 4.
// When the real table is recovered, replace this file: the handler only needs
// `encounterForNode` and `stageLevelFor`.

import { RouteNode } from './grid-fight-stages';

export interface EncounterMonster {
    monsterId: number;
    /** Battle star of the monster (`extraInfo.EIGMKOJOEEI.roleStar`). */
    roleStar: number;
    maxHp: number;
}

interface ChapterPool {
    minions: number[];
    elites: number[];
    bosses: number[];
}

// GridFightMonster rows, grouped by chapter and MonsterTier. Rows with no tier
// are left out: the client never shows them as a monster.
const chapterPools: Record<number, ChapterPool> = {
    1: {
        minions: [
            100203025, 100204030, 100205028, 101201023, 101202113, 101203019, 102201019, 102202029,
            100301039, 101301027, 101302037, 102301021, 102302009,
        ],
        elites: [100401201, 100402301, 101401201, 100402302],
        bosses: [1004016, 1004028, 1014016],
    },
    2: {
        minions: [
            201101005, 201102005,
            200201014, 200203009, 201201013, 202201016, 202202012, 202204006, 202205008, 202206014,
            202211011,
            201301103, 201302014, 202301015, 202302016, 202303018,
        ],
        elites: [200401202, 200402202, 202401203],
        bosses: [2004015, 200402403, 202401012],
    },
    3: {
        minions: [
            300101007, 300102007,
            300201010, 300203016, 300204008, 301202004,
            300301009, 300302009, 300303009, 300304003, 300305008, 301301009,
        ],
        elites: [300401101, 300402201, 302401104, 302402301, 3024032],
        bosses: [300401003, 300402004, 302401011, 302402204, 3024031],
    },
};

// GridFightStageLevelValue rows: stage id -> { attack, hp }.
const stageLevels = new Map<number, { attack: number; hp: number }>([
    [70000001, { attack: 20000, hp: 16000 }],
    [70000002, { attack: 20000, hp: 16000 }],
    [70000003, { attack: 20000, hp: 16000 }],
    [70000004, { attack: 25000, hp: 16000 }],
    [70000005, { attack: 30000, hp: 16000 }],
    [70000006, { attack: 30000, hp: 16000 }],
    [70000007, { attack: 35000, hp: 16000 }],
    [70000008, { attack: 35000, hp: 16000 }],
    [70000009, { attack: 40000, hp: 20000 }],
    [70000010, { attack: 50000, hp: 24000 }],
    [70000011, { attack: 62500, hp: 24000 }],
    [70000012, { attack: 62500, hp: 24000 }],
    [70000013, { attack: 75000, hp: 24000 }],
    [70000014, { attack: 87500, hp: 24000 }],
    [70000015, { attack: 87500, hp: 24000 }],
    [70000016, { attack: 100000, hp: 28000 }],
    [70000017, { attack: 125000, hp: 32000 }],
    [70000018, { attack: 156250, hp: 32000 }],
    [70000019, { attack: 156250, hp: 32000 }],
    [70000020, { attack: 187500, hp: 32000 }],
    [70000021, { attack: 218750, hp: 32000 }],
    [70000022, { attack: 218750, hp: 32000 }],
    [70000023, { attack: 250000, hp: 40000 }],
]);

export function stageLevelFor(stageId: number): { attack: number; hp: number } {
    return stageLevels.get(stageId) ?? { attack: 20000, hp: 16000 };
}

// GridFightDivisionStage rows only list season-one divisions; anything else is
// neutral (1.0) until the season-two rows are recovered.
const divisionHpRatio = new Map<number, number>();

export function divisionHpMultiplier(divisionId: number): number {
    return divisionHpRatio.get(divisionId) ?? 1;
}

const compositionByNodeType: Record<number, { count: number; roleStar: number }> = {
    1: { count: 2, roleStar: 1 },
    2: { count: 3, roleStar: 2 },
    3: { count: 2, roleStar: 3 },
    4: { count: 1, roleStar: 4 },
};

// Small deterministic PRNG so a node always rolls the same encounter: previews
// are generated before the battle and must match the battle snapshot exactly.
function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function poolForNode(pool: ChapterPool, nodeType: number): number[] {
    if (nodeType === 3) return pool.elites;
    if (nodeType === 4) return pool.bosses;
    return pool.minions;
}

export interface EncounterOptions {
    /** Run id keeps a rerun of the same route from replaying the same roll. */
    runId: number;
    divisionId: number;
    /** Preview option id (0 for the single-option nodes, 1/2 for branches). */
    optionId?: number;
    /** Ignore the stage HP table (used by tests). */
    hpOverride?: number;
}

export function encounterForNode(node: RouteNode, options: EncounterOptions): EncounterMonster[] {
    const composition = compositionByNodeType[node.nodeType];
    if (!composition) return [];
    const pool = chapterPools[node.chapterId] ?? chapterPools[1];
    const candidates = poolForNode(pool, node.nodeType);
    if (candidates.length === 0) return [];
    const seed = ((options.runId * 73856093) ^ (node.stageId * 19349663)
        ^ ((options.optionId ?? 0) * 83492791)) >>> 0;
    const random = mulberry32(seed);
    // Deterministic sample without replacement.
    const available = candidates.slice();
    const picked: number[] = [];
    for (let index = 0; index < composition.count && available.length > 0; index += 1) {
        picked.push(available.splice(Math.floor(random() * available.length), 1)[0]);
    }
    const base = options.hpOverride
        ?? Math.round(stageLevelFor(node.stageId).hp * divisionHpMultiplier(options.divisionId));
    const share = Math.max(1, Math.floor(base / picked.length));
    const remainder = base - share * picked.length;
    return picked.map((monsterId, index) => ({
        monsterId,
        roleStar: composition.roleStar,
        maxHp: share + (index < remainder ? 1 : 0),
    }));
}
