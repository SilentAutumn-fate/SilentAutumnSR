import * as fs from 'fs';
import * as path from 'path';

/**
 * Activity schedule entries handed to the client in
 * `GetActivityScheduleConfigScRsp.schedule_data`.
 *
 * The resource stores the module ID as panelId. The handler writes it to
 * wire field 5, which the client uses as its schedule lookup key.
 *
 * The rows are generated from the official `ActivityConfig` export. A fully
 * unlocked account keeps every activity module open, so the rows that carry
 * an `ActivityModuleIDList` are emitted (including the tourn activities
 * 60018/60022/60024 and the early-access rows 80031/50134 behind content
 * 200013 / 150134). The Currency Wars S2 row comes from the local resident config.
 */
export interface ActivityScheduleEntry {
    activityId: number;
    panelId: number;
}

export interface ActivityScheduleTable {
    clientVersion: string;
    source: Record<string, unknown>;
    schedules: ActivityScheduleEntry[];
}

function uint32(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 0xffffffff) {
        throw new Error(`activity-schedules.json: ${field} must be a positive uint32`);
    }
    return value;
}

export function parseActivitySchedules(input: unknown): ActivityScheduleTable {
    const value = input as ActivityScheduleTable;
    if (!value || typeof value.clientVersion !== 'string' || !value.clientVersion.trim()) {
        throw new Error('activity-schedules.json requires clientVersion');
    }
    if (!Array.isArray(value.schedules)) throw new Error('activity-schedules.json: schedules must be an array');
    const seen = new Set<string>();
    const schedules: ActivityScheduleEntry[] = [];
    for (const entry of value.schedules) {
        const row = entry as ActivityScheduleEntry;
        if (!row || typeof row !== 'object') {
            throw new Error('activity-schedules.json: schedules must only contain objects');
        }
        const activityId = uint32(row.activityId, 'schedules[].activityId');
        const panelId = uint32(row.panelId, `schedules[].panelId (${activityId})`);
        const key = `${activityId}:${panelId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        schedules.push({ activityId, panelId });
    }
    schedules.sort((a, b) => a.activityId - b.activityId);
    if (schedules.length === 0) throw new Error('activity-schedules.json: schedules must not be empty');
    return {
        clientVersion: value.clientVersion.trim(),
        source: (value.source as Record<string, unknown>) ?? {},
        schedules,
    };
}

export function loadActivitySchedules(directory: string): ActivityScheduleTable | null {
    const file = path.join(directory, 'activity-schedules.json');
    if (!fs.existsSync(file)) return null;
    try {
        return parseActivitySchedules(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
        throw new Error(`Cannot load ${file}: ${(error as Error).message}`);
    }
}
