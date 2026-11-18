import { CmdID } from '../../proto/cmdId';
import { EncounterMonster, encounterForNode } from '../../data/grid-fight-encounters';
import {
    gridFightCanDress,
    gridFightEquipCategoryOf,
    gridFightEquipmentEffects,
} from '../../data/grid-fight-equipment';
import { gridFightCraftByMaterials, gridFightCraftByTarget } from '../../data/grid-fight-craft';
import {
    gridFightScoreRewardByRank,
    gridFightScoreRewardByRewardId,
} from '../../data/grid-fight-score-reward';
import {
    gridFightPermanentTalent,
    gridFightSeasonTalent,
    gridFightTalentUnlockable,
} from '../../data/grid-fight-talents';
import { gridFightHandbook } from '../../data/grid-fight-handbook';
import {
    gridFightTraitAcceptsEffect,
    gridFightTraitInfo,
} from '../../data/grid-fight-trait-effects';
import { gridFightTraitsOfRole } from '../../data/grid-fight-traits';
import { gridFightProfile as profile } from '../../data/grid-fight-profile';
import {
    gridFightSeasonScoreRuleForRoute, gridFightSettleScoreAt,
} from '../../data/grid-fight-settle';
import {
    gridFightAvatarMaxNumber, gridFightBattleRules, gridFightLevelUpExp, gridFightRarityWeights,
    gridFightSeasonTwoDivisions, gridFightSeasonTwoRoute,
    gridFightEnemyDifficulty, gridFightFourStarRoles, gridFightSellPrices, gridFightBuyPrices,
    gridFightShopPools, gridFightVictoryGold,
    gridFightStageMonsterParam, gridFightBattleAvatarId,
    gridFightCardNumberPerRefresh, gridFightDepositPerInterest, gridFightGainExpPerBossWave,
    gridFightGainExpPerWave, gridFightInitialPlayerHp, gridFightInterestMax, gridFightLevelUpGold,
    gridFightMaxEquipTrack, gridFightRefreshGold, gridFightStartingLevel,
} from '../../data/grid-fight-stages';
import { starrail } from '../../proto/starrail';
import type { NetSession } from '../NetSession';
import { syncMetaToState, withGridFightMeta, writeMetaToState } from '../grid-fight-meta';
import { activeBattleInfo, createBattleAvatar, endBattle, startBattle } from '../manager/battle_mgr';
import type { HandlerEntry } from './types';

const configMissing = 6900; // RET_GRID_FIGHT_CONF_MISS
// Tutorial state travels through three wire fields: the "last finished
// tutorial" scalar inside the GetData payload, and the two tutorial notifies.
// The entrance page starts tutorial 10065 whenever it believes the current
// season still has an unfinished tutorial; that tutorial needs a scene level
// graph the private server does not host, so it force-finishes and takes the
// page down with it. Reporting the tutorial as finished on the wire keeps the
// stock client happy without touching any client file.
const TUTORIAL_LAST_FINISH = 10065;
/**
 * The 4.6.54 client treats wire field 10 of `GridFightGetDataScRsp` as the
 * generic status code: the framework drops a reply whose code is non-zero
 * before the handler runs, which left the client without any GridFight profile
 * and made `GridFightModule.get_ExpLineRewardData()` throw a
 * `NullReferenceException` inside the S2 entrance page transition (black
 * screen). Keep the reply at 0.
 *
 * The S2 entrance page runs `Tutorial_10065` unless `GridFightPlayerProfile.
 * IsOldPlayer` is set. `GridFightPlayerProfile.Sync` copies that flag from
 * field 3 (bool) of the nested `CKPOBLIFMGN` message, then reads
 * `_SeasonIdToFurthestCompletedTutorialStageIdMap` to decide whether the
 * season tutorial was already finished. The local proto lacked the field, so
 * `src/proto/starrail.gen.js` now declares `isOldPlayer` as field 3 of
 * `CKPOBLIFMGN` (wire compatible with the client). `SASR_GF_NEWPLAYER=1`
 * restores the untouched new-player path for comparison.
 */
const OLD_PLAYER = process.env.SASR_GF_NEWPLAYER !== '1';
/**
 * Run-flow trace. The gameplay loop is driven by the client, so every rejected
 * request has to be visible on the server side: the client only shows a short
 * toast (or nothing at all) when a battle cannot start.
 */
function gfTrace(message: string): void {
    if (process.env.SASR_GF_TRACE === '0') return;
    console.log(`[gridfight] ${message}`);
}
const alreadyInGameplay = 6915; // RET_GRID_FIGHT_ALREADY_IN_GAMEPLAY
const noActiveRun = 6919; // RET_GRID_FIGHT_NOT_IN_GAMEPLAY
const invalidDivision = 6942; // RET_GRID_FIGHT_DIVISION_INVALID
const dataLocked = 6933; // RET_GRID_FIGHT_DATA_LOCKED
const ret = starrail.Retcode;
const updateSource = starrail.GridFightUpdateSrcType;
// Positions are one-based. The client lays out four front, nine back,
// and nine bench cells, followed by non-placeable overflow cells.
const frontLimit = 4;
const fieldLimit = frontLimit + 9;
const benchLimit = fieldLimit + 9;
const refreshPrice = gridFightRefreshGold;
const expPrice = gridFightLevelUpGold;
const startingLevel = gridFightStartingLevel;
const maxLevel = gridFightLevelUpExp.length;
const shopRarity = new Map(gridFightShopPools.flatMap((pool, index) => pool.map((id) => [id, index + 1] as const)));
// Bonfire (node type 5) restores this much of the lineup bar. The client's
// GridFightBonfireHealConfigRow stores (ChapterID, HealNum) but the sandbox does
// not ship that table, so every chapter uses the same shipped-season value.
const BONFIRE_HEAL = 30;

function shopOffers(level: number): starrail.HDEIAANGMDB[] {
    const weights = gridFightRarityWeights[level - 1];
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return Array.from({ length: gridFightCardNumberPerRefresh }, (_, index) => {
        let roll = Math.random() * total;
        const tier = weights.findIndex((weight) => (roll -= weight) < 0);
        const pool = gridFightShopPools[tier];
        return {
            KDKPDJNMMCM: index + 1,
            BDPIMPJOJBK: { roleId: pool[Math.floor(Math.random() * pool.length)], roleStar: 1 },
        };
    });
}

function shopWeights(level: number): starrail.MONJNCPINKN {
    return {
        FIJPICNPKIG: gridFightRarityWeights[level - 1].map((weight, index) => ({
            APAKCBFMCAB: weight,
            CKKDAEMFDPA: index + 1,
        })),
    };
}

function addShopRole(roles: starrail.CDEAABODKCP[], id: number, roleStar: number, uniqueId: number): boolean {
    let role: starrail.CDEAABODKCP = { id, roleStar, uniqueId };
    const maxStar = gridFightFourStarRoles.has(id) ? 4 : 3;
    while (role.roleStar < maxStar) {
        const matches = roles.filter((entry) => entry.id === id && entry.roleStar === role.roleStar)
            .sort((a, b) => a.pos - b.pos);
        if (matches.length < 2) break;
        const [first, second] = matches;
        // Retain the earliest board position among the existing copies.
        const retained = role.pos && role.pos < first.pos ? role : first;
        roles.splice(roles.indexOf(first), 1);
        roles.splice(roles.indexOf(second), 1);
        role = { ...retained, roleStar: role.roleStar + 1 };
    }
    if (!role.pos) {
        const occupied = new Set(roles.map((entry) => entry.pos));
        for (let pos = fieldLimit + 1; pos <= benchLimit; pos++) {
            if (!occupied.has(pos)) {
                role.pos = pos;
                break;
            }
        }
        if (!role.pos) return false;
    }
    roles.push(role);
    return true;
}

function currentShop(run: starrail.MPIMAEMCEFH): starrail.POCJDMMANBM {
    return run.NAGDJGMMCBE.find((entry: starrail.GridFightGameInfo) => entry.EBHDIOGALIE).EBHDIOGALIE;
}

function shopUpdate(shop: starrail.POCJDMMANBM): starrail.KFNCAIHIHCM {
    return { MOFNIOJHBBL: {
        ABGEKPJHHIA: shop.ABGEKPJHHIA,
        ABBNGCPECAI: shop.ABBNGCPECAI,
        OGDKJPDFFAI: shop.OGDKJPDFFAI,
        OPDCMCFOFAA: shop.OPDCMCFOFAA,
        NFGMOPCCPIC: shop.NFGMOPCCPIC,
    } };
}

function notifyUpdate(session: NetSession, gridUpdateSrc: number, updates: starrail.KFNCAIHIHCM[]) {
    return session.sendRsp(CmdID.CmdGridFightSyncUpdateResultScNotify, {
        GCPNIHHBGGD: [{ gridUpdateSrc, JKPJFKCBIEM: updates }],
    });
}

function expState(player: starrail.NIHNGPKHEPC): starrail.NFPLDMFCLHA {
    return {
        level: player.H_4a14c5ec,
        exp: player.gridFightCurLevelExp,
        KDBMPKJKAKI: gridFightLevelUpExp[player.H_4a14c5ec - 1],
    };
}

function addExp(player: starrail.NIHNGPKHEPC, gained: number): void {
    player.gridFightCurLevelExp += gained;
    while (player.H_4a14c5ec < maxLevel) {
        const needed = gridFightLevelUpExp[player.H_4a14c5ec - 1];
        if (player.gridFightCurLevelExp < needed) break;
        player.gridFightCurLevelExp -= needed;
        player.H_4a14c5ec += 1;
    }
    if (player.H_4a14c5ec === maxLevel) player.gridFightCurLevelExp = 0;
    player.KNFOCCPOJEA = player.H_4a14c5ec;
}

