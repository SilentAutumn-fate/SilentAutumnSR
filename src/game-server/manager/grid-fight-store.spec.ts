import * as fs from 'fs';
import { loadRun, removeRun, saveRun, storeFile, temporaryStoreDir } from './grid-fight-store';

const record = (uniqueId: number) => ({
    run: { uniqueId, divisionId: 2, divisionId_14: 20920, NAGDJGMMCBE: [] } as any,
    nextRunId: uniqueId + 1,
    nextRoleId: 7,
    nextBattleId: 10002,
    bonfireHealed: true,
    awaitingPrepare: false,
    savedAt: 0,
});

describe('currency war run store', () => {
    const dirs: string[] = [];
    const scratch = () => {
        const dir = temporaryStoreDir();
        dirs.push(dir);
        return dir;
    };

    afterAll(() => {
        for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    });

    it('keeps runs apart per player uid', () => {
        const dir = scratch();
        saveRun(1337, record(11), dir);
        saveRun(2001, record(22), dir);
        expect(loadRun(1337, dir)?.run.uniqueId).toBe(11);
        expect(loadRun(2001, dir)?.run.uniqueId).toBe(22);
        expect(loadRun('9999', dir)).toBeUndefined();
    });

    it('stores the bookkeeping the client cannot rebuild', () => {
        const dir = scratch();
        saveRun('1337', record(5), dir);
        const saved = loadRun(1337, dir);
        expect(saved).toMatchObject({
            nextRunId: 6,
            nextRoleId: 7,
            nextBattleId: 10002,
            bonfireHealed: true,
            awaitingPrepare: false,
        });
        expect(saved?.savedAt).toBeGreaterThan(0);
    });

    it('overwrites the previous save of the same player', () => {
        const dir = scratch();
        saveRun(1337, record(5), dir);
        saveRun(1337, record(6), dir);
        expect(loadRun(1337, dir)?.run.uniqueId).toBe(6);
    });

    it('removes a settled run and keeps the other players', () => {
        const dir = scratch();
        saveRun(1337, record(5), dir);
        saveRun(2001, record(6), dir);
        removeRun(1337, dir);
        expect(loadRun(1337, dir)).toBeUndefined();
        expect(loadRun(2001, dir)?.run.uniqueId).toBe(6);
        // Removing twice is a no-op rather than an error.
        removeRun(1337, dir);
    });

    it('treats a missing or damaged file as "no saved run"', () => {
        const dir = scratch();
        expect(loadRun(1337, dir)).toBeUndefined();
        fs.writeFileSync(storeFile(dir), '{not json');
        expect(loadRun(1337, dir)).toBeUndefined();
        // A damaged file must not stop a new run from being saved.
        saveRun(1337, record(9), dir);
        expect(loadRun(1337, dir)?.run.uniqueId).toBe(9);
    });

    it('leaves no temporary file behind after a save', () => {
        const dir = scratch();
        saveRun(1337, record(5), dir);
        expect(fs.readdirSync(dir)).toEqual(['grid-fight-runs.json']);
    });
});
