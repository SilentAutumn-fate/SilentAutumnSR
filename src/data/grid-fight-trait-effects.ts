// 羁绊效果表（4.7 线上游 `ExcelOutput/` 的 `GridFightTraitBasicInfo` 33 行、
// `GridFightTraitEffect` 24 行、`GridFightTraitEffectLayerPa` 74 行；4.6.54 镜像没有这三张表）。
// `GridFightTraitEffectLayerPa` 以「效果 id + 层数」为键给出该层的效果参数，`params` 原样保留数值顺序。

export type GridFightTraitEffectType = 'BackStrengthenFront' | 'ChooseTraitByModule' | 'CoreRoleByEquipNum' | 'CoreRoleChoose' | 'Elation' | 'GainFrontTrait' | 'HolyGrailPray' | 'PartnerRoleChoose' | 'SPSlot' | 'SelectEnhance' | 'TempEquip' | 'TraitBonus' | 'TraitEffectByJson';

export interface GridFightTraitEffectDef {
    id: number;
    type: GridFightTraitEffectType;
}

export const gridFightTraitEffects: readonly GridFightTraitEffectDef[] = [
    { id: 10021, type: 'CoreRoleByEquipNum' },
    { id: 10031, type: 'TraitBonus' },
    { id: 10041, type: 'TraitEffectByJson' },
    { id: 10061, type: 'TraitEffectByJson' },
    { id: 10081, type: 'TraitBonus' },
    { id: 10091, type: 'BackStrengthenFront' },
    { id: 10101, type: 'CoreRoleChoose' },
    { id: 10111, type: 'TempEquip' },
    { id: 10121, type: 'TraitBonus' },
    { id: 10131, type: 'ChooseTraitByModule' },
    { id: 20041, type: 'SPSlot' },
    { id: 20121, type: 'Elation' },
    { id: 25031, type: 'TraitEffectByJson' },
    { id: 25051, type: 'TraitEffectByJson' },
    { id: 25061, type: 'TraitEffectByJson' },
    { id: 30021, type: 'SelectEnhance' },
    { id: 30041, type: 'TraitEffectByJson' },
    { id: 30051, type: 'GainFrontTrait' },
    { id: 30061, type: 'SelectEnhance' },
    { id: 30062, type: 'SelectEnhance' },
    { id: 30063, type: 'SelectEnhance' },
    { id: 30071, type: 'PartnerRoleChoose' },
    { id: 101311, type: 'HolyGrailPray' },
    { id: 888888, type: 'TempEquip' },
];

export interface GridFightTraitEffectLayer {
    layer: number;
    params: readonly number[];
}