/**
 * How many roles the level allows on the field (`pos <= fieldLimit`).
 * `GridFightLevelV2.AvatarMaxNumber` is 1 at level 1 and grows by one per
 * level; anything above the cap has to stay on the bench.
 */
function deployLimit(player: starrail.NIHNGPKHEPC, equipBonus = 0): number {
    const level = Math.min(Math.max(player.H_4a14c5ec, 1), gridFightAvatarMaxNumber.length);
    return Math.min(gridFightAvatarMaxNumber[level - 1] + equipBonus, fieldLimit);
}

type RouteNode = (typeof gridFightSeasonTwoRoute.nodes)[number];

function chapterSnapshot(chapterId: number) {
    return gridFightSeasonTwoRoute.nodes.filter((node) => node.chapterId === chapterId).map((node) => ({
        sectionId: node.sectionId,
        DCAHJELNJNP: node.chapterId,
        displayValue: {
            stageId: node.stageId,
            CJCCMAACJDB: node.nodeType,
            PICMDONCKCO: node.basicGoldReward,
            PFEMDGNFHNH: Number(node.offersAugment),
        },
    }));
}

function currentStage(run: starrail.MPIMAEMCEFH): starrail.BEEFLEJAOCN {
    return run.NAGDJGMMCBE.find((entry: starrail.GridFightGameInfo) => entry.KLCPAAHDPJF).KLCPAAHDPJF;
}

function currentPlayer(run: starrail.MPIMAEMCEFH): starrail.NIHNGPKHEPC {
    return run.NAGDJGMMCBE.find((entry: starrail.GridFightGameInfo) => entry.FAOCFBOFCJP).FAOCFBOFCJP;
}

function currentTeam(run: starrail.MPIMAEMCEFH): starrail.HKFECLCHBFJ {
    return run.NAGDJGMMCBE.find((entry: starrail.GridFightGameInfo) => entry.EJIPINIKNCK).EJIPINIKNCK;
}

// 局内装备容器（背包）。4.6.54 里它是 GridFightGameInfo 的独立变体 GCKLIONKMJC，
// 穿戴关系不在角色结构上，而在队伍结构的 PMEOPPDAMLM（DDAMEHEPOBD：角色 unique_id + 装备 id 列表）。
function currentEquipment(run: starrail.MPIMAEMCEFH): starrail.CONONEALNOF | undefined {
    return run.NAGDJGMMCBE.find((entry: starrail.GridFightGameInfo) => entry.GCKLIONKMJC)?.GCKLIONKMJC;
}

// 队内所有角色已穿的装备 id（用于 Unique / UniqueAndExclusiveTrait 的「同件不可重复穿」）。
function teamEquippedIds(team: starrail.HKFECLCHBFJ): number[] {
    const ids: number[] = [];
    for (const worn of team.PMEOPPDAMLM ?? []) {
        for (const slot of worn.unique_id_10 ?? []) {
            const equipmentId = slot.GGMPEGMEHPD?.grid_fight_equipment_id ?? 0;
            if (equipmentId > 0) ids.push(equipmentId);
        }
    }
    return ids;
}

function nodeLocation(node: RouteNode) {
    return { DCAHJELNJNP: node.chapterId, sectionId: node.sectionId };
}

// Encounter composition is derived from the client's own tables; see
// grid-fight-encounters.ts for the table sources and the confidence level.
interface RunRollSeed {
    uniqueId?: number;
    divisionId_14?: number;
}

function encounterMonsters(run: RunRollSeed, node: RouteNode, optionId = 0): EncounterMonster[] {
    return encounterForNode(node, {
        runId: run.uniqueId ?? 0,
        divisionId: run.divisionId_14 ?? 0,
        optionId,
    });
}

function previewNode(run: RunRollSeed, node: RouteNode): starrail.NCKOKDHNJDC {
    if (node.nodeType === 5) return {};
    // The client displays two positions. Each contains an ID from the
    // node's BinaryNodeRule group.
    const options = node.nodeType === 3
        ? [1, 2].map((quality) => node.parameters[0] * 100 + quality)
        : [0];
    return {
        MPOBBIPMNNJ: {
            BPDABHGFBFO: options.map((optionId) => ({
                CJADMFDOBAI: optionId,
                BOAMLLHPNEC: {},
                // Only the wave preview is stored here; the battle snapshot
                // recomputes the same roll and adds the per-monster HP.
                monsterWaveList: [{
                    OCPEPEMNNEK: 1,
                    PBLBBDBDLEK: encounterMonsters(run, node, optionId)
                        .map(({ monsterId, roleStar }) => ({ monsterId, roleStar })),
                }],
            })),
        },
    };
}

// Node type 5 is the bonfire (rest) node: it heals the lineup and offers no
// battle. The stage pointer still has to visit it, otherwise the client's own
// route display and the server's current section drift apart.
function routeNodeAt(stage: starrail.BEEFLEJAOCN): RouteNode | undefined {
    return gridFightSeasonTwoRoute.nodes.find((node) =>
        node.chapterId === stage.DCAHJELNJNP && node.sectionId === stage.sectionId);
}

function nextRouteNode(stage: starrail.BEEFLEJAOCN): RouteNode | undefined {
    return gridFightSeasonTwoRoute.nodes.find((node) =>
        node.chapterId > stage.DCAHJELNJNP ||
        (node.chapterId === stage.DCAHJELNJNP && node.sectionId > stage.sectionId));
}

function battleSnapshot(session: NetSession, run: starrail.MPIMAEMCEFH, node: RouteNode,
    battleId: number): starrail.SceneBattleInfo {
    const preview = currentStage(run).IMPNAHBCADN.MPOBBIPMNNJ;
    const selected = preview.BPDABHGFBFO[(preview.MOADBALHMFD || 1) - 1];
    const quality = (selected.CJADMFDOBAI % 100) || 1;
    // The preview already stored this roll (same run id, stage and option), so
    // the ids line up; recompute here to attach the per-monster HP.
    const encounter = encounterMonsters(run, node, selected.CJADMFDOBAI || 0);
    const player = currentPlayer(run);
    const roles: starrail.CDEAABODKCP[] = currentTeam(run).gridGameRoleList
        .filter((role: starrail.CDEAABODKCP) => role.pos <= fieldLimit)
        .sort((left: starrail.CDEAABODKCP, right: starrail.CDEAABODKCP) => left.pos - right.pos);
    // The client converts every `battle_avatar_list` entry into a
    // `RPG.GameCore.LineUpCharacter` *and* builds a local battle check result
    // from it (`AdventureModule.CreateBattleServerCheckResult`). A hand-rolled
    // minimal entry makes that conversion throw a NullReferenceException, which
    // leaves the "start battle" request unanswered on screen. Reuse the profile
    // builder every other battle path uses, then override the two fields that
    // are grid-fight specific.
    let profileAvatars = 0;
    const avatar = (role: starrail.CDEAABODKCP, index: number) => {
        // Test sessions carry no profile; fall back to a minimal but complete
        // entry there so the route tests keep exercising the flow.
        const hasProfile = typeof (session as { data?: { getDataJson?: unknown } }).data?.getDataJson === 'function';
        const avatarId = gridFightBattleAvatarId(role.id);
        const base = hasProfile ? createBattleAvatar(session, avatarId) : null;
        if (hasProfile && base) profileAvatars += 1;
        return {
            ...(base ?? { id: avatarId, level: 80, promotion: 6, rank: 0, hp: 10000 }),
            avatarType: starrail.AvatarType.AVATAR_GRID_FIGHT_TYPE,
            index,
        };
    };
    const front = roles.filter((role) => role.pos <= frontLimit).map(avatar);
    const back = roles.filter((role) => role.pos > frontLimit).map(avatar);
    if (front.length + back.length > 0 && profileAvatars === 0) {
        gfTrace(`battle avatars fell back to defaults for role ids ${roles.map((role) => role.id).join(',')}`);
    } else {
        gfTrace(`battle avatars from profile: ${profileAvatars}/${front.length + back.length}`);
    }
    return {
        battleId,
        stageId: node.stageId,
        worldLevel: 6,
        logicRandomSeed: battleId,
        roundsLimit: gridFightBattleRules.get(node.penaltyBonusRuleId).rounds,
        monsterWaveLength: 1,
        monsterWaveList: [{
            battleStageId: node.stageId,
            battleWaveId: 1,
            monsterParam: gridFightStageMonsterParam,
            monsterList: encounter.map(({ monsterId, roleStar, maxHp }) => ({
                monsterId, maxHp, extraInfo: { EIGMKOJOEEI: { roleStar } },
            })),
        }],
        battleAvatarList: front,
        EIGMKOJOEEI: {
            OPHONCKPNMG: back,
            LJNGPCKPJLF: profile.seasonId,
            AACGBEBGDPE: run.divisionId_14,
            // The combat engine looks up the chapter's difficulty row with field 12.
            HHEPCDMBJFI: gridFightEnemyDifficulty(run.divisionId_14, quality),
            battleWaveId: 1,
            gridFightLineupHp: player.gridFightLineupHp,
            gridGameRoleList: roles.map((role) => ({
                roleId: role.id,
                avatarId: gridFightBattleAvatarId(role.id),
                roleStar: role.roleStar,
                pos: role.pos,
                uniqueId: role.uniqueId,
            })),
            IOCKDJCDMAH: {
                EMOHLJHPOPC: gridFightSeasonTwoRoute.id,
                ...nodeLocation(node),
                CJCCMAACJDB: node.nodeType,
            },
        },
        PMCEKILFBIO: {
            rogueMoney: player.gold_8,
            curLevelId: player.H_4a14c5ec,
            gridFightCurLevelExp: player.gridFightCurLevelExp,
        },
    };
}

