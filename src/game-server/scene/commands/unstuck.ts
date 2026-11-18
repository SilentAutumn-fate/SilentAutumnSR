import type { NetSession } from '../../NetSession';
import { buildLineup } from '../../manager/avatar_mgr';
import { createScene } from '../../manager/scene_mgr';
import { ENTER_SCENE_REASON_DIMENSION_MERGE, pushScene } from './tp';

/**
 * `/unstuck` — port of pearl-sr `gameserver/src/commands/unstuck.zig`.
 *
 * The reference hard-codes one destination and pushes it with
 * `ENTER_SCENE_REASON_DIMENSION_MERGE`:
 *
 *     SceneManager.createScene(20421, 20421001, 2042101, 2042106)
 *
 * Those four ids are used verbatim here through `scene_mgr.createScene` rather
 * than through `buildScene`, because the whole point of the reference command is
 * the **specific teleport anchor** 2042106 (the entry's own anchor 2042101 is a
 * different spot on the same map), and `buildScene`'s fixed contract
 * `{ entryId, avatarIds, gameModeType }` cannot express it. `/tp` uses
 * `buildScene`; this one needs the raw builder.
 *
 * The reference sends no chat reply at all — the player sees the scene change —
 * so this command returns `undefined` and the dispatcher reports
 * `{ handled: true }` with no reply text.
 */

/** `unstuck.zig` literals: plane / floor / entry / teleport id of the safe spot. */
const UNSTUCK_PLANE_ID = 20421;
const UNSTUCK_FLOOR_ID = 20421001;
const UNSTUCK_ENTRY_ID = 2042101;
const UNSTUCK_TELEPORT_ID = 2042106;

/** Move the player to the fixed "unstuck" spawn. */
export async function unstuckCommand(session: NetSession): Promise<undefined> {
    const lineup = buildLineup(session);
    const avatarIds = (lineup.avatarList ?? []).map((avatar) => avatar.id);

    const sceneInfo = createScene(
        UNSTUCK_PLANE_ID,
        UNSTUCK_FLOOR_ID,
        UNSTUCK_ENTRY_ID,
        UNSTUCK_TELEPORT_ID,
        avatarIds,
    );

    await pushScene(
        session,
        { sceneInfo, planeId: UNSTUCK_PLANE_ID, floorId: UNSTUCK_FLOOR_ID },
        ENTER_SCENE_REASON_DIMENSION_MERGE,
        lineup,
    );

    return undefined;
}
