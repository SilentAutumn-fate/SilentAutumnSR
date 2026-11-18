import * as path from 'path';

import { loadContentPackages, parseContentPackages } from './content-packages';

const RESOURCES = path.resolve(__dirname, 'resources');

it('loads the official content package list', () => {
    const table = loadContentPackages(RESOURCES);
    expect(table).not.toBeNull();
    const ids = table!.packages.map((entry) => entry.contentId);
    expect(ids.length).toBe(49);
    // The two packages the old hand-written list stopped short of.
    expect(ids).toContain(200013);
    expect(ids).toContain(150134);
    expect(table!.curContentId).toBe(0);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    // GuideConditions sub-missions are merged into the mission handler.
    expect(table!.guideSubMissionIds).toContain(802330102);
    expect(table!.guideSubMissionIds.length).toBe(13);
});

it('rejects malformed content package tables', () => {
    expect(() => parseContentPackages({ clientVersion: 'x', packages: [], guideSubMissionIds: [] })).toThrow(/must not be empty/);
    expect(() => parseContentPackages({ clientVersion: 'x', packages: [{ contentId: 0 }], guideSubMissionIds: [] })).toThrow(/uint32/);
    expect(() => parseContentPackages({ clientVersion: 'x', packages: [{ contentId: 1 }] })).toThrow(/guideSubMissionIds/);
    expect(() => parseContentPackages({ packages: [{ contentId: 1 }], guideSubMissionIds: [] })).toThrow(/clientVersion/);
});

it('deduplicates rows and keeps the first occurrence', () => {
    const table = parseContentPackages({
        clientVersion: '4.6.54',
        packages: [{ contentId: 200013 }, { contentId: 200001 }, { contentId: 200013 }],
        guideSubMissionIds: [802330102, 802330102, 804611401],
    });
    expect(table.packages.map((entry) => entry.contentId)).toEqual([200001, 200013]);
    expect(table.guideSubMissionIds).toEqual([802330102, 804611401]);
});