// GridFight_History_MaxNum and GridFight_History_Collection_MaxNum.
const historyLimit = 10;
const favoritesLimit = 20;

function keepArchives(records: starrail.FAIHLAKPABN[]): starrail.FAIHLAKPABN[] {
    return records.filter((record, index) => index < historyLimit || record.IECKKCHJMLP);
}

async function settleRun(session: NetSession, reason: number): Promise<void> {
    const run = session.gridFightRun;
    const stage = currentStage(run);
    const player = currentPlayer(run);
    const team = currentTeam(run);
    // `reason` 3 means the run reached the last node, so the current node counts
    // as cleared; on a defeat (2) or a quit (1) it does not. Supply nodes repeat
    // their predecessor's row in `GridFightSeasonExpScore`, so they never add.
    const nodeIndex = gridFightSeasonTwoRoute.nodes.findIndex((node) =>
        node.chapterId === stage.DCAHJELNJNP && node.sectionId === stage.sectionId);
    const clearedNodes = nodeIndex < 0 ? 0 : nodeIndex + (reason === 3 ? 1 : 0);
    const earned = gridFightSettleScoreAt(
        gridFightSeasonScoreRuleForRoute(gridFightSeasonTwoRoute.id), clearedNodes);
    if (session.state) {
        session.state.gridFightSeasonExp = (session.state.gridFightSeasonExp ?? 0) + earned.seasonExp;
        session.state.gridFightWeeklyScore = (session.state.gridFightWeeklyScore ?? 0) + earned.weeklyScore;
    }
    session.gridFightRun = null;
    session.gridFightAwaitingPrepare = false;
    session.gridFightTraitEffects?.clear();
    const equipment = currentEquipment(run);
    // 真实客户端 4.6.54 的 SettleNotify 里 `BFLLJJBHLDF` 会带齐最终阵容、
    // 装备列表与各容器字段（抓包 `logs/grid-fight-capture.jsonl` 第 2111 条）；
    // 缺字段会让结算页的装备/增益区域读不到数据，这里按官方形状补齐（空容器照发）。
    const result = {
        reason,
        gridGameRoleList: team.gridGameRoleList,
        gridGameNpcList: team.gridGameNpcList ?? [],
        grid_fight_equipment_list: equipment?.grid_fight_equipment_list ?? [],
        KCOMPKMJCMC: team.KCOMPKMJCMC ?? [],
        JLDDDLDNFEF: run.JLDDDLDNFEF,
        H_9f60ad73: {
            EMOHLJHPOPC: stage.EMOHLJHPOPC,
            DCAHJELNJNP: stage.DCAHJELNJNP,
            sectionId: stage.sectionId,
            AACGBEBGDPE: run.divisionId_14,
            LKCJAPIGEND: player.gold_8,
            FMEOHKHGMJM: [],
        },
        OAIGAGABCMK: [],
        sync_augment_info: [],
        EEGPILJDLBG: [],
        grid_fight_trait_info: [],
        JFCHLABGFJO: [],
        IBBKKFGEEPH: [],
        APABPAFGCIA: [],
        CFFCNEDGCJJ: [],
        MHLBIBGKIOB: [],
        FNNEPMAPOOF: [],
        HGAGKFEKBDA: [],
        BBEEGMDAMIB: [],
    };
    const archives = session.state?.gridFightArchives ?? [];
    const now = Math.floor(Date.now() / 1000);
    if (session.state) {
        session.state.gridFightArchives = keepArchives([{
            OBNEAIPKGKL: now,
            BFLLJJBHLDF: result,
            BAAGDILLLME: Math.max(now, (archives[0]?.BAAGDILLLME ?? 0) + 1),
            LJNGPCKPJLF: profile.seasonId,
            GEGMHOMNBDG: profile.subSeasonId,
            IECKKCHJMLP: false,
        }, ...archives]);
    }
    const notify = session.sendRsp(CmdID.CmdGridFightSettleNotify, {
        BFLLJJBHLDF: result,
        GEBGGMAGDJB: run.divisionId_14,
        // Field 5 carries the exp this run added, field 4 the accumulated total.
        NMCKJPEMACM: earned.seasonExp,
        KEJGCDOGEDD: session.state?.gridFightSeasonExp ?? earned.seasonExp,
    });
    // Meta progress is account-level: refresh this session's copy from the
    // in-process ledger so a second connection cannot persist a stale block.
    syncMetaToState(session);
    await Promise.all([notify, session.data?.saveDataInGame()]);
}

export async function finishGridFightBattle(session: NetSession, status: number): Promise<void> {
    // The client sends QuitSettle separately when it abandons the whole run.
    if (status === starrail.BattleEndStatus.BATTLE_END_QUIT) return;
    const run = session.gridFightRun;
    const stage = currentStage(run);
    const player = currentPlayer(run);
    const won = status === starrail.BattleEndStatus.BATTLE_END_WIN;
    const node = gridFightSeasonTwoRoute.nodes.find((entry) =>
        entry.chapterId === stage.DCAHJELNJNP && entry.sectionId === stage.sectionId);
    const reward = won ? node.basicGoldReward : 0;
    // GridFight_GainInterestMax caps the paid interest; GridFight_DepositPerInterest
    // is the gold per interest step. Wire field 1 carries the same cap, so honour
    // whichever is lower instead of trusting a single source.
    const interestCap = Math.min(gridFightInterestMax, player.gold || gridFightInterestMax);
    const interest = Math.min(interestCap, Math.floor(player.gold_8 / gridFightDepositPerInterest));
    const previousStreak = player.GDAKCOICIDA ?? 0;
    const streak = won ? previousStreak + 1 : 0;
    const streakGold = gridFightVictoryGold[Math.min(streak, gridFightVictoryGold.length - 1)];
    player.GDAKCOICIDA = streak;
    const previousExp = expState(player);
    const experience = node.nodeType === 4 ? gridFightGainExpPerBossWave : gridFightGainExpPerWave;
    addExp(player, experience);
    player.gold_8 += reward + interest + streakGold;
    if (!won) {
        player.gridFightLineupHp = Math.max(0,
            player.gridFightLineupHp - gridFightBattleRules.get(node.penaltyBonusRuleId).lossHp);
    }
    const next = nextRouteNode(stage);
    const defeated = player.gridFightLineupHp === 0 || (!next && !won);
    session.gridFightAwaitingPrepare = true;
    const stageResult = session.sendRsp(CmdID.CmdGridFightEndBattleStageNotify, {
        ...nodeLocation(node),
        EMOHLJHPOPC: stage.EMOHLJHPOPC,
        CBHJKFNCDAD: won,
        HFLPDCJDIAC: won ? 100 : 0,
        CLFNPMGHMFC: reward,
        DMNILJEGICO: interest,
        OGLOCDMNNIM: streakGold,
        JPKHBELGHCG: streak,
        OCCOHKIMGCN: previousStreak,
        ODJEBDNBLLC: player.gridFightLineupHp,
        LKCJAPIGEND: player.MICEOJBAKGN,
        NKBIDLBLONC: {},
        reason: {},
        AEOCOGHMEBG: { LHIAODNJIIC: previousExp, EDCLIPCEHAO: expState(player), PBMAHOJBAGG: experience },
    });
    const streakUpdate = streak !== previousStreak
        ? session.sendRsp(CmdID.CmdGridFightSyncKeepWinCntNotify, { EHBLJGIENPI: streak })
        : undefined;
    const finalResult = !next || defeated ? settleRun(session, defeated ? 2 : 3) : undefined;
    await Promise.all([stageResult, streakUpdate, finalResult]);
}