export const gridFightTraitEffectLayers = new Map<number, readonly GridFightTraitEffectLayer[]>(
    [
        [10021, [{ layer: 2, params: [1] }, { layer: 3, params: [1] }, { layer: 4, params: [2] }]],
        [10031, [{ layer: 2, params: [1] }, { layer: 4, params: [1] }, { layer: 6, params: [1] }]],
        [10041, [{ layer: 2, params: [1] }, { layer: 3, params: [3] }]],
        [10061, [{ layer: 1, params: [1, 0.1, 0.2, 0.1, 0.1, 0.2, 0.1, 0.18, 15] }, { layer: 2, params: [1.2, 0.1, 0.2, 0.1, 0.1, 0.2, 0.1, 0.18, 15] }, { layer: 3, params: [1.45, 0.1, 0.2, 0.1, 0.1, 0.2, 0.1, 0.18, 15] }, { layer: 4, params: [1.75, 0.1, 0.2, 0.1, 0.1, 0.2, 0.1, 0.18, 15] }, { layer: 5, params: [2.1, 0.1, 0.2, 0.1, 0.1, 0.2, 0.1, 0.18, 15] }, { layer: 6, params: [2.5, 0.1, 0.2, 0.1, 0.1, 0.2, 0.1, 0.18, 15] }, { layer: 7, params: [3, 0.1, 0.2, 0.1, 0.1, 0.2, 0.1, 0.18, 15] }]],
        [10081, [{ layer: 3, params: [1] }, { layer: 5, params: [2] }, { layer: 6, params: [3] }, { layer: 8, params: [6] }]],
        [10091, [{ layer: 1, params: [0.08, 1, 3, 6, 12, 0.08] }, { layer: 2, params: [0.16, 1, 3, 6, 12, 0.16] }, { layer: 3, params: [0.28, 1, 3, 6, 12, 0.28] }, { layer: 4, params: [0.3, 1, 3, 6, 12, 0.3] }]],
        [10101, [{ layer: 2, params: [] }, { layer: 3, params: [] }, { layer: 4, params: [] }, { layer: 5, params: [] }, { layer: 6, params: [] }]],
        [10111, [{ layer: 3, params: [35100000] }, { layer: 4, params: [35100000, 35100000] }, { layer: 6, params: [35100000, 35100000, 35100004] }, { layer: 9, params: [35100012, 35100012, 35100012] }]],
        [10121, [{ layer: 2, params: [2] }, { layer: 4, params: [5] }, { layer: 7, params: [9] }, { layer: 9, params: [30] }]],
        [10131, [{ layer: 2, params: [] }, { layer: 3, params: [] }, { layer: 4, params: [] }, { layer: 5, params: [] }]],
        [20041, [{ layer: 3, params: [] }, { layer: 5, params: [] }, { layer: 7, params: [] }, { layer: 10, params: [] }]],
        [20121, [{ layer: 3, params: [1] }, { layer: 4, params: [2] }, { layer: 5, params: [3] }, { layer: 7, params: [3] }]],
        [25031, [{ layer: 2, params: [0.24] }, { layer: 3, params: [0.48] }, { layer: 4, params: [0.72] }, { layer: 5, params: [0.96] }, { layer: 6, params: [1.32] }]],
        [25051, [{ layer: 2, params: [0.05] }, { layer: 3, params: [0.1] }, { layer: 4, params: [0.15] }, { layer: 5, params: [0.2] }, { layer: 6, params: [0.28] }]],
        [25061, [{ layer: 2, params: [0.08] }, { layer: 3, params: [0.16] }, { layer: 4, params: [0.24] }, { layer: 5, params: [0.32] }, { layer: 6, params: [0.44] }]],
        [30021, [{ layer: 1, params: [1307, 2, 3, 1] }]],
        [30041, [{ layer: 1, params: [25, 4, 1] }]],
        [30051, [{ layer: 1, params: [] }]],
        [30061, [{ layer: 1, params: [15061, 99, 2, 2] }]],
        [30062, [{ layer: 1, params: [15062, 99, 2, 2] }]],
        [30063, [{ layer: 1, params: [15063, 99, 2, 2] }]],
        [30071, [{ layer: 1, params: [1510, 1001] }]],
        [101311, [{ layer: 2, params: [121, 122] }, { layer: 3, params: [131, 132, 133] }, { layer: 4, params: [141, 142, 143, 144, 145] }, { layer: 5, params: [151, 152, 153] }]],
    ],
);

export interface GridFightTraitInfo {
    id: number;
    activation: string;
    effects: readonly number[];
    descParams: readonly number[];
}

