// 后排装备（`GridFightBackEquipment`，4.7 线上游表，4.6.54 镜像没有）。
// 33 个后排角色各 5 级，`EquipmentID` 是 23000 段的遗器 id，
// `OwnerGeneralPropertyList` / `AllMemberGeneralPropertyList` 是本人 / 全队的属性加成。
// 尚未接进战斗：客户端如何消费后排装备未验证（沿用图鉴黑屏教训）。

export type GridFightPropertyBonus = readonly [property: string, value: number];

export interface GridFightBackEquipmentEntry {
    level: number;
    equipmentId: number;
    ownerProperties: readonly GridFightPropertyBonus[];
    allMemberProperties: readonly GridFightPropertyBonus[];
}

export const gridFightBackEquipmentLevels = 5;

export const gridFightBackEquipment = new Map<number, readonly GridFightBackEquipmentEntry[]>([
    [1003, [
        { level: 1, equipmentId: 23000, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]], allMemberProperties: [] },
        { level: 2, equipmentId: 23000, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]], allMemberProperties: [] },
        { level: 3, equipmentId: 23000, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 4, equipmentId: 23000, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]], allMemberProperties: [] },
        { level: 5, equipmentId: 23000, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
    ]],
    [1005, [
        { level: 1, equipmentId: 23006, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23006, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23006, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23006, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23006, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1006, [
        { level: 1, equipmentId: 23007, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.04]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.04]] },
        { level: 2, equipmentId: 23007, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 3, equipmentId: 23007, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.08]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.08]] },
        { level: 4, equipmentId: 23007, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.1]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.1]] },
        { level: 5, equipmentId: 23007, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
    ]],
    [1014, [
        { level: 1, equipmentId: 23045, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23045, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23045, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23045, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23045, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1112, [
        { level: 1, equipmentId: 23016, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23016, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23016, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23016, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23016, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1203, [
        { level: 1, equipmentId: 23008, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 2, equipmentId: 23008, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]] },
        { level: 3, equipmentId: 23008, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
        { level: 4, equipmentId: 23008, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]] },
        { level: 5, equipmentId: 23008, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]] },
    ]],
    [1205, [
        { level: 1, equipmentId: 23009, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23009, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23009, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23009, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23009, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1208, [
        { level: 1, equipmentId: 23011, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 2, equipmentId: 23011, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]] },
        { level: 3, equipmentId: 23011, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
        { level: 4, equipmentId: 23011, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]] },
        { level: 5, equipmentId: 23011, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]] },
    ]],
    [1209, [
        { level: 1, equipmentId: 23012, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]], allMemberProperties: [] },
        { level: 2, equipmentId: 23012, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]], allMemberProperties: [] },
        { level: 3, equipmentId: 23012, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 4, equipmentId: 23012, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]], allMemberProperties: [] },
        { level: 5, equipmentId: 23012, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
    ]],
    [1212, [
        { level: 1, equipmentId: 23014, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23014, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23014, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23014, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23014, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1217, [
        { level: 1, equipmentId: 23017, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 2, equipmentId: 23017, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]] },
        { level: 3, equipmentId: 23017, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
        { level: 4, equipmentId: 23017, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]] },
        { level: 5, equipmentId: 23017, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]] },
    ]],
    [1221, [
        { level: 1, equipmentId: 23030, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23030, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23030, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23030, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23030, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1225, [
        { level: 1, equipmentId: 23035, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 2, equipmentId: 23035, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]] },
        { level: 3, equipmentId: 23035, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
        { level: 4, equipmentId: 23035, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]] },
        { level: 5, equipmentId: 23035, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]] },
    ]],
    [1302, [
        { level: 1, equipmentId: 23018, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23018, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23018, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23018, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23018, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1303, [
        { level: 1, equipmentId: 23019, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 2, equipmentId: 23019, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]] },
        { level: 3, equipmentId: 23019, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
        { level: 4, equipmentId: 23019, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]] },
        { level: 5, equipmentId: 23019, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]] },
    ]],
    [1306, [
        { level: 1, equipmentId: 23021, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 2, equipmentId: 23021, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]] },
        { level: 3, equipmentId: 23021, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
        { level: 4, equipmentId: 23021, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]] },
        { level: 5, equipmentId: 23021, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]] },
    ]],
    [1307, [
        { level: 1, equipmentId: 23022, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23022, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23022, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23022, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23022, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1309, [
        { level: 1, equipmentId: 23026, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.04]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.04]] },
        { level: 2, equipmentId: 23026, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 3, equipmentId: 23026, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.08]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.08]] },
        { level: 4, equipmentId: 23026, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.1]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.1]] },
        { level: 5, equipmentId: 23026, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
    ]],
    [1313, [
        { level: 1, equipmentId: 23034, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 2, equipmentId: 23034, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]] },
        { level: 3, equipmentId: 23034, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
        { level: 4, equipmentId: 23034, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]] },
        { level: 5, equipmentId: 23034, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]] },
    ]],
    [1314, [
        { level: 1, equipmentId: 23028, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23028, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23028, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23028, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23028, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1321, [
        { level: 1, equipmentId: 23050, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.04]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.04]] },
        { level: 2, equipmentId: 23050, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 3, equipmentId: 23050, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.08]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.08]] },
        { level: 4, equipmentId: 23050, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.1]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.1]] },
        { level: 5, equipmentId: 23050, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
    ]],
    [1403, [
        { level: 1, equipmentId: 23038, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.04]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.04]] },
        { level: 2, equipmentId: 23038, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 3, equipmentId: 23038, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.08]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.08]] },
        { level: 4, equipmentId: 23038, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.1]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.1]] },
        { level: 5, equipmentId: 23038, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
    ]],
    [1404, [
        { level: 1, equipmentId: 23039, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23039, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23039, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23039, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23039, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1405, [
        { level: 1, equipmentId: 23041, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23041, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23041, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23041, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23041, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1412, [
        { level: 1, equipmentId: 23048, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 2, equipmentId: 23048, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]] },
        { level: 3, equipmentId: 23048, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
        { level: 4, equipmentId: 23048, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]] },
        { level: 5, equipmentId: 23048, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]] },
    ]],
    [1413, [
        { level: 1, equipmentId: 23049, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.04]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.04]] },
        { level: 2, equipmentId: 23049, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 3, equipmentId: 23049, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.08]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.08]] },
        { level: 4, equipmentId: 23049, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.1]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.1]] },
        { level: 5, equipmentId: 23049, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
    ]],
    [1414, [
        { level: 1, equipmentId: 23051, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 2, equipmentId: 23051, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]] },
        { level: 3, equipmentId: 23051, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
        { level: 4, equipmentId: 23051, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]] },
        { level: 5, equipmentId: 23051, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]] },
    ]],
    [1502, [
        { level: 1, equipmentId: 23054, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.06]] },
        { level: 2, equipmentId: 23054, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.09]] },
        { level: 3, equipmentId: 23054, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]] },
        { level: 4, equipmentId: 23054, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.15]] },
        { level: 5, equipmentId: 23054, ownerProperties: [], allMemberProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]] },
    ]],
    [1504, [
        { level: 1, equipmentId: 23056, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23056, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23056, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23056, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23056, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1505, [
        { level: 1, equipmentId: 23058, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23058, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23058, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23058, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23058, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1507, [
        { level: 1, equipmentId: 23059, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23059, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23059, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23059, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23059, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1508, [
        { level: 1, equipmentId: 23061, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23061, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23061, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23061, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23061, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
    [1509, [
        { level: 1, equipmentId: 23062, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.12]], allMemberProperties: [] },
        { level: 2, equipmentId: 23062, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.18]], allMemberProperties: [] },
        { level: 3, equipmentId: 23062, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.24]], allMemberProperties: [] },
        { level: 4, equipmentId: 23062, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.3]], allMemberProperties: [] },
        { level: 5, equipmentId: 23062, ownerProperties: [["ExtraAllDamageTypeAddedRatio3",0.36]], allMemberProperties: [] },
    ]],
]);

export function gridFightBackEquipmentFor(
    roleId: number,
    level = 1,
): GridFightBackEquipmentEntry | undefined {
    const entries = gridFightBackEquipment.get(roleId);
    if (!entries) return undefined;
    const capped = Math.min(Math.max(Math.floor(level) || 1, 1), gridFightBackEquipmentLevels);
    return entries.find((entry) => entry.level === capped) ?? entries[entries.length - 1];
}

export function gridFightBackEquipmentOwners(): readonly number[] {
    return [...gridFightBackEquipment.keys()];
}
