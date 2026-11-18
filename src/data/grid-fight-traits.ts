/**
 * 局内羁绊（Trait）数据层。
 *
 * 来源：4.6.54 的 `GridFightRoleBasicInfo.TraitList`（镜像
 * `_probe/reference-config/excel/GridFightRoleBasicInfo.json`，只取
 * `IsInPool && SeasonID === 1` 的 77 个角色，与商店卡池同一集合）。
 *
 * 羁绊 id 分三段，和客户端的 `RPG.GameCore.GridFightTraitType` 对应：
 *   1xxx = Origin（出身/阵营，13 个）
 *   2xxx = Class（职业，12 个）
 *   3xxx = Unique（专属，7 个）
 * `GridFightTraitType` 的枚举值本身是 Origin=0 / Class=1 / Unique=2 / Spotlight=3，
 * 与 id 前缀不是同一套数字，这里只做前缀分组，不冒充枚举。
 *
 * 羁绊的层数/阈值/效果在 `GridFightTraitBaseConfigRow`（`TraitLayerList`、
 * `ActivationType`）与 `GridFightTraitLayerConfigRow`（`TraitID`、`Layer`、`Quality`、
 * `PropertyBindType`、成员属性表）里，这两张表**不在镜像里**（dump.cs 里能看到类定义，
 * 数据行读不到），所以本模块只提供「谁带什么羁绊、上阵几个」，不计算层数和属性加成。
 */

/** 羁绊 id 前缀分组：1 = Origin，2 = Class，3 = Unique。 */
export type GridFightTraitGroup = 1 | 2 | 3;

export const gridFightTraitGroup = (traitId: number): GridFightTraitGroup | undefined => {
    const group = Math.floor(traitId / 1000);
    return group === 1 || group === 2 || group === 3 ? group : undefined;
};

/** 角色 → 羁绊 id 列表，按角色 id 升序。 */
export const gridFightRoleTraits = new Map<number, readonly number[]>([
    [1001, [1001, 2010]],
    [1003, [1001, 2002]],
    [1004, [1001, 1006, 2007]],
    [1005, [1002, 2008]],
    [1006, [1002, 2009]],
    [1009, [1003, 2008]],
    [1013, [1003, 2003]],
    [1014, [1013, 2004]],
    [1015, [1013, 2011, 3003]],
    [1102, [1005, 2009]],
    [1104, [1005, 2010]],
    [1105, [1005, 2005]],
    [1106, [1005, 2007]],
    [1108, [1005, 1006, 2008]],
    [1112, [1004, 2001]],
    [1201, [1007, 2011]],
    [1202, [1007, 2004]],
    [1203, [1006, 2005]],
    [1204, [1007, 2003]],
    [1205, [1002, 2006]],
    [1208, [1007, 2005, 2009]],
    [1209, [1007, 1008, 2007]],
    [1212, [1008, 2006]],
    [1213, [1001, 1007, 2011]],
    [1217, [1007, 2004, 2005]],
    [1218, [1008, 2007, 2008]],
    [1220, [1008, 2001]],
    [1221, [1008, 2004]],
    [1222, [1008, 2002, 2005]],
    [1223, [1008, 2001]],
    [1225, [1007, 2002]],
    [1301, [1010, 2002, 2005]],
    [1302, [1006, 2003]],
    [1303, [1003, 2002]],
    [1304, [1004, 2001, 2010]],
    [1305, [1003, 1006, 2001]],
    [1306, [1010, 2009, 2011]],
    [1307, [1010, 2008, 3002]],
    [1308, [1009, 2007]],
    [1309, [1010, 2001]],
    [1310, [1002, 2002]],
    [1313, [1001, 1010, 2004]],
    [1314, [1004, 2003]],
    [1315, [1009, 2002]],
    [1317, [1009, 2002]],
    [1321, [1010, 2002]],
    [1401, [1003, 2003]],
    [1402, [1011, 2004]],
    [1403, [1011, 2003, 2009]],
    [1404, [1012, 2006]],
    [1405, [1011, 2003]],
    [1406, [1012, 2001, 2007]],
    [1407, [1012, 2006]],
    [1408, [3005]],
    [1409, [1011, 2005, 2006]],
    [1410, [1011, 2008]],
    [1412, [1012, 2011]],
    [1413, [1012, 2006]],
    [1414, [1012, 2010]],
    [1415, [1011, 1012, 3004]],
    [1501, [1006, 2011, 2012]],
    [1502, [1007, 2012]],
    [1504, [1009, 2001]],
    [1505, [1006, 2012]],
    [1507, [1002, 2006, 2007]],
    [1508, [1013, 2011]],
    [1509, [1013, 2004]],
    [1510, [1001, 3007]],
    [8007, [1001, 2004, 2012]],
    [8009, [1001, 2004, 2012]],
    [11011, [1005, 3001]],
    [11012, [2006, 3001]],
    [12041, [1007, 2003]],
    [12042, [1007, 2003]],
    [15061, [1002, 2012, 3006]],
    [15062, [1002, 2012, 3006]],
    [15063, [1002, 2012, 3006]],]);

