import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { HandlerEntry } from './types';

/**
 * Schedule window handed to the client. The activity panel only cares about the
 * entry being open, so a one-year window around "now" keeps the Divergent
 * Universe activities permanently available.
 */
const SCHEDULE_WINDOW_SECONDS = 365 * 24 * 60 * 60;

/**
 * `ScheduleModule._OnCmdGetActivityScheduleConfigScRsp` (RVA 0xEAD7030) builds
 * each `ScheduleData` from the wire entry like this:
 *   activityId <- field 13 (`[entry+0x18]`, proto `panel_id`)
 *   moduleId   <- field 5  (`[entry+0x1c]`, proto `activity_id`)
 * The table uses semantic IDs, so swap the protobuf aliases when encoding.
 */
export async function onGetActivityScheduleConfigCsReq(
    _req: starrail.GetActivityScheduleConfigCsReq,
    session: NetSession,
): Promise<void> {
    const schedules = session.config.activitySchedules?.schedules ?? [];
    const nowSeconds = Math.floor(Date.now() / 1000);
    const scheduleData = schedules.map((entry) => {
        // Previous Currency Wars periods are historical. The client's resident
        // panel selector treats every overlapping period as a current candidate.
        const isPreviousGridFightPeriod = entry.activityId >= 71001 && entry.activityId <= 71005;
        const endTime = isPreviousGridFightPeriod
            ? nowSeconds - 1
            : nowSeconds + SCHEDULE_WINDOW_SECONDS;
        return {
            activityId: entry.panelId,
            panelId: entry.activityId,
            beginTime: nowSeconds - SCHEDULE_WINDOW_SECONDS,
            endTime,
        };
    });
    // protobufjs keeps the generated bundle in camelCase, so snake_case keys are
    // silently dropped when the message is built.
    await session.sendRsp(CmdID.CmdGetActivityScheduleConfigScRsp, {
        retcode: 0,
        scheduleData,
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetActivityScheduleConfigCsReq, action: onGetActivityScheduleConfigCsReq },
];
