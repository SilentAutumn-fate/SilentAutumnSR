import { CmdID } from '../../../proto/cmdId';
import type { NetSession } from '../../NetSession';
import { PositionJson, SceneJson } from '../../../data/loadDataInGame';
import { buildLineup } from '../../manager/avatar_mgr';
import { buildScene, collectEntityIds, collectMonsterEvents, leaderMotion } from '../../manager/scene_mgr';
import { parseU32 } from './value';
import { applySavedPropStates } from '../../manager/map-exploration';

/**
 * `/tp` — port of pearl-sr `gameserver/src/commands/tp.zig`, plus the scene
 * plumbing `/unstuck` reuses.
 *
 * Grammar (`/tp <entry_id> [plane_id] [floor_id]`) and every reply string are
 * the reference's, including the quirk that the message pearl-sr actually sends
 * is not the one it builds: `tp_msg` ("…, plane ID: 5") is computed and thrown
 * away, and the sent string formats the two *optional* ids with Zig's `{any}`,
 * which prints `null` when they are absent.
 *
 * DEVIATION (scene): pearl-sr calls `SceneManager.createScene(planeID, floorID,
 * entryID, 0)` with whatever the caller passed — plane and floor default to 0,
 * so a bare `/tp <entry>` builds a degenerate scene on plane 0 and the client
 * has nothing to load. This port uses `manager/scene_mgr.buildScene`, which
 * looks the entrance up in `MapEntrance.json` (the same source `onEnterScene`
 * uses) and picks the entry's own spawn anchor, so `/tp <entry>` lands where the
 * player expects. Explicit `plane_id` / `floor_id` arguments are still parsed
 * and still appear in the reply, but they cannot be forwarded: `buildScene`'s
 * contract takes only the entry id. A mismatch is logged.
 */

/** `EnterSceneReason.ENTER_SCENE_REASON_NONE`. */
export const ENTER_SCENE_REASON_NONE = 0;
/** `EnterSceneReason.ENTER_SCENE_REASON_DIMENSION_MERGE` (used by `/unstuck`). */
export const ENTER_SCENE_REASON_DIMENSION_MERGE = 4;

/** `SceneManager.createScene` hard-codes `game_mode_type = 1` for free roam. */
const FREE_ROAM_GAME_MODE_TYPE = 1;

/** `tp.zig` reply strings, verbatim. */
const MISSING_ARGUMENTS = 'Error: Missing arguments.\nUsage: /tp <entry_id> [plane_id] [floor_id]';
const INVALID_ENTRY_ID =
    'Error: Invalid entry ID. Please provide a valid unsigned 32-bit integer.';
const INVALID_PLANE_ID =
    'Error: Invalid plane ID. Please provide a valid unsigned 32-bit integer.';
const INVALID_FLOOR_ID =
    'Error: Invalid floor ID. Please provide a valid unsigned 32-bit integer.';

/** The scene we are about to hand the client, with the ids that describe it. */
export interface ScenePush {
    sceneInfo: any;
    planeId: number;
    floorId: number;
}

/**
 * Send `EnterSceneByServerScNotify` and record what the client was told.
 *
 * Order follows `handler/scene.ts` (`onEnterSceneCsReq`): notify first, then
 * `session.scene`, then the save file. The saved position is only overwritten
 * when the built scene actually placed the leader, so a scene with no matching
 * teleport anchor cannot wipe a good position.
 */
export async function pushScene(
    session: NetSession,
    scene: ScenePush,
    reason: number,
    lineup: any,
): Promise<void> {
    applySavedPropStates(scene.sceneInfo, session.data.getDataInGame().propStates);
    await session.sendMessage(CmdID.CmdEnterSceneByServerScNotify, {
        reason,
        lineup,
        scene: scene.sceneInfo,
    });

    session.scene = {
        planeId: scene.planeId,
        floorId: scene.floorId,
        entryId: scene.sceneInfo.entryId,
        leaderEntityId: scene.sceneInfo.leaderEntityId,
        gameModeType: scene.sceneInfo.gameModeType,
        entityIds: collectEntityIds(scene.sceneInfo),
        monsterEvents: collectMonsterEvents(scene.sceneInfo),
    };

    const dataInGame = session.data.getDataInGame();
    dataInGame.scene = new SceneJson(scene.planeId, scene.floorId, scene.sceneInfo.entryId);

    const motion = leaderMotion(scene.sceneInfo);
    if (motion?.pos) {
        dataInGame.position = new PositionJson(
            motion.pos.x ?? 0,
            motion.pos.y ?? 0,
            motion.pos.z ?? 0,
            motion.rot?.y ?? 0,
        );
    }

    await session.data.saveDataInGame();
}

/** `/tp <entry_id> [plane_id] [floor_id]`. */
export async function tpCommand(session: NetSession, args: string): Promise<string> {
    // Zig `std.mem.splitSequence(args, " ")`; JavaScript's `split` is identical,
    // including the rule that an empty buffer yields ONE empty field — which is
    // why the reference's "Missing arguments" branch is unreachable and why
    // `/tp` (no arguments) answers with the invalid-entry-id error instead.
    const fields = args.split(' ');
    let index = 0;
    const nextField = (): string | null => (index < fields.length ? fields[index++] : null);

    const entryText = nextField();
    if (entryText === null) return MISSING_ARGUMENTS;
    const entryId = parseU32(entryText);
    if (entryId === undefined) return INVALID_ENTRY_ID;

    let planeId: number | null = null;
    const planeText = nextField();
    if (planeText !== null) {
        const plane = parseU32(planeText);
        if (plane === undefined) return INVALID_PLANE_ID;
        planeId = plane;
    }

    let floorId: number | null = null;
    const floorText = nextField();
    if (floorText !== null) {
        const floor = parseU32(floorText);
        if (floor === undefined) return INVALID_FLOOR_ID;
        floorId = floor;
    }

    // The party: `LineupManager.createLineup()` in the reference, the persisted
    // roster through the shared avatar manager here. The same ids are used for
    // the lineup in the notify and for the actors in the scene, so the client
    // cannot end up showing a party that is not standing in the world.
    const lineup = buildLineup(session);
    const avatarIds = (lineup.avatarList ?? []).map((avatar) => avatar.id);

    const built = buildScene({ entryId, avatarIds, gameModeType: FREE_ROAM_GAME_MODE_TYPE });

    if (
        (planeId !== null && planeId !== built.planeId) ||
        (floorId !== null && floorId !== built.floorId)
    ) {
        console.log(
            `[command] /tp ${entryId}: plane/floor arguments (${planeId ?? '-'}/${floorId ?? '-'}) ` +
                `differ from MapEntrance (${built.planeId}/${built.floorId}); the entrance table wins`,
        );
    }

    await pushScene(session, built, ENTER_SCENE_REASON_NONE, lineup);

    // pearl-sr sends this AFTER its chat message; the dispatcher contract returns
    // the reply to the caller, which sends it once the command has finished, so
    // the notify always precedes the chat line here.
    return `Teleporting to entry ID: ${entryId} ${planeId ?? 'null'} ${floorId ?? 'null'}\n`;
}