function startSnapshot(uniqueId: number, divisionId: number): starrail.MPIMAEMCEFH {
    const route = gridFightSeasonTwoRoute;
    const first = route.nodes[0];
    return {
        uniqueId,
        // Field 3 is the session season in 4.6.54 despite the generated name.
        divisionId: profile.seasonId,
        // The client reads wire field 14 for the active division.
        divisionId_14: divisionId,
        JLDDDLDNFEF: {},
        NAGDJGMMCBE: [
            // The client syncs context unconditionally, even before any values exist.
            { KFBIEANENKJ: {} },
            // PrayQuestManager.Sync expects a record even when the list is empty.
            { CKLNMDAMJCB: {} },
            // The S2 preparation page resolves the portrait from the first
            // PetPal repository entry. DesignData pairs pet 2 with effect 102001.
            { OGKMAKNOPOD: { BBEEGMDAMIB: [{ NDAHDHKGNBG: 2, OKGGFNJJLNG: 102001 }] } },
            { EJIPINIKNCK: {
                gridGameRoleList: [1009, 1201, 1218].map((id, index) => ({
                    id, roleStar: 1, pos: index + 1, uniqueId: index + 1,
                })),
                // 装备穿戴表：角色 unique_id + 已穿装备 id；开局为空。
                PMEOPPDAMLM: [],
            } },
            // 局内装备背包：GetData/开局快照都要带容器，客户端才不会把装备页当缺失数据。
            { GCKLIONKMJC: { grid_fight_equipment_list: [], IPMKOMEHBMP: [] } },
            { FAOCFBOFCJP: {
                // Wire field 1 is the interest cap, field 8 is spendable gold.
                gold: gridFightInterestMax,
                gold_8: 0,
                gridFightCurLevelExp: 0,
                GDAKCOICIDA: 0,
                KNFOCCPOJEA: startingLevel,
                gridFightLineupHp: gridFightInitialPlayerHp,
                MICEOJBAKGN: gridFightInitialPlayerHp,
                H_4a14c5ec: startingLevel,
                AFFCFLFIFPH: 3,
                BHJFJEEGGMC: {},
                // SetData reads the lock record even when no locks are active.
                GAJGBBFELEL: {},
            } },
            // RoleShop.Sync dereferences the stock metadata even with no offers.
            { EBHDIOGALIE: {
                ABBNGCPECAI: shopWeights(startingLevel), NFGMOPCCPIC: 0, OGDKJPDFFAI: shopOffers(startingLevel),
            } },
            { KLCPAAHDPJF: {
                EMOHLJHPOPC: route.id,
                DCAHJELNJNP: first.chapterId,
                sectionId: first.sectionId,
                // The client indexes this list by chapter ID minus one.
                bossInfo: {
                    NCGHKPEMPDP: route.nodes.filter((node) => node.nodeType === 4)
                        .map((node) => encounterMonsters({ uniqueId, divisionId_14: divisionId }, node)[0]),
                },
                sectionId_11: {},
                // Session sync reads the stage effects record even before any effects are active.
                COEBCNGCNOO: { NKBIDLBLONC: {} },
                IMPNAHBCADN: previewNode({ uniqueId, divisionId_14: divisionId }, first),
                OOMMIIKPHBC: chapterSnapshot(first.chapterId),
            } },
        ],
    };
}

// The client reads field 1 of each season record as the last completed
// tutorial, and compares it against the season's final step.
const seasonRecords = {
    1: { MPJPLKKJNGE: 3, divisionId: 10950 },
    2: { MPJPLKKJNGE: 5, divisionId: profile.divisionId },
};

// The handbook is client-owned data: the server only says which entries are
// seen/completed. Both lists are filled with the same union so every category
// renders as fully collected, whatever the client counts towards its totals.
// Categories whose client-side counter walks a config row per id stay on the
// Season 1 pool (see grid-fight-handbook.ts): one unknown id throws and the
// entrance page blacks out.
const handbook = {
    DNEGDNEBJMB: { gridFightAvatarList: gridFightHandbook.roles },
    PJBIPMKACOF: { gridFightItemList: gridFightHandbook.equipItems },
    NIOAIKLPACM: { HEKMEJLMGFF: gridFightHandbook.monsters },
    EECJFCNKKMB: { HKKNDJJPAPI: gridFightHandbook.affixes },
    KJIJEGAHLGB: { JHGCJKCHNCO: gridFightHandbook.spotlights, MOOIOOBHGKB: gridFightHandbook.spotlights },
    EJHDGLHCNLH: { DJJBKIGBGJA: gridFightHandbook.portals, NPHOIMEEDHM: gridFightHandbook.portals },
    JLFANEOAHOC: { JICIBCFDHIH: gridFightHandbook.augments, DDIFKADGIBO: gridFightHandbook.augments },
    // Pet pals are only ever read from the "seen" set, and their group ids are
    // not proven for this client yet, so leave the field out entirely.
    ...(gridFightHandbook.petPals.length
        ? { NNIJIFGJJJA: { FLMPNGCJCAI: gridFightHandbook.petPals } }
        : {}),
};

/**
 * Tell the client the season's tutorial ladder is already behind it.
 *
 * The client keeps its own "furthest tutorial stage" map, refreshed by
 * `GridFightSyncTutorialProgressIdScNotify`; without it the S2 entrance page
 * starts `Tutorial_10065` every time it loads.
 */
async function pushTutorialState(session: NetSession): Promise<void> {
    await session.sendRsp(CmdID.CmdGridFightSyncTutorialProgressIdScNotify, {
        MPJPLKKJNGE: seasonRecords[profile.seasonId].MPJPLKKJNGE,
        LJNGPCKPJLF: profile.seasonId,
    });
    await session.sendRsp(CmdID.CmdGridFightLastTutorialFinishScNotify, {
        ENECKKGPKHI: TUTORIAL_LAST_FINISH,
    });
}

/**
 * Season-two peripheral systems: equipment, spotlights, talents, the forge and
 * the weekly reward board. They sit outside the battle loop and the client
 * keeps its own optimistic view of them, so an acknowledgement with the right
 * response type is enough to keep the menus usable. Their real inventories are
 * tracked on the roadmap ("局内经济、角色和战斗构筑").
 */
const peripheralHandlers: HandlerEntry[] = ([
    [CmdID.CmdGridFightRecycleItemCsReq, CmdID.CmdGridFightRecycleItemScRsp],
    [CmdID.CmdGridFightSpotLightEnterCsReq, CmdID.CmdGridFightSpotLightEnterScRsp],
    [CmdID.CmdGridFightSpotLightReplaceCsReq, CmdID.CmdGridFightSpotLightReplaceScRsp],
    [CmdID.CmdGridFightUpdateSpotLightTrackCsReq, CmdID.CmdGridFightUpdateSpotLightTrackScRsp],
    [CmdID.CmdGridFightSummonProjectionCsReq, CmdID.CmdGridFightSummonProjectionScRsp],
    [CmdID.CmdGridFightUseForgeCsReq, CmdID.CmdGridFightUseForgeScRsp],
    [CmdID.CmdGridFightDestroyWeeklyRewardCsReq, CmdID.CmdGridFightDestroyWeeklyRewardScRsp],
] as const).map(([cmdId, rsp]) => ({
    cmdId,
    action: ((_request, session) => session.sendRsp(rsp, { retcode: 0 })) as HandlerEntry['action'],
}));