/** 取某个角色的羁绊；表外角色返回空数组。 */
export function gridFightTraitsOfRole(roleId: number): readonly number[] {
    return gridFightRoleTraits.get(roleId) ?? [];
}

/**
 * 统计一组上阵角色的羁绊数量（同一角色重复出现只算一次，表外角色忽略）。
 * 返回按「数量降序、羁绊 id 升序」排好的列表。
 */
/** 羁绊图层（阈值）定义；`layer` 就是激活所需人数（`GridFightTraitLayer.Layer`）。 */
export interface GridFightTraitLayerDef {
    readonly layer: number;
    readonly quality: 'Copper' | 'Silver' | 'Gold' | 'Multicolor' | 'Unique';
    readonly mazebuffId: number;
    readonly properties: readonly (readonly [string, number])[];
}

/**
 * 羁绊 → 图层列表（按 layer 升序）。
 *
 * 来源：`GridFightTraitLayer.json`（DimbreathBot/TurnBasedGameData 的 ExcelOutput，
 * 4.7 主线版本；4.6.54 镜像里没有这张表，用 4.7 的行按 4.6.54 的 32 个羁绊 id 过滤，
 * 全部 32 个都能对上）。`layer` 与 1001 的 2/4/6、3003 的 1 这类值一致，
 * 和 `GridFightActivationType.GreaterEqualThan` 配合就是「人数 ≥ layer 时该层生效」。
 * `properties` 是图层属性加成（`TraitMemberPropertyList` 原样，`All:` 前缀表示全队属性）。
 */