export const gridFightTraitInfos = new Map<number, GridFightTraitInfo>(
    [
        [1001, { id: 1001, activation: 'GreaterEqualThan', effects: [], descParams: [10] }],
        [1002, { id: 1002, activation: 'GreaterEqualThan', effects: [10021], descParams: [10] }],
        [1003, { id: 1003, activation: 'GreaterEqualThan', effects: [10031], descParams: [10] }],
        [1004, { id: 1004, activation: 'GreaterEqualThan', effects: [10041], descParams: [10] }],
        [1005, { id: 1005, activation: 'GreaterEqualThan', effects: [], descParams: [10] }],
        [1006, { id: 1006, activation: 'GreaterEqualThan', effects: [10061], descParams: [10] }],
        [1007, { id: 1007, activation: 'GreaterEqualThan', effects: [], descParams: [10] }],
        [1008, { id: 1008, activation: 'GreaterEqualThan', effects: [10081], descParams: [10, 0.5, 4] }],
        [1009, { id: 1009, activation: 'GreaterEqualThan', effects: [10091], descParams: [10] }],
        [1010, { id: 1010, activation: 'GreaterEqualThan', effects: [10101], descParams: [10] }],
        [1011, { id: 1011, activation: 'GreaterEqualThan', effects: [10111], descParams: [10] }],
        [1012, { id: 1012, activation: 'GreaterEqualThan', effects: [10121], descParams: [2] }],
        [1013, { id: 1013, activation: 'GreaterEqualThan', effects: [10131], descParams: [] }],
        [1014, { id: 1014, activation: 'GreaterEqualThan', effects: [], descParams: [] }],
        [2001, { id: 2001, activation: 'GreaterEqualThan', effects: [], descParams: [0.05, 0.2, 0, 0, 1, 3, 0, 0, 0, 0] }],
        [2002, { id: 2002, activation: 'GreaterEqualThan', effects: [], descParams: [1.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0] }],
        [2003, { id: 2003, activation: 'GreaterEqualThan', effects: [], descParams: [0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
        [2004, { id: 2004, activation: 'GreaterEqualThan', effects: [20041], descParams: [0.3, 0.03, 0, 0, 0, 0, 0, 0, 0, 0] }],
        [2005, { id: 2005, activation: 'GreaterEqualThan', effects: [], descParams: [0.12, 0.2, 0, 0, 0, 0, 0, 0, 0, 0] }],
        [2006, { id: 2006, activation: 'GreaterEqualThan', effects: [], descParams: [40000, 0, 0.05, 0.02, 10000, 5, 1000, 0, 0, 0] }],
        [2007, { id: 2007, activation: 'GreaterEqualThan', effects: [], descParams: [2, 3, 0.1, 0, 0.03, 0, 0, 0, 0, 0] }],
        [2008, { id: 2008, activation: 'GreaterEqualThan', effects: [], descParams: [2.5, 2, 2.4, 0, 0, 0, 0, 0, 0, 0] }],
        [2009, { id: 2009, activation: 'GreaterEqualThan', effects: [], descParams: [0.15, 1, 0, 0, 0, 0, 0, 0, 0, 0] }],
        [2010, { id: 2010, activation: 'GreaterEqualThan', effects: [], descParams: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
        [2011, { id: 2011, activation: 'GreaterEqualThan', effects: [], descParams: [2, 0.12, 0.12, 0.02, 0.06, 4, 1, 0.2, 0, 0] }],
        [2012, { id: 2012, activation: 'GreaterEqualThan', effects: [20121], descParams: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
        [3001, { id: 3001, activation: 'GreaterEqualThan', effects: [], descParams: [1, 8, 12, 2.4, 1.5, 10, 1, 4, 0, 0] }],
        [3002, { id: 3002, activation: 'GreaterEqualThan', effects: [30021], descParams: [2] }],
        [3003, { id: 3003, activation: 'GreaterEqualThan', effects: [], descParams: [1, 6, 3, 0, 0, 0, 0, 0, 0, 0] }],
        [3004, { id: 3004, activation: 'GreaterEqualThan', effects: [30041], descParams: [] }],
        [3005, { id: 3005, activation: 'GreaterEqualThan', effects: [30051], descParams: [] }],
        [3006, { id: 3006, activation: 'GreaterEqualThan', effects: [30061, 30062, 30063], descParams: [] }],
        [3007, { id: 3007, activation: 'GreaterEqualThan', effects: [30071], descParams: [] }],
    ],
);


const effectById = new Map(gridFightTraitEffects.map((entry) => [entry.id, entry]));

export function gridFightTraitInfo(traitId: number): GridFightTraitInfo | undefined {
    return gridFightTraitInfos.get(traitId);
}

export function gridFightTraitEffectOf(effectId: number): GridFightTraitEffectDef | undefined {
    return effectById.get(effectId);
}

/** 该效果在某一层的参数；层数不存在时返回 undefined。 */
export function gridFightTraitEffectLayerParams(effectId: number, layer: number): readonly number[] | undefined {
    const layers = gridFightTraitEffectLayers.get(effectId) ?? [];
    return layers.find((entry) => entry.layer === layer)?.params;
}

/**
 * 羁绊是否接受某个效果：没有效果列表的羁绊只接受 0（表示不选择），
 * 有效果列表的羁绊要求 id 在列表里（只有 3006 这类多选羁绊会出现选择场景）。
 */
export function gridFightTraitAcceptsEffect(traitId: number, effectId: number): boolean {
    const trait = gridFightTraitInfos.get(traitId);
    if (!trait) return false;
    if (effectId === 0) return true;
    if (!trait.effects.length) return false;
    return trait.effects.includes(effectId);
}
