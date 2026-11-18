import { ConfigManager } from './config_mgr';

it('keeps entrance spawn anchors distinct from an identically numbered map teleport', () => {
    const config = new ConfigManager();
    config.mapEntrance.set(2058102, {
        ID: 2058102, PlaneID: 20581, FloorID: 20581001,
        StartGroupID: 155, StartAnchorID: 1,
    } as any);
    const entrySpawn = { groupId: 155, anchorId: 1, teleportId: 0 } as any;
    const checkpoint = { groupId: 160, anchorId: 2, teleportId: 2058102 } as any;
    config.sceneConfig.set(2058102, { planeID: 20581, entryID: 2058102,
        teleports: [entrySpawn, checkpoint], props: [], monsters: [] });
    expect(config.findTeleport(20581001, 2058102, 0)).toBe(entrySpawn);
    expect(config.findTeleport(20581001, 2058102, 2058102)).toBe(checkpoint);
});

it('retains legacy entry-numbered default teleports when no spawn anchor is specified', () => {
    const config = new ConfigManager();
    config.mapEntrance.set(123, { ID: 123, FloorID: 456 } as any);
    const other = { teleportId: 42 } as any;
    const legacy = { teleportId: 123 } as any;
    config.sceneConfig.set(123, { planeID: 1, entryID: 123,
        teleports: [other, legacy], props: [], monsters: [] });
    expect(config.findTeleport(456, 123, 0)).toBe(legacy);
});