export const gridFightTraitLayers = new Map<number, readonly GridFightTraitLayerDef[]>([
    [
        1001,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35100101, properties: [] },
        { layer: 4, quality: 'Silver', mazebuffId: 35100102, properties: [] },
        { layer: 6, quality: 'Gold', mazebuffId: 35100103, properties: [] },
        ],
    ],
    [
        1002,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35100201, properties: [['ExtraHPAddedRatio1', 0.12], ['ExtraAllDamageTypeAddedRatio1', 0.24]] },
        { layer: 3, quality: 'Silver', mazebuffId: 35100202, properties: [['ExtraHPAddedRatio1', 0.24], ['ExtraAllDamageTypeAddedRatio1', 0.48]] },
        { layer: 4, quality: 'Gold', mazebuffId: 35100203, properties: [['ExtraHPAddedRatio1', 0.36], ['ExtraAllDamageTypeAddedRatio1', 0.8]] },
        ],
    ],
    [
        1003,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35100301, properties: [['ExtraFrontPowerAddedRatio1', 0.3], ['ExtraBackPowerAddedRatio1', 0.3]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35100302, properties: [['ExtraFrontPowerAddedRatio1', 0.8], ['ExtraBackPowerAddedRatio1', 0.8]] },
        { layer: 6, quality: 'Gold', mazebuffId: 35100303, properties: [['ExtraFrontPowerAddedRatio1', 2], ['ExtraBackPowerAddedRatio1', 2]] },
        ],
    ],
    [
        1004,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35100401, properties: [['ExtraBackPowerAddedRatio1', 0.3], ['ExtraShieldAddedRatio', 0.1]] },
        { layer: 3, quality: 'Gold', mazebuffId: 35100402, properties: [['ExtraBackPowerAddedRatio1', 1], ['ExtraShieldAddedRatio', 0.25]] },
        ],
    ],
    [
        1005,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35100501, properties: [['ExtraAllDamageTypeAddedRatio1', 0.36]] },
        { layer: 4, quality: 'Gold', mazebuffId: 35100502, properties: [['ExtraAllDamageTypeAddedRatio1', 0.72]] },
        ],
    ],
    [
        1006,
        [
        { layer: 1, quality: 'Copper', mazebuffId: 35100601, properties: [] },
        { layer: 2, quality: 'Copper', mazebuffId: 35100602, properties: [] },
        { layer: 3, quality: 'Silver', mazebuffId: 35100603, properties: [] },
        { layer: 4, quality: 'Silver', mazebuffId: 35100604, properties: [] },
        { layer: 5, quality: 'Gold', mazebuffId: 35100605, properties: [] },
        { layer: 6, quality: 'Gold', mazebuffId: 35100606, properties: [] },
        { layer: 7, quality: 'Gold', mazebuffId: 35100607, properties: [] },
        ],
    ],
    [
        1007,
        [
        { layer: 3, quality: 'Copper', mazebuffId: 35100701, properties: [['ExtraFrontPowerAddedRatio1', 0.2], ['ExtraBackPowerAddedRatio1', 0.2], ['ExtraSpeedAddedRatio1', 0.08]] },
        { layer: 5, quality: 'Silver', mazebuffId: 35100702, properties: [['ExtraFrontPowerAddedRatio1', 0.4], ['ExtraBackPowerAddedRatio1', 0.4], ['ExtraSpeedAddedRatio1', 0.16]] },
        { layer: 7, quality: 'Gold', mazebuffId: 35100703, properties: [['ExtraFrontPowerAddedRatio1', 0.8], ['ExtraBackPowerAddedRatio1', 0.8], ['ExtraSpeedAddedRatio1', 0.32]] },
        { layer: 10, quality: 'Multicolor', mazebuffId: 35100704, properties: [['ExtraFrontPowerAddedRatio1', 2], ['ExtraBackPowerAddedRatio1', 2], ['ExtraSpeedAddedRatio1', 0.6]] },
        ],
    ],
    [
        1008,
        [
        { layer: 3, quality: 'Copper', mazebuffId: 35100801, properties: [['ExtraFrontPowerAddedRatio1', 0.15], ['ExtraBackPowerAddedRatio1', 0.15]] },
        { layer: 5, quality: 'Silver', mazebuffId: 35100802, properties: [['ExtraFrontPowerAddedRatio1', 0.3], ['ExtraBackPowerAddedRatio1', 0.3]] },
        { layer: 6, quality: 'Gold', mazebuffId: 35100803, properties: [['ExtraFrontPowerAddedRatio1', 0.5], ['ExtraBackPowerAddedRatio1', 0.5]] },
        { layer: 8, quality: 'Multicolor', mazebuffId: 35100804, properties: [['ExtraFrontPowerAddedRatio1', 0.9], ['ExtraBackPowerAddedRatio1', 0.9]] },
        ],
    ],
    [
        1009,
        [
        { layer: 1, quality: 'Copper', mazebuffId: 35100901, properties: [['ExtraAllDamageTypeAddedRatio1', 0.08], ['ExtraSpeedAddedRatio1', 0.08]] },
        { layer: 2, quality: 'Copper', mazebuffId: 35100902, properties: [['ExtraAllDamageTypeAddedRatio1', 0.16], ['ExtraSpeedAddedRatio1', 0.16]] },
        { layer: 3, quality: 'Gold', mazebuffId: 35100903, properties: [['ExtraAllDamageTypeAddedRatio1', 0.28], ['ExtraSpeedAddedRatio1', 0.28]] },
        { layer: 4, quality: 'Gold', mazebuffId: 35100904, properties: [['ExtraAllDamageTypeAddedRatio1', 0.3], ['ExtraSpeedAddedRatio1', 0.3]] },
        ],
    ],
    [
        1010,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35101001, properties: [] },
        { layer: 3, quality: 'Silver', mazebuffId: 35101002, properties: [] },
        { layer: 4, quality: 'Silver', mazebuffId: 35101003, properties: [] },
        { layer: 5, quality: 'Gold', mazebuffId: 35101004, properties: [] },
        { layer: 6, quality: 'Gold', mazebuffId: 35101005, properties: [] },
        ],
    ],
    [
        1011,
        [
        { layer: 3, quality: 'Copper', mazebuffId: 35101101, properties: [['ExtraFrontPowerAddedRatio1', 0.1], ['ExtraBackPowerAddedRatio1', 0.1], ['ExtraSpeedAddedRatio1', 0.05]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35101102, properties: [['ExtraFrontPowerAddedRatio1', 0.18], ['ExtraBackPowerAddedRatio1', 0.18], ['ExtraSpeedAddedRatio1', 0.09]] },
        { layer: 6, quality: 'Gold', mazebuffId: 35101103, properties: [['ExtraFrontPowerAddedRatio1', 0.36], ['ExtraBackPowerAddedRatio1', 0.36], ['ExtraSpeedAddedRatio1', 0.18]] },
        { layer: 9, quality: 'Multicolor', mazebuffId: 35101104, properties: [['ExtraFrontPowerAddedRatio1', 0.6], ['ExtraBackPowerAddedRatio1', 0.6], ['ExtraSpeedAddedRatio1', 0.3]] },
        ],
    ],
    [
        1012,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35101201, properties: [['ExtraFrontPowerAddedRatio1', 0.3], ['ExtraBackPowerAddedRatio1', 0.3]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35101202, properties: [['ExtraFrontPowerAddedRatio1', 0.6], ['ExtraBackPowerAddedRatio1', 0.6]] },
        { layer: 7, quality: 'Gold', mazebuffId: 35101203, properties: [['ExtraFrontPowerAddedRatio1', 1.2], ['ExtraBackPowerAddedRatio1', 1.2]] },
        { layer: 9, quality: 'Multicolor', mazebuffId: 35101204, properties: [['ExtraFrontPowerAddedRatio1', 2.4], ['ExtraBackPowerAddedRatio1', 2.4]] },
        ],
    ],
    [
        1013,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35101301, properties: [] },
        { layer: 3, quality: 'Silver', mazebuffId: 35101302, properties: [] },
        { layer: 4, quality: 'Gold', mazebuffId: 35101303, properties: [] },
        { layer: 5, quality: 'Multicolor', mazebuffId: 35101304, properties: [] },
        ],
    ],
    [
        2001,
        [
        { layer: 3, quality: 'Copper', mazebuffId: 35200101, properties: [['ExtraInsertDamageAddedRatio1', 0.2]] },
        { layer: 5, quality: 'Silver', mazebuffId: 35200102, properties: [['ExtraInsertDamageAddedRatio1', 0.5]] },
        { layer: 7, quality: 'Gold', mazebuffId: 35200103, properties: [['ExtraInsertDamageAddedRatio1', 0.8]] },
        { layer: 9, quality: 'Multicolor', mazebuffId: 35200104, properties: [['ExtraInsertDamageAddedRatio1', 1.2]] },
        ],
    ],
    [
        2002,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35200201, properties: [['ExtraFrontPowerAddedRatio1', 0.2], ['ExtraBackPowerAddedRatio1', 0.2]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35200202, properties: [['ExtraFrontPowerAddedRatio1', 0.6], ['ExtraBackPowerAddedRatio1', 0.6]] },
        { layer: 6, quality: 'Gold', mazebuffId: 35200203, properties: [['ExtraFrontPowerAddedRatio1', 1.5], ['ExtraBackPowerAddedRatio1', 1.5]] },
        { layer: 9, quality: 'Multicolor', mazebuffId: 35200204, properties: [['ExtraFrontPowerAddedRatio1', 3.2], ['ExtraBackPowerAddedRatio1', 3.2]] },
        ],
    ],
    [
        2003,
        [
        { layer: 3, quality: 'Copper', mazebuffId: 35200301, properties: [['ExtraLuckChance', 0.12], ['ExtraLuckDamage', 0.12]] },
        { layer: 5, quality: 'Silver', mazebuffId: 35200302, properties: [['ExtraLuckChance', 0.24], ['ExtraLuckDamage', 0.24]] },
        { layer: 7, quality: 'Gold', mazebuffId: 35200303, properties: [['ExtraLuckChance', 0.36], ['ExtraLuckDamage', 0.36]] },
        { layer: 9, quality: 'Multicolor', mazebuffId: 35200304, properties: [['ExtraLuckChance', 0.6], ['ExtraLuckDamage', 0.6]] },
        ],
    ],
    [
        2004,
        [
        { layer: 3, quality: 'Copper', mazebuffId: 35200401, properties: [['ExtraUltraDamageAddedRatio1', 0.2]] },
        { layer: 5, quality: 'Silver', mazebuffId: 35200402, properties: [['ExtraUltraDamageAddedRatio1', 0.4]] },
        { layer: 7, quality: 'Gold', mazebuffId: 35200403, properties: [['ExtraUltraDamageAddedRatio1', 0.8]] },
        { layer: 10, quality: 'Multicolor', mazebuffId: 35200404, properties: [['ExtraUltraDamageAddedRatio1', 2.4]] },
        ],
    ],
    [
        2005,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35200501, properties: [['ExtraHealAddedRatio', 0.2], ['All:ExtraHPAddedRatio1', 0.12]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35200502, properties: [['ExtraHealAddedRatio', 0.4], ['All:ExtraHPAddedRatio1', 0.12]] },
        { layer: 6, quality: 'Gold', mazebuffId: 35200503, properties: [['ExtraHealAddedRatio', 0.6], ['All:ExtraHPAddedRatio1', 0.12], ['All:ExtraAllDamageTypeAddedRatio1', 0.6]] },
        ],
    ],
    [
        2006,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35200601, properties: [['ExtraHPAddedRatio1', 0.1], ['ExtraAllDamageTypeAddedRatio1', 0.1]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35200602, properties: [['ExtraHPAddedRatio1', 0.2], ['ExtraAllDamageTypeAddedRatio1', 0.25]] },
        { layer: 6, quality: 'Gold', mazebuffId: 35200603, properties: [['ExtraHPAddedRatio1', 0.3], ['ExtraAllDamageTypeAddedRatio1', 0.4]] },
        { layer: 8, quality: 'Gold', mazebuffId: 35200604, properties: [['ExtraHPAddedRatio1', 0.45], ['ExtraAllDamageTypeAddedRatio1', 0.6]] },
        ],
    ],
    [
        2007,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35200701, properties: [['ExtraFrontPowerAddedRatio1', 0.2], ['ExtraBackPowerAddedRatio1', 0.2]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35200702, properties: [['ExtraFrontPowerAddedRatio1', 0.6], ['ExtraBackPowerAddedRatio1', 0.6]] },
        { layer: 6, quality: 'Gold', mazebuffId: 35200703, properties: [['ExtraFrontPowerAddedRatio1', 1.2], ['ExtraBackPowerAddedRatio1', 1.2]] },
        { layer: 8, quality: 'Multicolor', mazebuffId: 35200704, properties: [['ExtraFrontPowerAddedRatio1', 2.5], ['ExtraBackPowerAddedRatio1', 2.5]] },
        ],
    ],
    [
        2008,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35200801, properties: [['ExtraDOTDamageAddedRatio1', 0.3]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35200802, properties: [['ExtraDOTDamageAddedRatio1', 0.8]] },
        { layer: 6, quality: 'Gold', mazebuffId: 35200803, properties: [['ExtraDOTDamageAddedRatio1', 2]] },
        ],
    ],
    [
        2009,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35200901, properties: [] },
        { layer: 3, quality: 'Silver', mazebuffId: 35200902, properties: [] },
        { layer: 4, quality: 'Gold', mazebuffId: 35200903, properties: [] },
        { layer: 5, quality: 'Gold', mazebuffId: 35200904, properties: [] },
        ],
    ],
    [
        2010,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35201001, properties: [['ExtraShieldAddedRatio', 0.2], ['All:ExtraAllDamageTypeAddedRatio1', 0.12]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35201002, properties: [['ExtraShieldAddedRatio', 0.4], ['All:ExtraAllDamageTypeAddedRatio1', 0.4]] },
        ],
    ],
    [
        2011,
        [
        { layer: 2, quality: 'Copper', mazebuffId: 35201101, properties: [['ExtraSpeedAddedRatio1', 0.12], ['All:ExtraSpeedAddedRatio1', 0.12]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35201102, properties: [['ExtraSpeedAddedRatio1', 0.24], ['All:ExtraSpeedAddedRatio1', 0.24]] },
        { layer: 6, quality: 'Gold', mazebuffId: 35201103, properties: [['ExtraSpeedAddedRatio1', 0.4], ['All:ExtraSpeedAddedRatio1', 0.4]] },
        { layer: 8, quality: 'Multicolor', mazebuffId: 35201104, properties: [['ExtraSpeedAddedRatio1', 0.8], ['All:ExtraSpeedAddedRatio1', 0.8]] },
        ],
    ],
    [
        2012,
        [
        { layer: 3, quality: 'Copper', mazebuffId: 35201201, properties: [['ExtraLuckChance', 0.08]] },
        { layer: 4, quality: 'Silver', mazebuffId: 35201202, properties: [['ExtraLuckChance', 0.16]] },
        { layer: 5, quality: 'Gold', mazebuffId: 35201203, properties: [['ExtraLuckChance', 0.24]] },
        { layer: 7, quality: 'Multicolor', mazebuffId: 35201204, properties: [['ExtraLuckChance', 0.4]] },
        ],
    ],
    [
        3001,
        [
        { layer: 1, quality: 'Unique', mazebuffId: 35300101, properties: [] },
        ],
    ],
    [
        3002,
        [
        { layer: 1, quality: 'Unique', mazebuffId: 35300201, properties: [] },
        ],
    ],
    [
        3003,
        [
        { layer: 1, quality: 'Unique', mazebuffId: 35300301, properties: [] },
        ],
    ],
    [
        3004,
        [
        { layer: 1, quality: 'Unique', mazebuffId: 35300401, properties: [] },
        ],
    ],
    [
        3005,
        [
        { layer: 1, quality: 'Unique', mazebuffId: 35300501, properties: [] },
        ],
    ],
    [
        3006,
        [
        { layer: 1, quality: 'Unique', mazebuffId: 35300601, properties: [] },
        ],
    ],
    [
        3007,
        [
        { layer: 1, quality: 'Unique', mazebuffId: 35300701, properties: [] },
        ],
    ],
]);