export const handlers: HandlerEntry[] = [
    {
        cmdId: CmdID.CmdGetGameFormationCsReq,
        action: (_, session) => session.sendRsp(CmdID.CmdGetGameFormation, { retcode: 0, FEBFMFMLHPO: [] }),
    },
    {
        cmdId: CmdID.CmdCycleScoreRewardGetDataCsReq,
        action: (_, session) => {
            // Keep the sandbox cycle active on the configured 14-day cadence.
            const cycleSeconds = 14 * 86400;
            const anchor = Date.parse('2025-08-18T04:00:00+08:00') / 1000;
            const now = Math.floor(Date.now() / 1000);
            const beginTime = anchor + Math.floor((now - anchor) / cycleSeconds) * cycleSeconds;
            const cycle = { IFEPJHGNCOI: beginTime, endTime: beginTime + cycleSeconds, PMJGAJGIFOA: 0 };
            return session.sendRsp(CmdID.CmdCycleScoreRewardGetDataScRsp, {
                retcode: 0,
                NFEDANFBIBE: cycle,
            });
        },
    },
    {
        cmdId: CmdID.CmdGridFightGetDataCsReq,
        action: async (_, session) => {
            // A run outlives the connection: after a crash or a server restart
            // the client reconnects and asks for the lobby data again, and the
            // stored run is what makes `ResumeGamePlay` succeed. Test doubles
            // do not carry the persistence layer.
            session.restoreGridFightRun?.();
            await session.sendRsp(CmdID.CmdGridFightGetDataScRsp, {
                retcode: 0,
                DHFOFLFCLAH: session.gridFightRun ?? undefined,
                LFLCDNGALME: {
                    PKELAIPIHMF: {
                        MHFHLBHFIBC: {},
                        FBJMBJKMAJA: seasonRecords,
                        isOldPlayer: OLD_PLAYER,
                    },
                    HFPEJIDDDJG: {
                        ADFEKPNIFOJ: profile.seasonId,
                        GEGMHOMNBDG: profile.subSeasonId,
                        divisionId: profile.divisionId,
                        // Same `GLIFOLCEMIN` substructure the settle notify uses:
                        // `KEJGCDOGEDD` carries the accumulated season exp so the
                        // lobby page can show progress right after a settlement.
                        exp: { KEJGCDOGEDD: session.state?.gridFightSeasonExp ?? 0 },
                        MHFHLBHFIBC: {},
                        NLENPEPIHAC: handbook,
                    },
                },
            });
            await pushTutorialState(session);
        },
    },
    {
        cmdId: CmdID.CmdGridFightFinishTutorialCsReq,
        action: async (_, session) => {
            await session.sendRsp(CmdID.CmdGridFightFinishTutorialScRsp, { retcode: 0 });
            await pushTutorialState(session);
        },
    },
    {
        cmdId: CmdID.CmdGridFightGetArchiveCsReq,
        action: (request, session) => {
            const archives = session.state?.gridFightArchives ?? [];
            const list = request.type === 2
                ? archives.filter((record) => record.IECKKCHJMLP)
                : archives.slice(0, historyLimit);
            return session.sendRsp(CmdID.CmdGridFightGetArchiveScRsp, {
                retcode: 0,
                type: request.type,
                MCGGPONOCKC: list,
            });
        },
    },
    {
        cmdId: CmdID.CmdFavourArchiveCsReq,
        action: async (request, session) => {
            const response = CmdID.CmdFavourArchiveScRsp;
            const archives = session.state.gridFightArchives;
            const record = archives.find((entry) => entry.BAAGDILLLME === request.BAAGDILLLME);
            if (!record) return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_PARAM_NOT_MATCH });
            const favorite = request.IECKKCHJMLP === true;
            if (record.IECKKCHJMLP !== favorite) {
                if (favorite && archives.filter((entry) => entry.IECKKCHJMLP).length >= favoritesLimit) {
                    return session.sendRsp(response, { retcode: dataLocked });
                }
                record.IECKKCHJMLP = favorite;
                session.state.gridFightArchives = keepArchives(archives);
                syncMetaToState(session);
                await session.data.saveDataInGame();
            }
            await session.sendRsp(response, { retcode: 0, BAAGDILLLME: record.BAAGDILLLME, IECKKCHJMLP: favorite });
        },
    },
    {
        cmdId: CmdID.CmdGetOfferingInfoCsReq,
        action: (request, session) => {
            const offeringInfoList = [...new Set<number>(request.offeringIdList ?? [])].flatMap((offeringId) => {
                const offering = profile.offerings.get(offeringId);
                return offering ? [{ offeringId, ...offering, offeringState: 2 }] : [];
            });
            return session.sendRsp(CmdID.CmdGetOfferingInfoScRsp, { retcode: 0, offeringInfoList });
        },
    },
    {
        cmdId: CmdID.CmdGridFightStartGamePlayCsReq,
        action: (request, session) => {
            const divisionId = request.divisionId;
            if (session.gridFightRun) {
                return session.sendRsp(CmdID.CmdGridFightStartGamePlayScRsp, { retcode: alreadyInGameplay });
            }
            if (divisionId >= 20000 && !gridFightSeasonTwoDivisions.has(divisionId)) {
                return session.sendRsp(CmdID.CmdGridFightStartGamePlayScRsp, { retcode: invalidDivision });
            }
            if (!gridFightSeasonTwoDivisions.has(divisionId) || request.isOverlock) {
                return session.sendRsp(CmdID.CmdGridFightStartGamePlayScRsp, { retcode: configMissing });
            }
            const uniqueId = session.nextGridFightRunId ?? 1;
            const run = startSnapshot(uniqueId, divisionId);
            session.nextGridFightRunId = uniqueId + 1;
            session.nextGridFightRoleId = 4;
            session.gridFightBonfireHealed = false;
            session.gridFightTraitEffects?.clear();
            session.gridFightRun = run;
            return session.sendRsp(CmdID.CmdGridFightStartGamePlayScRsp, {
                retcode: 0,
                DHFOFLFCLAH: run,
            });
        },
    },
    {
        cmdId: CmdID.CmdGridFightResumeGamePlayCsReq,
        action: (request, session) =>
            session.sendRsp(CmdID.CmdGridFightResumeGamePlayScRsp, {
                retcode: session.gridFightRun && session.gridFightRun.uniqueId === request.uniqueId
                    ? 0 : noActiveRun,
            }),
    },
    {
        cmdId: CmdID.CmdGridFightBuyExpCsReq,
        action: async (_, session) => {
            const response = CmdID.CmdGridFightBuyExpScRsp;
            const run = session.gridFightRun;
            if (!run) return session.sendRsp(response, { retcode: noActiveRun });
            if (session.gridFightBattleId || session.gridFightAwaitingPrepare) {
                return session.sendRsp(response, { retcode: dataLocked });
            }
            const player = currentPlayer(run);
            if (player.H_4a14c5ec >= maxLevel) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_GAMEPLAY_LEVEL_MAX });
            }
            if (player.gold_8 < expPrice) return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_COIN_NOT_ENOUGH });
            player.gold_8 -= expPrice;
            addExp(player, 4);
            const shop = currentShop(run);
            shop.ABBNGCPECAI = shopWeights(player.H_4a14c5ec);
            await notifyUpdate(session, updateSource.GridFightUpdateSrcType_KGridFightSrcBuyExp, [
                { itemValue: player.gold_8 },
                { PLPHEIBLPDL: { level: player.H_4a14c5ec, exp: player.gridFightCurLevelExp, HFMKLAPEKFA: maxLevel } },
                shopUpdate(shop),
            ]);
            await session.sendRsp(response, { retcode: 0 });
        },
    },
    {
        cmdId: CmdID.CmdGridFightRefreshShopCsReq,
        action: async (_, session) => {
            const response = CmdID.CmdGridFightRefreshShopScRsp;
            const run = session.gridFightRun;
            if (!run) return session.sendRsp(response, { retcode: noActiveRun });
            if (session.gridFightBattleId || session.gridFightAwaitingPrepare) {
                return session.sendRsp(response, { retcode: dataLocked });
            }
            const player = currentPlayer(run);
            const shop = currentShop(run);
            if (shop.ABGEKPJHHIA) return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_SHOP_LOCKED });
            if (player.gold_8 < refreshPrice) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_COIN_NOT_ENOUGH });
            }
            player.gold_8 -= refreshPrice;
            shop.NFGMOPCCPIC += 1;
            shop.OGDKJPDFFAI = shopOffers(player.H_4a14c5ec);
            await notifyUpdate(session, updateSource.GridFightUpdateSrcType_KGridFightSrcManualRefreshGoods, [
                { itemValue: player.gold_8 }, shopUpdate(shop),
            ]);
            await session.sendRsp(response, { retcode: 0 });
        },
    },
    {
        cmdId: CmdID.CmdGridFightBuyGoodsCsReq,
        action: async (request, session) => {
            const response = CmdID.CmdBuyGoodRsp;
            const run = session.gridFightRun;
            if (!run) return session.sendRsp(response, { retcode: noActiveRun });
            if (session.gridFightBattleId || session.gridFightAwaitingPrepare) {
                return session.sendRsp(response, { retcode: dataLocked });
            }
            const ids: number[] = request.CGAFCMIAKLI ?? [];
            if (!ids.length || new Set(ids).size !== ids.length) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_PARAM_NOT_MATCH });
            }
            const shop = currentShop(run);
            const offers: starrail.HDEIAANGMDB[] = ids.map((id) =>
                shop.OGDKJPDFFAI.find((offer: starrail.HDEIAANGMDB) => offer.KDKPDJNMMCM === id));
            if (offers.some((offer) => !offer || offer.LHGIFDNPIDE)) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_GOODS_SOLD });
            }
            const player = currentPlayer(run);
            // Prices come from GridFightShopPrice's buy column, keyed by rarity and
            // star rank. Shipped shop offers are one-star (where buy == sell), but a
            // star-two offer would cost the two-star price instead of the rarity.
            const price = offers.reduce((sum, offer) => {
                const { roleId, roleStar } = offer.BDPIMPJOJBK;
                const rarity = shopRarity.get(roleId) ?? 1;
                return sum + (gridFightBuyPrices[rarity - 1]?.[(roleStar ?? 1) - 1] ?? rarity);
            }, 0);
            if (player.gold_8 < price) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_COIN_NOT_ENOUGH });
            }
            const roles: starrail.CDEAABODKCP[] = currentTeam(run).gridGameRoleList;
            const nextRoles = [...roles];
            let nextId = session.nextGridFightRoleId;
            for (const offer of offers) {
                const { roleId, roleStar } = offer.BDPIMPJOJBK;
                if (!addShopRole(nextRoles, roleId, roleStar, nextId++)) {
                    return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_NO_EMPTY_POS });
                }
            }
            const before = new Map(roles.map((role) => [role.uniqueId, role]));
            const after = new Set(nextRoles.map((role) => role.uniqueId));
            const removed = roles.filter((role) => !after.has(role.uniqueId));
            const changed = nextRoles.filter((role) => before.has(role.uniqueId) && before.get(role.uniqueId) !== role);
            const added = nextRoles.filter((role) => !before.has(role.uniqueId));
            player.gold_8 -= price;
            session.nextGridFightRoleId = nextId;
            offers.forEach((offer) => { offer.LHGIFDNPIDE = true; });
            roles.splice(0, roles.length, ...nextRoles);
            const source = removed.length || changed.length || added.length < offers.length
                ? updateSource.GridFightUpdateSrcType_KGridFightSrcMergeRole
                : updateSource.GridFightUpdateSrcType_KGridFightSrcBuyGoods;
            await notifyUpdate(session, source, [
                { itemValue: player.gold_8 },
                ...removed.map((role) => ({ HFCBOIOAECK: role.uniqueId })),
                ...changed.map((role) => ({ CFOCDALNCBP: role })),
                ...added.map((role) => ({ PIDDDHKPDDM: role })),
                shopUpdate(shop),
            ]);
            await session.sendRsp(response, { retcode: 0, CGAFCMIAKLI: ids });
        },
    },
    {
        cmdId: CmdID.CmdGridFightLockShopCsReq,
        action: async (request, session) => {
            const shop = session.gridFightRun?.NAGDJGMMCBE
                .find((entry: starrail.GridFightGameInfo) => entry.EBHDIOGALIE)?.EBHDIOGALIE;
            if (!shop) {
                await session.sendRsp(CmdID.CmdGridFightLockShopScRsp, {
                    retcode: session.gridFightRun ? configMissing : noActiveRun,
                });
                return;
            }
            shop.ABGEKPJHHIA = request.isLocked === true;
            const update = shopUpdate(shop);
            await session.sendRsp(CmdID.CmdGridFightLockShopScRsp, { retcode: 0 });
            await notifyUpdate(session, updateSource.GridFightUpdateSrcType_KGridFightSrcNone, [update]);
        },
    },
    {
        cmdId: CmdID.CmdGridFightUpdateEliteBranchSelectCsReq,
        action: async (request, session) => {
            const response = CmdID.CmdGridFightUpdateEliteBranchSelectScRsp;
            const run = session.gridFightRun;
            if (!run) return session.sendRsp(response, { retcode: noActiveRun });
            if (session.gridFightBattleId || session.gridFightAwaitingPrepare) {
                return session.sendRsp(response, { retcode: dataLocked });
            }
            const stage = currentStage(run);
            const preview = stage.IMPNAHBCADN?.MPOBBIPMNNJ;
            const position = request.MOADBALHMFD;
            if (routeNodeAt(stage)?.nodeType !== 3 || (position !== 1 && position !== 2) ||
                !preview?.BPDABHGFBFO[position - 1]) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_PARAM_NOT_MATCH });
            }
            preview.MOADBALHMFD = position;
            await notifyUpdate(session, updateSource.GridFightUpdateSrcType_KGridFightSrcNone, [
                { FGODNPLCECH: { MOADBALHMFD: position } },
            ]);
            await session.sendRsp(response, { retcode: 0 });
        },
    },
    {
        cmdId: CmdID.CmdGridFightEnterBattleStageCsReq,
        action: (_, session) => {
            const response = CmdID.CmdGridFightEnterBattleStageScRsp;
            const run = session.gridFightRun;
            if (!run) {
                gfTrace('enterBattleStage rejected: no active run');
                return session.sendRsp(response, { retcode: noActiveRun });
            }
            if (session.battle && session.battle.battleId === session.gridFightBattleId) {
                gfTrace(`enterBattleStage replayed for battle ${session.gridFightBattleId}`);
                return session.sendRsp(response, { retcode: 0, battleInfo: activeBattleInfo(session) });
            }
            if (session.battle || session.gridFightAwaitingPrepare) {
                gfTrace(`enterBattleStage rejected: battle=${session.battle?.battleId ?? 'none'} `
                    + `awaitingPrepare=${session.gridFightAwaitingPrepare}`);
                return session.sendRsp(response, { retcode: dataLocked });
            }
            const stage = currentStage(run);
            const node = gridFightSeasonTwoRoute.nodes.find((entry) =>
                entry.chapterId === stage.DCAHJELNJNP && entry.sectionId === stage.sectionId);
            if (!node || node.nodeType === 5) {
                gfTrace(`enterBattleStage rejected: chapter=${stage.DCAHJELNJNP} `
                    + `section=${stage.sectionId} node=${node ? `type ${node.nodeType}` : 'missing'}`);
                return session.sendRsp(response, { retcode: configMissing });
            }
            const battleId = session.nextGridFightBattleId ?? 10000;
            const battleInfo = battleSnapshot(session, run, node, battleId);
            if (!battleInfo.battleAvatarList.length) {
                gfTrace('enterBattleStage rejected: empty avatar list');
                return session.sendRsp(response, { retcode: starrail.Retcode.RET_BATTLE_FAIL });
            }
            session.nextGridFightBattleId = battleId + 1;
            session.gridFightBattleId = battleId;
            startBattle(session, battleInfo);
            gfTrace(`enterBattleStage ok: battle=${battleId} stage=${node.stageId} `
                + `avatars=${battleInfo.battleAvatarList.length} `
                + `monsters=${battleInfo.monsterWaveList?.[0]?.monsterList?.length ?? 0}`);
            return session.sendRsp(response, { retcode: 0, battleInfo });
        },
    },
    {
        cmdId: CmdID.CmdGridFightBackToPrepareReq,
        action: async (_, session) => {
            const response = CmdID.CmdGridFightBackToPrepareScRsp;
            if (!session.gridFightRun) return session.sendRsp(response, { retcode: noActiveRun });
            // A live battle owns the run until its result arrives.
            if (session.gridFightBattleId) return session.sendRsp(response, { retcode: dataLocked });
            const stage = currentStage(session.gridFightRun);
            const node = routeNodeAt(stage);
            // Leaving the bonfire and returning from a battle both land here; the
            // request is idempotent outside those two situations.
            if (!session.gridFightAwaitingPrepare && node?.nodeType !== 5) {
                return session.sendRsp(response, { retcode: 0 });
            }
            const next = nextRouteNode(stage);
            const player = currentPlayer(session.gridFightRun);
            const shop = currentShop(session.gridFightRun);
            session.gridFightAwaitingPrepare = false;
            if (!next) return session.sendRsp(response, { retcode: 0 });
            const location = nodeLocation(next);
            const nodeInfo = previewNode(session.gridFightRun, next);
            Object.assign(stage, location, {
                OOMMIIKPHBC: chapterSnapshot(next.chapterId),
                IMPNAHBCADN: nodeInfo,
            });
            session.gridFightBonfireHealed = false;
            shop.ABBNGCPECAI = shopWeights(player.H_4a14c5ec);
            if (!shop.ABGEKPJHHIA) {
                shop.NFGMOPCCPIC += 1;
                shop.OGDKJPDFFAI = shopOffers(player.H_4a14c5ec);
            }
            shop.ABGEKPJHHIA = false;
            await session.sendRsp(CmdID.CmdGridFightSyncUpdateResultScNotify, {
                GCPNIHHBGGD: [{
                    gridUpdateSrc: starrail.GridFightUpdateSrcType.GridFightUpdateSrcType_KGridFightSrcEnterNode,
                    JKPJFKCBIEM: [
                        { itemValue: player.gold_8 },
                        { gridFightLineupHp: {
                            gridFightLineupHp: player.gridFightLineupHp, PPKKHHNEOHB: player.MICEOJBAKGN,
                        } },
                        shopUpdate(shop),
                        { KKHHIEKJAGE: { OJOHFAHBKGE: stage.OOMMIIKPHBC } },
                        { OOICHLAMNIG: { ...location, IMPNAHBCADN: nodeInfo } },
                    ],
                }],
            });
            await session.sendRsp(response, { retcode: 0 });
        },
    },
    {
        cmdId: CmdID.CmdGridFightEnterBonfireCsReq,
        action: (_, session) => {
            const response = CmdID.CmdGridFightEnterBonfireScRsp;
            const run = session.gridFightRun;
            if (!run) return session.sendRsp(response, { retcode: noActiveRun });
            if (session.gridFightBattleId) return session.sendRsp(response, { retcode: dataLocked });
            const node = routeNodeAt(currentStage(run));
            if (node?.nodeType !== 5) return session.sendRsp(response, { retcode: configMissing });
            session.gridFightAwaitingPrepare = false;
            return session.sendRsp(response, { retcode: 0 });
        },
    },
    {
        cmdId: CmdID.CmdGridFightHandleBonfireHealHpCsReq,
        action: async (request, session) => {
            const response = CmdID.CmdGridFightHandlePendingActionScRsp;
            const queuePosition = request.queuePosition ?? 0;
            const run = session.gridFightRun;
            if (!run) return session.sendRsp(response, { retcode: noActiveRun, queuePosition });
            if (session.gridFightBattleId) return session.sendRsp(response, { retcode: dataLocked, queuePosition });
            const node = routeNodeAt(currentStage(run));
            if (node?.nodeType !== 5) return session.sendRsp(response, { retcode: configMissing, queuePosition });
            if (session.gridFightBonfireHealed) return session.sendRsp(response, { retcode: 0, queuePosition });
            const player = currentPlayer(run);
            // GridFightBonfireHealConfigRow only carries (ChapterID, HealNum) and the
            // sandbox does not export that table, so the heal uses the shipped
            // season-two tuning instead of inventing a per-chapter value.
            player.gridFightLineupHp = Math.min(player.MICEOJBAKGN, player.gridFightLineupHp + BONFIRE_HEAL);
            session.gridFightBonfireHealed = true;
            const ack = session.sendRsp(response, { retcode: 0, queuePosition });
            await Promise.all([
                ack,
                notifyUpdate(session, updateSource.GridFightUpdateSrcType_KGridFightSrcEnterNode, [{
                    gridFightLineupHp: {
                        gridFightLineupHp: player.gridFightLineupHp, PPKKHHNEOHB: player.MICEOJBAKGN,
                    },
                }]),
            ]);
        },
    },
    {
        cmdId: CmdID.CmdGridFightUpdatePosCsReq,
        action: (request, session) => {
            const response = CmdID.CmdGridFightUpdatePosScRsp;
            if (!session.gridFightRun) return session.sendRsp(response, { retcode: noActiveRun });
            if (session.gridFightBattleId || session.gridFightAwaitingPrepare) {
                return session.sendRsp(response, { retcode: dataLocked });
            }
            const roles: starrail.CDEAABODKCP[] = currentTeam(session.gridFightRun).gridGameRoleList;
            const changes: starrail.MHEGMHKHAAD[] = request.AAKDHMHCMLP ?? [];
            const next = new Map<number, number>();
            for (const { uniqueId, pos } of changes) {
                if (!roles.some((role) => role.uniqueId === uniqueId)) {
                    return session.sendRsp(response, { retcode: starrail.Retcode.RET_GRID_FIGHT_ROLE_NOT_EXIST });
                }
                if (next.has(uniqueId) || !Number.isInteger(pos) || pos < 1 || pos > benchLimit) {
                    return session.sendRsp(response, { retcode: starrail.Retcode.RET_GRID_FIGHT_POS_NOT_VALID });
                }
                next.set(uniqueId, pos);
            }
            const finalPositions = roles.map((role) => next.get(role.uniqueId) ?? role.pos);
            if (new Set(finalPositions).size !== finalPositions.length) {
                return session.sendRsp(response, { retcode: starrail.Retcode.RET_GRID_FIGHT_POS_EXIST_ROLE });
            }
            // Deploying is capped by the level, benching is not: a move that
            // would push one role too many onto the field is refused whole.
            // 皇冠（`AvatarMaxNumberAdd`）等装备给的是额外上阵位，按队内已穿装备算。
            const deployed = finalPositions.filter((pos) => pos <= fieldLimit).length;
            const equipBonus = gridFightEquipmentEffects(teamEquippedIds(currentTeam(session.gridFightRun)))
                .avatarMaxNumberAdd;
            const limit = deployLimit(currentPlayer(session.gridFightRun), equipBonus);
            if (deployed > limit) {
                gfTrace(`updatePos rejected: deployed=${deployed} limit=${limit} level=`
                    + `${currentPlayer(session.gridFightRun).H_4a14c5ec} equipBonus=${equipBonus}`);
                return session.sendRsp(response, { retcode: starrail.Retcode.RET_GRID_FIGHT_REGION_FULL });
            }
            roles.forEach((role, index) => { role.pos = finalPositions[index]; });
            return session.sendRsp(response, { retcode: 0, AAKDHMHCMLP: changes });
        },
    },
    {
        cmdId: CmdID.CmdGridFightQuitSettleCsReq,
        action: async (_, session) => {
            const response = CmdID.CmdGridFightQuitSettleScRsp;
            if (!session.gridFightRun) return session.sendRsp(response, { retcode: noActiveRun });
            if (session.gridFightBattleId) {
                endBattle(session);
                session.gridFightBattleId = null;
            }
            const ack = session.sendRsp(response, { retcode: 0 });
            await Promise.all([ack, settleRun(session, 1)]);
        },
    },
    {
        cmdId: CmdID.CmdGridFightQuitLeaveGamePlayCsReq,
        action: (_, session) => {
            const retcode = session.gridFightRun ? 0 : noActiveRun;
            if (session.gridFightBattleId) {
                endBattle(session);
                session.gridFightBattleId = null;
            }
            session.gridFightRun = null;
            session.gridFightAwaitingPrepare = false;
            session.gridFightTraitEffects?.clear();
            return session.sendRsp(CmdID.CmdGridFightQuitLeaveGamePlayScRsp, { retcode });
        },
    },
    {
        cmdId: CmdID.CmdGridFightRecycleRoleCsReq,
        action: async (request, session) => {
            const response = CmdID.CmdGridFightRecycleRoleScRsp;
            const run = session.gridFightRun;
            if (!run) return session.sendRsp(response, { retcode: noActiveRun });
            if (session.gridFightBattleId || session.gridFightAwaitingPrepare) {
                return session.sendRsp(response, { retcode: dataLocked });
            }
            const roles: starrail.CDEAABODKCP[] = currentTeam(run).gridGameRoleList;
            const index = roles.findIndex((role) => role.uniqueId === request.uniqueId);
            if (index < 0) return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_ROLE_NOT_EXIST });
            const role = roles[index];
            const rarity = shopRarity.get(role.id);
            const price = gridFightSellPrices[rarity - 1]?.[role.roleStar - 1];
            if (price === undefined) return session.sendRsp(response, { retcode: configMissing });
            roles.splice(index, 1);
            const player = currentPlayer(run);
            player.gold_8 += price;
            await notifyUpdate(session, updateSource.GridFightUpdateSrcType_KGridFightSrcRecycleRole, [
                { HFCBOIOAECK: role.uniqueId }, { itemValue: player.gold_8 },
            ]);
            await session.sendRsp(response, { retcode: 0 });
        },
    },
    {
        cmdId: CmdID.CmdGridFightEquipDressCsReq,
        action: async (request, session) => {
            const response = CmdID.CmdGridFightEquipDressScRsp;
            const run = session.gridFightRun;
            if (!run) return session.sendRsp(response, { retcode: noActiveRun });
            if (session.gridFightBattleId || session.gridFightAwaitingPrepare) {
                return session.sendRsp(response, { retcode: dataLocked });
            }
            const team = currentTeam(run);
            const equipment = currentEquipment(run);
            if (!team || !equipment) return session.sendRsp(response, { retcode: configMissing });
            const roles = team.gridGameRoleList ?? [];
            // 4.6.54 的 proto 没有去混淆这两个字段，按内容判定谁是角色 unique_id，谁是被穿的装备实例，
            // 不预设字段语义（真机 capture 里 EquipDress 为 0 条，没有反证）。
            const first = request.PEBCBLBLMPH;
            const second = request.MDNAGANGNKK;
            const firstIsRole = roles.some((role) => role.uniqueId === first);
            const secondIsRole = roles.some((role) => role.uniqueId === second);
            if (firstIsRole === secondIsRole) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_ROLE_NOT_EXIST });
            }
            const roleUniqueId = firstIsRole ? first : second;
            const equipmentUniqueId = firstIsRole ? second : first;
            const role = roles.find((entry) => entry.uniqueId === roleUniqueId);
            const inventory = equipment.grid_fight_equipment_list ?? [];
            const item = inventory.find((entry) => entry.unique_id === equipmentUniqueId);
            if (!item) return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_EQUIP_NOT_EXIST });
            const equipped = team.PMEOPPDAMLM ?? (team.PMEOPPDAMLM = []);
            let worn = equipped.find((entry) => entry.unique_id === roleUniqueId);
            if (!worn) {
                worn = starrail.DDAMEHEPOBD.create({ unique_id: roleUniqueId, pos: role?.pos ?? 0 });
                equipped.push(worn);
            }
            const wornIds = (worn.unique_id_10 ?? [])
                .map((entry) => entry.GGMPEGMEHPD?.grid_fight_equipment_id ?? 0)
                .filter((id) => id > 0);
            const equipmentId = item.grid_fight_equipment_id;
            if (equipmentId > 0 && wornIds.includes(equipmentId)) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_EQUIP_DRESS_SAME });
            }
            if (!gridFightCanDress(wornIds, equipmentId, {
                roleId: role?.id,
                roleTraits: gridFightTraitsOfRole(role ? gridFightBattleAvatarId(role.id) : 0),
                teamEquippedIds: teamEquippedIds(team),
            })) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_EQUIP_CANNOT_DRESS });
            }
            const attachments = worn.unique_id_10 ?? (worn.unique_id_10 = []);
            attachments.push(starrail.MBPDIPLJMKN.create({
                GGMPEGMEHPD: starrail.ELGLKEAPLGM.create({ grid_fight_equipment_id: equipmentId }),
            }));
            // 穿戴后实例离开背包：线上穿戴表只记装备表 id，不保留实例 id。
            equipment.grid_fight_equipment_list = inventory.filter((entry) => entry !== item);
            await notifyUpdate(session, updateSource.GridFightUpdateSrcType_KGridFightSrcDressEquip, [
                { HFCBOIOAECK: roleUniqueId },
            ]);
            await session.sendRsp(response, { retcode: 0 });
        },
    },
    {
        cmdId: CmdID.CmdGridFightEquipCraftCsReq,
        action: async (request, session) => {
            const response = CmdID.CmdGridFightEquipCraftScRsp;
            const run = session.gridFightRun;
            if (!run) return session.sendRsp(response, { retcode: noActiveRun });
            if (session.gridFightBattleId || session.gridFightAwaitingPrepare) {
                return session.sendRsp(response, { retcode: dataLocked });
            }
            const team = currentTeam(run);
            const equipment = currentEquipment(run);
            if (!team || !equipment) return session.sendRsp(response, { retcode: configMissing });
            const inventory = equipment.grid_fight_equipment_list ?? [];
            // `EHDAKFEHPMF` 语义未去混淆：按「两个材料实例的 unique_id」解释；
            // 目标 id 在 `JCNLCNFHHDG`/`NNFECNICMOD` 之间按内容判定，都不像装备 id 时只凭材料定配方。
            const instanceIds = request.EHDAKFEHPMF ?? [];
            const materials = instanceIds.map((uniqueId) => inventory.find((entry) => entry.unique_id === uniqueId));
            if (materials.length !== 2 || materials.some((entry) => !entry)) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_EQUIP_NOT_EXIST });
            }
            const materialIds = materials.map((entry) => entry!.grid_fight_equipment_id);
            const wornEquipmentIds = teamEquippedIds(team);
            if (materialIds.some((equipmentId) => wornEquipmentIds.includes(equipmentId))) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_CRAFT_COST_EQUIP_DRESSED });
            }
            const declaredTarget = [request.JCNLCNFHHDG, request.NNFECNICMOD]
                .find((candidate) => candidate > 0 && gridFightEquipCategoryOf(candidate) !== null);
            const recipe = declaredTarget === undefined
                ? gridFightCraftByMaterials(materialIds)
                : gridFightCraftByTarget(declaredTarget, materialIds);
            if (!recipe) return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_ADD_EQUIP_FAIL });
            // 合成消耗两个材料实例，产出一个新实例；实例 id 取背包最大值 +1，避免与存档里的冲突。
            const nextUniqueId = Math.max(0, ...inventory.map((entry) => entry.unique_id ?? 0)) + 1;
            equipment.grid_fight_equipment_list = [
                ...inventory.filter((entry) => !materials.includes(entry)),
                starrail.IJDLENJJBHJ.create({
                    unique_id: nextUniqueId,
                    grid_fight_equipment_id: recipe.resultId,
                    source: starrail.GridFightEquipCraftSource.KGridFightEquipCraftSourceManual,
                }),
            ];
            // 合成成功后背包变了；通知载荷的变体语义未定（`KFNCAIHIHCM` 里没有可确认的装备字段），
            // 只推 `grid_update_src`，不猜具体变体，避免客户端按错误结构解析。
            await notifyUpdate(session, updateSource.GridFightUpdateSrcType_KGridFightSrcCraftEquip, []);
            await session.sendRsp(response, { retcode: 0 });
        },
    },
    {
        cmdId: CmdID.CmdGridFightTakeWeeklyRewardCsReq,
        action: async (request, session) => withGridFightMeta(session, async (meta) => {
            // 周常积分奖励（`GridFightScoreReward`，12 档 ×1500 分）。请求里是档位或奖励 id，
            // 两者都能对上配置才认；先整单校验（未知 / 已领 / 分数不足）再一次性写入。
            // 已领档位是账号级状态：同一 uid 的两条连接共用 `grid-fight-meta` 的账本，
            // 领取在账本队列里串行，后到的一条会看到先到那条刚写下的档位并回 6944。
            const response = CmdID.CmdGridFightTakeWeeklyRewardScRsp;
            const claimed = meta.weeklyRewardClaimed;
            const weeklyScore = session.state?.gridFightWeeklyScore ?? 0;
            const ranks: number[] = [];
            for (const requested of request.JKCEBHFIENI ?? []) {
                const row = gridFightScoreRewardByRank(requested)
                    ?? gridFightScoreRewardByRewardId(requested);
                if (!row) {
                    return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_PARAM_NOT_MATCH });
                }
                if (claimed.includes(row.rank) || ranks.includes(row.rank)) {
                    return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_WEEKLY_REWARD_TAKEN });
                }
                if (weeklyScore < row.score) {
                    return session.sendRsp(response, {
                        retcode: ret.RET_GRID_FIGHT_WEEKLY_SCORE_NOT_ENOUGH,
                    });
                }
                ranks.push(row.rank);
            }
            if (!ranks.length) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_PARAM_NOT_MATCH });
            }
            const rewardIds = ranks.map((rank) => gridFightScoreRewardByRank(rank)!.rewardId);
            meta.weeklyRewardClaimed = [...claimed, ...ranks];
            writeMetaToState(session, meta);
            // 已领档位是账号级存档：下一局/下次登录必须还认得，否则阶梯会被重复领取。
            await session.data?.saveDataInGame();
            return session.sendRsp(response, {
                retcode: 0,
                reward: { itemList: rewardIds.map((itemId) => ({ itemId, num: 1 })) },
                NGKOFMBBGNL: meta.weeklyRewardClaimed,
            });
        }),
    },
    {
        cmdId: CmdID.CmdGridFightTraitUpdateCsReq,
        action: (request, session) => {
            // 局内羁绊效果选择（`GridFightTraitUpdateCsReq { effect_id = 11; trait_id = 12 }`）。
            // 官方表里只有 17 个羁绊带 `TraitEffectList`（3006 有三个可选效果），其余羁绊只接受 0；
            // 选择结果先只留在会话里（`BattleAvatar` 的属性接线仍缺实机证据）。
            const response = CmdID.CmdGridFightTraitUpdateScRsp;
            const traitId = request.traitId ?? 0;
            const effectId = request.effectId ?? 0;
            if (!gridFightTraitInfo(traitId) || !gridFightTraitAcceptsEffect(traitId, effectId)) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_PARAM_NOT_MATCH });
            }
            const choices = session.gridFightTraitEffects ??= new Map<number, number>();
            if (effectId) choices.set(traitId, effectId);
            else choices.delete(traitId);
            return session.sendRsp(response, { retcode: 0 });
        },
    },
    {
        cmdId: CmdID.CmdGridFightPermanentTalentEnableCsReq,
        action: async (request, session) => withGridFightMeta(session, async (meta) => {
            // 局外永久天赋（`GridFightTalent` 13 行）。初始列表为空（客户端按需点亮），
            // 点亮不扣天赋点（`GridFight_TalentPointItemID = 281032` 的点数经济尚未建模），
            // 等价于「全解锁」；重置后可逐个重新点亮，顺序按 `PreTalentIDList` 校验。
            const response = CmdID.CmdGridFightPermanentTalentEnableScRsp;
            const talentId = request.CKHCLKOALKE ?? 0;
            const talent = gridFightPermanentTalent(talentId);
            if (!talent) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_PARAM_NOT_MATCH });
            }
            const enabled = meta.permanentTalents;
            if (enabled.includes(talentId)) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_TALENT_ENABLED, CKHCLKOALKE: talentId });
            }
            if (!gridFightTalentUnlockable(talent, enabled)) {
                return session.sendRsp(response, {
                    retcode: ret.RET_GRID_FIGHT_TALENT_PRE_NOT_ENABLED,
                    CKHCLKOALKE: talentId,
                });
            }
            meta.permanentTalents = [...enabled, talentId];
            writeMetaToState(session, meta);
            await session.data?.saveDataInGame();
            return session.sendRsp(response, { retcode: 0, CKHCLKOALKE: talentId });
        }),
    },
    {
        cmdId: CmdID.CmdGridFightPermanentTalentResetCsReq,
        action: async (_, session) => withGridFightMeta(session, async (meta) => {
            meta.permanentTalents = [];
            writeMetaToState(session, meta);
            await session.data?.saveDataInGame();
            return session.sendRsp(CmdID.CmdGridFightPermanentTalentResetScRsp, { retcode: 0 });
        }),
    },
    {
        cmdId: CmdID.CmdGridFightSeasonTalentEnableCsReq,
        action: async (request, session) => withGridFightMeta(session, async (meta) => {
            // 赛季天赋（`GridFightSeasonTalent` 40 行，SeasonID 1）与永久天赋同规则。
            const response = CmdID.CmdGridFightSeasonTalentEnableScRsp;
            const talentId = request.CKHCLKOALKE ?? 0;
            const talent = gridFightSeasonTalent(talentId);
            if (!talent) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_PARAM_NOT_MATCH });
            }
            const enabled = meta.seasonTalents;
            if (enabled.includes(talentId)) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_TALENT_ENABLED, CKHCLKOALKE: talentId });
            }
            if (!gridFightTalentUnlockable(talent, enabled)) {
                return session.sendRsp(response, {
                    retcode: ret.RET_GRID_FIGHT_TALENT_PRE_NOT_ENABLED,
                    CKHCLKOALKE: talentId,
                });
            }
            meta.seasonTalents = [...enabled, talentId];
            writeMetaToState(session, meta);
            await session.data?.saveDataInGame();
            return session.sendRsp(response, { retcode: 0, CKHCLKOALKE: talentId });
        }),
    },
    {
        cmdId: CmdID.CmdGridFightSeasonTalentResetCsReq,
        action: async (_, session) => withGridFightMeta(session, async (meta) => {
            meta.seasonTalents = [];
            writeMetaToState(session, meta);
            await session.data?.saveDataInGame();
            return session.sendRsp(CmdID.CmdGridFightSeasonTalentResetScRsp, { retcode: 0 });
        }),
    },
    {
        cmdId: CmdID.CmdGridFightUpdateEquipTrackCsReq,
        action: async (request, session) => withGridFightMeta(session, async (meta) => {
            // 装备追踪（推荐构筑追踪位，上限 `GridFight_MaxEquipTrackNum = 3`）。
            // 消息体里 `BGFFICLCKHE` 按装备 id、`NALMBOOCCIN` 按追踪位序号解释（两个字段都在
            // 优先级请求里成对出现，故取这个配对）；没有确认可用的下发槽位，状态只落服务端。
            const response = CmdID.CmdGridFightUpdateEquipTrackScRsp;
            const tracked = meta.equipTrack;
            const next = [...tracked];
            for (const entry of request.DKEIDONNDCJ ?? []) {
                const equipmentId = entry.BGFFICLCKHE ?? 0;
                if (gridFightEquipCategoryOf(equipmentId) === null) {
                    return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_EQUIP_NOT_EXIST });
                }
                if (!next.includes(equipmentId)) {
                    if (next.length >= gridFightMaxEquipTrack) {
                        return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_EQUIP_TRACK_MAX });
                    }
                    next.push(equipmentId);
                }
            }
            meta.equipTrack = next;
            writeMetaToState(session, meta);
            await session.data?.saveDataInGame();
            return session.sendRsp(response, { retcode: 0 });
        }),
    },
    {
        cmdId: CmdID.CmdGridFightUpdateEquipTrackPriorityCsReq,
        action: async (request, session) => withGridFightMeta(session, async (meta) => {
            // 追踪优先级：按 `NALMBOOCCIN` 升序重排追踪列表，只接受已在追踪列表里的装备。
            const response = CmdID.CmdGridFightUpdateEquipTrackPriorityScRsp;
            const tracked = meta.equipTrack;
            const entries = [...(request.BFCMLCJMLOL ?? [])].sort(
                (left, right) => (left.NALMBOOCCIN ?? 0) - (right.NALMBOOCCIN ?? 0),
            );
            const next: number[] = [];
            for (const entry of entries) {
                const equipmentId = entry.BGFFICLCKHE ?? 0;
                if (!tracked.includes(equipmentId)) {
                    return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_EQUIP_NOT_EXIST });
                }
                if (!next.includes(equipmentId)) next.push(equipmentId);
            }
            if (!next.length) {
                return session.sendRsp(response, { retcode: ret.RET_GRID_FIGHT_PARAM_NOT_MATCH });
            }
            meta.equipTrack = next;
            writeMetaToState(session, meta);
            await session.data?.saveDataInGame();
            return session.sendRsp(response, { retcode: 0 });
        }),
    },
    ...peripheralHandlers,
];
