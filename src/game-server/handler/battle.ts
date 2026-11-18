import { CmdID } from '../../proto/cmdId';
import { starrail } from '../../proto/starrail';
import type { NetSession } from '../NetSession';
import type { HandlerEntry } from './types';
import {
    createBattle,
    createChallengeStage,
    endBattle,
    activeBattleInfo,
    startBattle,
} from '../manager/battle_mgr';
import { isChallengeMode } from '../manager/challenge_mgr';
import { finishGridFightBattle } from './grid-fight';

/**
 * Battle service — port of pearl-sr `services/battle.zig`
 * (`docs/spec-battle-challenge.md` §12.1–§12.9, summary table in §17).
 *
 * The `SceneBattleInfo` builders live in `../manager/battle_mgr.ts`; this module
 * is only dispatch and response shaping. Points that are easy to get wrong and
 * are therefore spelled out at each call site:
 *
 * The started payload is retained for recovery queries until settlement.
 */

/** `MonsterBattleType` members used by `getBattleType` (`proto-dump MonsterBattleType`). */
const MONSTER_BATTLE_TYPE_TRIGGER_BATTLE = 1;
const MONSTER_BATTLE_TYPE_DIRECT_DIE_SKIP_BATTLE = 3;
const MONSTER_BATTLE_TYPE_NO_BATTLE = 4;

/**
 * `data.zig:22` `IgnoreBattle` — membership is tested on
 * `attacked_by_entity_id - 100000`, so these are avatar ids, not entity ids.
 */
const IGNORE_BATTLE = [
    1509, 1504, 1501, 1414, 1405, 1404, 1225, 1321, 1314, 1312, 1305, 1302, 1217, 1108,
];
/** `data.zig:23` `SkipBattle`. */
const SKIP_BATTLE = [1506, 1408, 1308, 1510];

/** `attacker_id >= 100000` — the only range the two tables are checked in. */
const ATTACKER_ENTITY_OFFSET = 100000;
/** `id > 1000000` distinguishes a boss/monster from a player-window entity. */
const MONSTER_ENTITY_THRESHOLD = 1000000;

/**
 * `getBattleType(id, attacker_id, skill_index, is_challenge)` — evaluate in
 * EXACTLY this order; every branch falls through to `TRIGGER_BATTLE`, including
 * `attacker_id === 0` and the 1001…99999 window.
 */
function getBattleType(
    targetEntityId: number,
    attackerId: number,
    skillIndex: number,
    isChallenge: boolean,
): number {
    if (skillIndex !== 1) return MONSTER_BATTLE_TYPE_TRIGGER_BATTLE;
    if (attackerId >= 1 && attackerId <= 1000) return MONSTER_BATTLE_TYPE_TRIGGER_BATTLE;

    if (attackerId >= ATTACKER_ENTITY_OFFSET) {
        const attackerOffset = attackerId - ATTACKER_ENTITY_OFFSET;
        if (IGNORE_BATTLE.includes(attackerOffset)) return MONSTER_BATTLE_TYPE_NO_BATTLE;
        if (SKIP_BATTLE.includes(attackerOffset)) {
            if (isChallenge) return MONSTER_BATTLE_TYPE_TRIGGER_BATTLE;
            return targetEntityId > MONSTER_ENTITY_THRESHOLD
                ? MONSTER_BATTLE_TYPE_TRIGGER_BATTLE
                : MONSTER_BATTLE_TYPE_DIRECT_DIE_SKIP_BATTLE;
        }
    }

    return MONSTER_BATTLE_TYPE_TRIGGER_BATTLE;
}

/**
 * `onStartCocoonStage` — 1432 -> 1484.
 *
 * `cocoon_id`, `prop_entity_id` and `wave` are echoed; `world_level`,
 * `HECCOBFBJFI` and `CBJCKEIGGNL` are never read, and the request has no effect
 * on the battle at all (the waves come from the profile). `challenge_cnt` is left
 * at 0 — pearl-sr never writes it. No stamina is charged and nothing is persisted.
 */
export async function onStartCocoonStageCsReq(req: any, session: NetSession): Promise<void> {
    const battle = createBattle(session);
    startBattle(session, battle);

    await session.sendRsp(CmdID.CmdStartCocoonStageScRsp, {
        retcode: 0,
        cocoonId: Number(req?.cocoonId ?? 0),
        propEntityId: Number(req?.propEntityId ?? 0),
        wave: Number(req?.wave ?? 0),
        battleInfo: battle,
    });
}

/**
 * `onQuickStartCocoonStage` — 1360 -> 1316.
 *
 * Note the response has no `prop_entity_id` field, and the request has no such
 * field either: only `cocoon_id` and `wave` are read.
 */