/** 取当前人数命中的最高图层；没达到第一层返回 undefined。 */
export function gridFightTraitTier(traitId: number, count: number): GridFightTraitLayerDef | undefined {
    const rows = gridFightTraitLayers.get(traitId);
    if (!rows) return undefined;
    let hit: GridFightTraitLayerDef | undefined;
    for (const row of rows) if (row.layer <= count) hit = row;
    return hit;
}

/** 一条已激活的羁绊：人数、分组、命中的图层（没到第一层时 \`tier\` 为 undefined）。 */
export interface GridFightActiveTrait {
    readonly traitId: number;
    readonly count: number;
    readonly group: GridFightTraitGroup;
    readonly tier?: GridFightTraitLayerDef;
}

export function gridFightActiveTraits(roleIds: readonly number[]): GridFightActiveTrait[] {
    const counts = new Map<number, number>();
    for (const roleId of new Set(roleIds)) {
        for (const traitId of gridFightTraitsOfRole(roleId)) {
            counts.set(traitId, (counts.get(traitId) ?? 0) + 1);
        }
    }
    const active: GridFightActiveTrait[] = [];
    for (const [traitId, count] of counts) {
        const group = gridFightTraitGroup(traitId);
        if (!group) continue;
        const tier = gridFightTraitTier(traitId, count);
        active.push(tier ? { traitId, count, group, tier } : { traitId, count, group });
    }
    return active.sort((a, b) => b.count - a.count || a.traitId - b.traitId);
}
