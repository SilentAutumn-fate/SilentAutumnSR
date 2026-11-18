import * as path from 'path';
import { configManager } from '../manager/config_mgr';
import { CmdID } from '../../proto/cmdId';
import { loadActivitySchedules, parseActivitySchedules } from '../../data/activity-schedules';
import { onGetActivityScheduleConfigCsReq } from './activity';

/**
 * The Divergent Universe guide entry and its resident activity panel only exist
 * once the client received a schedule row for the activity, so these tests pin
 * both the generated table and the response the handler builds from it.
 */

const resources = path.resolve(__dirname, '..', '..', 'data', 'resources');

beforeAll(() => configManager.load());

interface Sent {
    cmdId: number;
    body: any;
}

function fakeSession() {
    const sent: Sent[] = [];
    const session: any = {
        config: configManager,
        sendRsp: async (cmdId: number, body: any) => {
            sent.push({ cmdId, body });
        },
    };
    return { session, sent };
}

describe('permanent gameplay activity schedule', () => {
    it('ships the activity-module schedule rows generated from ActivityConfig', () => {
        const table = loadActivitySchedules(resources);
        expect(table).not.toBeNull();
        expect(table!.clientVersion).toBe('OSBETAWin4.6.54');
        // Full-progress model: every ActivityConfig row with an activity module.
        expect(table!.schedules).toHaveLength(514);
        const byActivity = new Map(table!.schedules.map((entry) => [entry.activityId, entry.panelId]));
        // The local table uses semantic IDs, independently of the wire aliases.
        expect(byActivity.get(60018)).toBe(6001801);
        expect(byActivity.get(60022)).toBe(6002201);
        expect(byActivity.get(60024)).toBe(6002401);
        expect(byActivity.get(71005)).toBe(7100501);
        expect(table!.schedules.filter((entry) => entry.activityId === 71101).map((entry) => entry.panelId))
            .toEqual([7110101, 171002]);
        // Early-access activity that carries content 200013 (千星城 / 二相乐园).
        expect(byActivity.get(80031)).toBe(8003101);
        expect(byActivity.get(50134)).toBe(5013401);
    });

    it('rejects malformed tables', () => {
        expect(() => parseActivitySchedules(null)).toThrow(/clientVersion/);
        expect(() => parseActivitySchedules({ clientVersion: 'x', schedules: [] })).toThrow(/must not be empty/);
        expect(() =>
            parseActivitySchedules({ clientVersion: 'x', schedules: [{ activityId: 0, panelId: 60018 }] }),
        ).toThrow(/activityId/);
        expect(() => parseActivitySchedules({ clientVersion: 'x', schedules: [{ activityId: 1 }] })).toThrow(/panelId/);
    });

    it('returns null when the generated table is absent', () => {
        expect(loadActivitySchedules(path.resolve(__dirname, '..', '..', 'data', 'missing'))).toBeNull();
    });

    it('answers GetActivityScheduleConfig with only the current Currency Wars season in progress', async () => {
        const { session, sent } = fakeSession();
        await onGetActivityScheduleConfigCsReq({} as any, session);
        expect(sent).toHaveLength(1);
        expect(sent[0].cmdId).toBe(CmdID.CmdGetActivityScheduleConfigScRsp);
        expect(sent[0].body.retcode).toBe(0);
        const rows = sent[0].body.scheduleData;
        expect(rows).toHaveLength(514);
        const now = Math.floor(Date.now() / 1000);
        for (const row of rows) {
            expect(row.beginTime).toBeLessThan(now);
            if (row.panelId >= 71001 && row.panelId <= 71005) {
                expect(row.endTime).toBeLessThan(now);
            } else {
                expect(row.endTime).toBeGreaterThan(now);
            }
        }
        expect(rows).toContainEqual(expect.objectContaining({ activityId: 7110101, panelId: 71101 }));
        expect(rows).toContainEqual(expect.objectContaining({ activityId: 171002, panelId: 71101 }));
        // Wire mapping proven by `ScheduleModule._OnCmdGetActivityScheduleConfigScRsp`
        // (0xEAD7030): field 5 = module id, field 13 = activity id.
        const tourn = rows.find((row: any) => row.activityId === 6002401);
        expect(tourn).toMatchObject({ activityId: 6002401, panelId: 60024 });
    });
});