export async function onQuickStartCocoonStageCsReq(req: any, session: NetSession): Promise<void> {
    const battle = createBattle(session);
    startBattle(session, battle);

    await session.sendRsp(CmdID.CmdQuickStartCocoonStageScRsp, {
        retcode: 0,
        cocoonId: Number(req?.cocoonId ?? 0),
        wave: Number(req?.wave ?? 0),
        battleInfo: battle,
    });
}

/**
 * `onQuickStartFarmElement` — 4.7: 1359 -> 1318.
 *
 * `world_level` and `PAOFHFLFFHD` (an obfuscated field that this proto keeps)
 * are echoed verbatim; the echoed `world_level` does NOT reach the battle, whose
 * `SceneBattleInfo.world_level` stays hard-coded 6.
 *
 * NOTE: 4.5.54 needed two spellings for this pair (`CmdQuickStartFarmElementCsReq`
 * for the request and `CmdStartQuickFarmElementRsp` for the response, id 1356).
 * The 4.7 protocol renamed the response to `QuickStartFarmElementScRsp` and moved
 * it to 1318, so both directions now use one consistent spelling.
 */
export async function onQuickStartFarmElementCsReq(req: any, session: NetSession): Promise<void> {
    const battle = createBattle(session);
    startBattle(session, battle);

    await session.sendRsp(CmdID.CmdStartQuickFarmElementRsp, {
        retcode: 0,
        worldLevel: Number(req?.worldLevel ?? 0),
        battleInfo: battle,
    });
}

/**
 * `onStartBattleCollege` — 5775 -> 5760.
 *
 * The college id is echoed only: the stage and the monsters are always the
 * profile's defaults.
 */
export async function onStartBattleCollegeCsReq(req: any, session: NetSession): Promise<void> {
    const battle = createBattle(session);
    startBattle(session, battle);

    await session.sendRsp(CmdID.CmdStartBattleCollegeScRsp, {
        retcode: 0,
        id: Number(req?.id ?? 0),
        battleInfo: battle,
    });
}

function enterSceneBattle(session: NetSession, eventId = 0): any {
    const active = activeBattleInfo(session);
    if (active) return active;
    const challenge = isChallengeMode(session) ? createChallengeStage(session) : null;
    const battle = challenge?.monsterWaveList?.some((wave: any) => wave.monsterList?.length)
        ? challenge
        : createBattle(session, eventId);
    if (!battle.battleAvatarList?.length ||
        !battle.monsterWaveList?.some((wave: any) => wave.monsterList?.length)) return null;
    startBattle(session, battle);
    return battle;
}

export async function onSceneEnterStageCsReq(req: any, session: NetSession): Promise<void> {
    const battleInfo = enterSceneBattle(session, Number(req?.eventId ?? 0));
    await session.sendRsp(CmdID.CmdSceneEnterStageScRsp, {
        retcode: battleInfo ? 0 : starrail.Retcode.RET_BATTLE_FAIL,
        battleInfo,
    });
}

/** Resolve PearlSR battle triggers from both supported assist-target layouts. */
export async function onSceneCastSkillCsReq(req: any, session: NetSession): Promise<void> {
    const attackerId = Number(req?.attackedByEntityId ?? 0);
    const skillIndex = Number(req?.skillIndex ?? 0);
    const isChallenge = isChallengeMode(session);

    // stdout noise in the reference (services/battle.zig `Highlight`), kept so the
    // port can be traced the same way.
    console.log(`SKILL INDEX: ${skillIndex}`);
    console.log(`ATTACKED BY ENTITY ID: ${attackerId}`);

    let battleInfo: any = null;
    const monsterBattleInfo: any[] = [];

    const targetIds = new Set<number>([
        ...(req?.assistMonsterEntityIdList ?? []),
        ...(req?.assistMonsterEntityInfo ?? []).flatMap((group: any) => group.entityIdList ?? []),
        ...(req?.hitTargetEntityIdList ?? []).filter((id: number) => session.scene?.monsterEvents?.has(id)),
    ]);
    for (const rawId of targetIds) {
        const entityId = Number(rawId ?? 0);
        if (entityId <= 0) continue;
        const battleType = getBattleType(entityId, attackerId, skillIndex, isChallenge);

        const knownMonster = session.scene?.monsterEvents?.has(entityId);
        const legacyTarget = attackerId <= 1000 || entityId < 1000 ||
            (!isChallenge && (attackerId > MONSTER_ENTITY_THRESHOLD || entityId > MONSTER_ENTITY_THRESHOLD));
        if (!knownMonster && !legacyTarget) continue;
        monsterBattleInfo.push({
            targetMonsterEntityId: entityId,
            monsterBattleType: battleType,
        });
    }

    const trigger = monsterBattleInfo.find((info) => info.monsterBattleType === MONSTER_BATTLE_TYPE_TRIGGER_BATTLE);
    if (trigger) {
        battleInfo = enterSceneBattle(session, session.scene?.monsterEvents?.get(trigger.targetMonsterEntityId));
    }
    await session.sendRsp(CmdID.CmdSceneCastSkillScRsp, {
        retcode: trigger && !battleInfo ? starrail.Retcode.RET_BATTLE_FAIL : 0,
        castEntityId: Number(req?.castEntityId ?? 0),
        monsterBattleInfo,
        // null when no entry was a TRIGGER_BATTLE.
        battleInfo,
    });
}

