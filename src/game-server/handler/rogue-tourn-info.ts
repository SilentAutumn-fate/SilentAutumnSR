import type { TournAreaTable } from '../../data/rogue-tourn-areas';
import { lobbyTournAreas } from '../../data/rogue-tourn-areas';
import type { TournHandbook } from '../../data/rogue-tourn-handbook';
import { handbookUnlockIds } from '../../data/rogue-tourn-handbook';
import type { TournTalentTable } from '../../data/rogue-tourn-talents';
import { talentIds } from '../../data/rogue-tourn-talents';

/**
 * Builder for the `RogueTournQueryScRsp` roster payload (`RogueTournInfo`).
 *
 * Pure and side-effect free so the shape can be unit tested without a socket.
 * Every field is written under the obfuscated wire name taken from
 * `src/proto/StarRail.proto`; snake_case field names are written in the
 * camelCase form protobufjs expects on plain objects.
 *
 * What is real here:
 *   - area ids, difficulty tiers and layer plans come from the official 4.x
 *     ExcelOutput export (`rogue-tourn-areas.json`);
 *   - handbook ids come from the official formula/miracle/buff/collection
 *     tables (`rogue-tourn-handbook.json`).
 * What is a deliberate max-out:
 *   - the experience value is pushed far past the table total so the level bar
 *     clamps at the client's cap, and every level reward id is marked as taken;
 *   - verified handbook fields use the corresponding configuration ID pools.
 */
export const TOURN_MAX_LEVEL = 99;
export const TOURN_SATURATED_EXP = 1_000_000;
export const TOURN_WEEKLY_SCORE = 14_000;
const WEEK_SECONDS = 7 * 24 * 3600;

export interface TournInfoOptions {
    areas: TournAreaTable | null;
    handbook: TournHandbook | null;
    /** Permanent talent tree, embedded into the lobby payload (fields 9/10). */
    talents: TournTalentTable | null;
    /** Unix seconds; defaults to the current clock. */
    nowSeconds?: number;
}

/** Body of `RogueTournInfo` (field 5 of `RogueTournQueryScRsp`). */
export function buildTournInfo(opts: TournInfoOptions): Record<string, any> {
    const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
    const unlocked = handbookUnlockIds(opts.handbook);
    const areaList = lobbyTournAreas(opts.areas).map((area) => ({
        // 4 = is_taken_reward, 6 = completed, 9 = area_id, 10 = is_unlocked.
        // The two unnamed bools follow the 2.7 field order (completed, unlocked).
        isTakenReward: true,
        GNACLLNFHFD: false,
        areaId: area.areaId,
        FJKHIFDJMDB: true,
    }));

    const info: Record<string, any> = {
        // 6: the client copies this wrapper into `RogueTournSeasonData` and it
        // must be present: `_OnCmdRogueTournQueryScRsp` runs a class initializer
        // on the null branch (`0xEA42056`) that throws a NullReferenceException,
        // which aborts the whole response handling and leaves the entrance page
        // dead. Values mirror the season ids until the two uints are verified.
        DLDCFHHFMID: { GNIFODGCPAA: 1, JBKHIFHPGHM: 1 },
        // 11: season info (sub / main tournament id).
        HHFAAFOBKME: { FABMHMFNMDB: 1, HHAEEEOADOJ: 1 },
        // 14: weekly extra score. protobufjs camelCases `end_time`, so the key
        // must be `endTime`; `end_time` would be dropped silently.
        BFNHJIBDMOA: {
            JNBIIJCAKKB: 1,
            KBNNOPHGGIN: true,
            endTime: now + WEEK_SECONDS,
            JDPFPDECPEH: TOURN_WEEKLY_SCORE,
        },
        // 15: experience + claimed level rewards.
        DMFPCFCHHKE: {
            exp: TOURN_SATURATED_EXP,
            FKDNANDJLGK: Array.from({ length: TOURN_MAX_LEVEL }, (_value, index) => index + 1),
        },
    };
    if (areaList.length > 0) info.DANNIDIPFAL = areaList;
    if (unlocked.length > 0) {
        // SyncAll uses handbook entry IDs for miracles, separate from gameplay IDs.
        info.HAMKPLCBEBG = {
            PINNDKIJHFG: unlocked,
            DPEBCGBEJIG: opts.handbook!.buffIds,
            IFFMIDABNEE: opts.handbook!.formulaIds,
            DMFAGJOOGJM: unlocked,
            JOAAOEDAPPJ: unlocked,
            MMPPHJOONMI: opts.handbook!.handbookMiracleIds,
            JKKIABLFCPE: 0,
        };
    }
    // 9 / 10: the permanent talent tree also travels inside the lobby payload.
    // The client's entrance page reads `MDLPIFCHFPJ` (9) and the structurally
    // identical `KGPIEEKIEME` (10) straight out of `RogueTournInfo`; leaving
    // them empty leaves the talent panel blank even when the standalone
    // GetPermanentTalentInfo response is correct.
    const talentInfo = buildPermanentTalentInfo({ talents: opts.talents });
    if (talentInfo.JCOBJAMPOAL.BLHJIPBHHFO.length > 0) {
        info.MDLPIFCHFPJ = talentInfo;
        info.KGPIEEKIEME = {
            JCOBJAMPOAL: talentInfo.JCOBJAMPOAL,
            OFNIDAECPCJ: talentInfo.INJEKPLHPIF,
        };
    }
    return info;
}

/**
 * `RogueTournPermanentTalentInfo` — body of `MDLPIFCHFPJ`, used by
 * GetPermanentTalentInfo (field 7), EnablePermanentTalent (field 7) and
 * ResetPermanentTalent (field 11).
 *
 * Shape (client `FDBDLBAPDBE` / `OKPIPFKONMG`):
 *   - `JCOBJAMPOAL`: the node list;
 *   - `INJEKPLHPIF`: a uint the client feeds to its text lookup, reported as the
 *     activated node count.
 *
 * Each `OKPIPFKONMG` node is `{ CKHCLKOALKE: talent id, FFEPLIHOFLA: status }`.
 * The status values were read off `RogueTalentDataItem.IsLocked` /
 * `IsUnlocked` / `IsActivated` (`0xE9EE320`/`0xE9EE380`/`0xE9EE3E0`): 0 = locked,
 * 1 = unlocked-but-not-activated (`CanActive` requires 1), 2 = activated. The
 * tree is maxed out, so every node is reported activated (2) — this is the
 * "永久天赋拉满" part of the sandbox.
 */
export interface PermanentTalentOptions {
    talents: TournTalentTable | null;
}

export const TOURN_TALENT_ACTIVATED = 2;

export function buildPermanentTalentInfo(opts: PermanentTalentOptions): Record<string, any> {
    const nodes = talentIds(opts.talents).map((talentId) => ({
        // 10: talent id (same field the client echoes in the enable request).
        CKHCLKOALKE: talentId,
        // 2: status.
        FFEPLIHOFLA: TOURN_TALENT_ACTIVATED,
        // 8: per-unlock progress entries; none needed when fully activated.
        LDHIJAHNEGK: [],
    }));
    return {
        JCOBJAMPOAL: { BLHJIPBHHFO: nodes },
        INJEKPLHPIF: nodes.length,
    };
}
