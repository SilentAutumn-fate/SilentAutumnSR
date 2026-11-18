import { CmdID } from '../../../proto/cmdId';
import type { NetSession } from '../../NetSession';
import { buildLineup } from '../../manager/avatar_mgr';

/**
 * `/refill` — port of pearl-sr `gameserver/src/commands/refill.zig`.
 *
 * The reference answers "Refill skill point" and immediately pushes a fresh
 * `SyncLineupNotify`; the client reads the lineup's `sp_bar` values and treats
 * them as a full technique-point / skill-point refill.
 *
 * pearl-sr rebuilds that lineup from `config.json` with hard-coded
 * `cur_sp = max_sp = 10000`. This port's lineup comes from the freesr profile
 * (see `manager/avatar_mgr.buildLineup`), so the refill has to be applied to the
 * profile itself: every avatar's `sp_value` is raised to its `sp_max` before the
 * lineup is built, which is what makes the notify report full skill points.
 *
 * The reference's `LineupManager.createLineup()` call is also what selects the
 * party for the *next* battle, so using `buildLineup` here keeps the party in
 * step with `session.lineups` (it writes slot 0 as a side effect).
 */

/** Fallback when a profile entry has no `sp_max` (mirrors the loader default). */
const DEFAULT_SP = 10000;

const REFILL_REPLY = 'Refill skill point\n';

/**
 * Refill every owned avatar's skill points. NOTE: this is an in-memory rewrite
 * of the freesr profile only — `DataService` exposes no way to write
 * `freesr-data.json` back to disk (only `saveDataInGame` / `saveVersion`), and
 * the reference persists nothing either, so nothing is written here.
 */
export async function refillCommand(session: NetSession): Promise<string> {
    for (const avatar of Object.values(session.data.getDataJson().avatars)) {
        avatar.sp_value = avatar.sp_max > 0 ? avatar.sp_max : DEFAULT_SP;
    }

    await session.sendMessage(CmdID.CmdSyncLineupNotify, { lineup: buildLineup(session) });

    return REFILL_REPLY;
}