/** Return the exact payload used to start the active battle. */
export async function onGetCurBattleInfoCsReq(_req: unknown, session: NetSession): Promise<void> {
    await session.sendRsp(CmdID.CmdGetCurBattleInfoScRsp, {
        retcode: 0,
        battleInfo: activeBattleInfo(session),
    });
}

/** Clear the active battle only when the result matches its identifiers. */
export async function onPVEBattleResultCsReq(req: any, session: NetSession): Promise<void> {
    const battle = session.battle;
    const battleId = Number(req?.battleId ?? 0);
    const stageId = Number(req?.stageId ?? 0);
    const gridFight = battle && battle.battleId === session.gridFightBattleId;
    const status = Number(req?.endStatus ?? 0);
    const mismatch = (gridFight && (battleId !== battle.battleId || stageId !== battle.stageId ||
        (status !== 1 && status !== 2 && status !== 3))) ||
        (battle && ((battleId && battleId !== battle.battleId) ||
        (stageId && stageId !== battle.stageId)));
    if (gridFight && process.env.SASR_GF_TRACE !== '0') {
        console.log(`[gridfight] battle result battle=${battleId} stage=${stageId} `
            + `status=${status} mismatch=${mismatch}`);
    }
    const response = session.sendRsp(CmdID.CmdPVEBattleResultScRsp, {
        retcode: mismatch ? starrail.Retcode.RET_BATTLE_STAGE_NOT_MATCH : 0,
        battleId: battleId || battle?.battleId || 0,
        endStatus: status,
        stageId: stageId || battle?.stageId || 0,
    });

    if (!mismatch) {
        endBattle(session);
        if (gridFight) {
            session.gridFightBattleId = null;
            await finishGridFightBattle(session, status);
        }
    }
    await response;
}

/**
 * `onSceneCastSkillCostMp` — 1408 -> 1468.
 *
 * Only `cast_entity_id` is read. No MP bookkeeping happens and
 * `SceneCastSkillMpUpdateScNotify` (1464) is never sent by the reference.
 */
export async function onSceneCastSkillCostMpCsReq(req: any, session: NetSession): Promise<void> {
    await session.sendRsp(CmdID.CmdSceneCastSkillCostMpScRsp, {
        retcode: 0,
        castEntityId: Number(req?.castEntityId ?? 0),
    });
}

/**
 * `onSyncClientResVersion` — 4.7: 9 -> 4 (retcode) / 8 (echo).
 *
 * 4.5.54 shipped this pair under the obfuscated `LJKMPIMKOMO`; the 4.7 dump has
 * the readable `client_res_version` on both sides, so no translation is needed.
 * The value is logged and echoed unchanged, like the reference does.
 */
export async function onSyncClientResVersionCsReq(req: any, session: NetSession): Promise<void> {
    console.log(`CLIENT RES VERSION: ${req?.clientResVersion ?? 0}`);
    await session.sendRsp(CmdID.CmdSyncClientResVersionScRsp, {
        retcode: 0,
        clientResVersion: Number(req?.clientResVersion ?? 0),
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdStartCocoonStageCsReq, action: onStartCocoonStageCsReq },
    { cmdId: CmdID.CmdQuickStartCocoonStageCsReq, action: onQuickStartCocoonStageCsReq },
    { cmdId: CmdID.CmdStartQuickFarmElementCsReq, action: onQuickStartFarmElementCsReq },
    { cmdId: CmdID.CmdStartBattleCollegeCsReq, action: onStartBattleCollegeCsReq },
    { cmdId: CmdID.CmdSceneCastSkillCsReq, action: onSceneCastSkillCsReq },
    { cmdId: CmdID.CmdSceneEnterStageCsReq, action: onSceneEnterStageCsReq },
    { cmdId: CmdID.CmdGetCurBattleInfoCsReq, action: onGetCurBattleInfoCsReq },
    { cmdId: CmdID.CmdPVEBattleResultCsReq, action: onPVEBattleResultCsReq },
    { cmdId: CmdID.CmdSceneCastSkillCostMpCsReq, action: onSceneCastSkillCostMpCsReq },
    { cmdId: CmdID.CmdSyncClientResVersionCsReq, action: onSyncClientResVersionCsReq },
];
