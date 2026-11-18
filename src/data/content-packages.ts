import * as fs from 'fs';
import * as path from 'path';

/**
 * Content packages handed to the client in
 * `ContentPackageGetDataScRsp.data` / `ContentPackageSyncDataScNotify.data`.
 *
 * The 4.6.54 client consumes this payload in `EarlyAccessModule`
 * (`_OnContentPackageGetDataScRsp` / `_OnContentPackageSyncDataScNotify` ->
 * `_UpdateAllContent`). The nav map's world tabs are content-gated: a package
 * list that stops before 200013 (the 二相乐园/千星城 chapter) or 150134 keeps
 * those worlds off the 星轨航图, which is exactly the missing Astropolis node.
 *
 * Every row of the official `ContentPackageConfig` export is reported as
 * Finished, i.e. the server pretends the account finished every story chapter.
 * `curContentId` stays 0: no content is in the early-access "switching" state.
 */
export interface ContentPackage {
    contentId: number;
}

export interface ContentPackageTable {
    clientVersion: string;
    source: Record<string, unknown>;
    curContentId: number;
    packages: ContentPackage[];
    /** Sub-mission ids named by `ContentPackageConfig.GuideConditions`. */
    guideSubMissionIds: number[];
}

function uint32(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 0xffffffff) {
        throw new Error(`content-packages.json: ${field} must be a positive uint32`);
    }
    return value;
}

export function parseContentPackages(input: unknown): ContentPackageTable {
    const value = input as ContentPackageTable;
    if (!value || typeof value.clientVersion !== 'string' || !value.clientVersion.trim()) {
        throw new Error('content-packages.json requires clientVersion');
    }
    if (!Array.isArray(value.packages)) throw new Error('content-packages.json: packages must be an array');
    if (!Array.isArray(value.guideSubMissionIds)) {
        throw new Error('content-packages.json: guideSubMissionIds must be an array');
    }

    const seen = new Set<number>();
    const packages: ContentPackage[] = [];
    for (const entry of value.packages) {
        const row = entry as ContentPackage;
        if (!row || typeof row !== 'object') {
            throw new Error('content-packages.json: packages must only contain objects');
        }
        const contentId = uint32(row.contentId, 'packages[].contentId');
        if (seen.has(contentId)) continue;
        seen.add(contentId);
        packages.push({ contentId });
    }
    packages.sort((a, b) => a.contentId - b.contentId);
    if (packages.length === 0) throw new Error('content-packages.json: packages must not be empty');

    const guideIds: number[] = [];
    for (const id of value.guideSubMissionIds) {
        const subMissionId = uint32(id, 'guideSubMissionIds[]');
        if (!guideIds.includes(subMissionId)) guideIds.push(subMissionId);
    }

    const curContentId = value.curContentId ?? 0;
    if (!Number.isInteger(curContentId) || curContentId < 0 || curContentId > 0xffffffff) {
        throw new Error('content-packages.json: curContentId must be a uint32');
    }

    return {
        clientVersion: value.clientVersion.trim(),
        source: (value.source as Record<string, unknown>) ?? {},
        curContentId,
        packages,
        guideSubMissionIds: guideIds,
    };
}

export function loadContentPackages(directory: string): ContentPackageTable | null {
    const file = path.join(directory, 'content-packages.json');
    if (!fs.existsSync(file)) return null;
    try {
        return parseContentPackages(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
        throw new Error(`Cannot load ${file}: ${(error as Error).message}`);
    }
}
