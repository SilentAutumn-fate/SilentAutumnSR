import { randomBytes } from 'crypto';
import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { HandlerEntry } from './types';

/**
 * Gacha + the currency shop.
 *
 *   GetGachaInfoCsReq  (1934) -> GetGachaInfoScRsp  (1925)
 *   BuyGoodsCsReq      (1505) -> BuyGoodsScRsp      (1575)
 *   ExchangeHcoinCsReq (578)  -> ExchangeHcoinScRsp (504)
 *   DoGachaCsReq       (1905) -> DoGachaScRsp       (1975)
 *
 * Pity/guarantee state is deliberately *process-global* (module statics), not
 * per-session: the reference server keeps the same four counters in file-scope
 * statics and never persists them, so two clients share one pity track.
 */

/** pearl-sr Logic.Banner().GetStandardBanner() — the standard 5★ character pool. */
const STANDARD_BANNER: number[] = [1003, 1004, 1101, 1104, 1209, 1211];

/** pearl-sr Logic.Banner().GetRateUp() — the rate-up 5★ pool. */
const RATE_UP_BANNER: number[] = [1503];

/** pearl-sr Logic.Banner().GetRateUpFourStar() — the rate-up 4★ pool. */
const RATE_UP_FOUR_STAR_BANNER: number[] = [1210, 1108, 1207];

/** pearl-sr Data.LightconeList_3 — 20000..20022. */
const LIGHTCONE_LIST_3: number[] = Array.from({ length: 23 }, (_, i) => 20000 + i);

/**
 * pearl-sr Data.LightconeList_4 — 21000..21048, 21050..21052, 22000..22004.
 * 21049 is absent from the reference table (reproduced, gap included).
 */
const LIGHTCONE_LIST_4: number[] = [
    ...Array.from({ length: 49 }, (_, i) => 21000 + i),
    21050, 21051, 21052,
    22000, 22001, 22002, 22003, 22004,
];

/** Standard banner id advertised by GetGachaInfo. */
const GACHA_ID = 1001;
/** pearl-sr's constant banner end time (2030-01-01-ish, in seconds). */
const GACHA_END_TIME = 2524608000;
/** GachaCeiling.ceiling_num / DoGachaScRsp.ceiling_num. */
const CEILING_NUM = 200;
/** GachaCeilingAvatar.repeated_cnt. */
const CEILING_REPEATED_CNT = 300;
/** Hard pity: the 90th pull (pity == 89) is always a 5★. */
const FIVE_STAR_HARD_PITY = 89;
/** Hard pity: the 10th pull (pity == 9) is always a 4★. */
const FOUR_STAR_HARD_PITY = 9;

/**
 * Upper bound on pulls honoured per request. pearl-sr loops `gacha_num` times
 * with no validation, so a hostile client could ask for 4 billion pulls and hang
 * the process; the client itself only ever asks for 1 or 10. DEVIATION: larger
 * values are clamped (and `gachaNum` in the response still echoes the request,
 * as the reference does).
 */
const MAX_GACHA_NUM = 100;

// ---- pity / guarantee state (process-global, see file header) --------------

let fiveStarPity = 0;
let fourStarPity = 0;
let guaranteedFiveStarRateUp = false;
let guaranteedFourStarRateUp = false;

// ---- RNG -------------------------------------------------------------------

/**
 * RNG.
 *
 * pearl-sr draws from `std.crypto.random`, so pulls are not reproducible —
 * `DoGachaCsReq.gacha_random` is decoded and then ignored. The default here is
 * the same: unseeded `crypto.randomBytes`. Setting `SASR_GACHA_SEED=<uint32>`
 * swaps in a seeded xorshift32 generator so a fake-client run can be replayed;
 * the *call sequence* is identical either way, which is what the pity rules
 * depend on. Default (variable unset) = unseeded CSPRNG, matching the reference.
 */
function makeSeededRng(seed: number): () => number {
    let state = seed >>> 0 || 0x9e3779b9;
    return () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state;
    };
}

const seedEnv = process.env.SASR_GACHA_SEED;
const seededRng = seedEnv ? makeSeededRng(Number(seedEnv) >>> 0) : null;

function nextUint32(): number {
    if (seededRng) return seededRng();
    return randomBytes(4).readUInt32BE(0);
}

/** Uniform [0, 1). */
function randomFloat(): number {
    return nextUint32() / 4294967296;
}

/** Uniform coin flip. */
function randomBoolean(): boolean {
    return (nextUint32() & 1) === 1;
}

/**
 * Uniform integer in [0, n), rejection-sampled so it is unbiased like pearl-sr's
 * `intRangeLessThan`. Returns 0 for an empty table instead of crashing (the
 * reference would panic); callers warn when that happens.
 */
function randomIntBelow(n: number): number {
    if (n <= 0) return 0;
    const limit = Math.floor(4294967296 / n) * n;
    let value = nextUint32();
    while (value >= limit) value = nextUint32();
    return value % n;
}

function pickRandomId(banner: number[]): number {
    if (banner.length === 0) {
        console.warn('[gacha] picked from an empty banner pool; returning 0');
        return 0;
    }
    return banner[randomIntBelow(banner.length)];
}

// ---- rates -----------------------------------------------------------------

/** Same definition as pearl-sr's `pow` (exp(exp * log(base))). */
function pow(base: number, exp: number): number {
    return Math.exp(exp * Math.log(base));
}

/**
 * 5★ rate for the given pity value. Note the shape: 2% flat for pity 0..20, then
 * a *lower* 0.8% base from 21 until the soft-pity ramp at 72. Values are read
 * from the pity counter *before* the pull is accounted for.
 */
function getFiveStarRate(gachaCount: number): number {
    if (gachaCount < 21) return 0.02;
    if (gachaCount < 72) return 0.008;
    const excessPulls = gachaCount - 71;
    return 0.008 + (1.0 - 0.008) * pow(excessPulls / 18.0, 2.8);
}

/** 4★ rate for the given pity value: 5.5% flat for pity 0..5, then a ramp. */
function getFourStarRate(gachaCount: number): number {
    if (gachaCount < 6) return 0.055;
    const excessPulls = gachaCount - 5;
    return 0.055 + (1.0 - 0.055) * pow(excessPulls / 3.5, 2.2);
}

/**
 * The 4★ *character* pool used when a non-guaranteed 4★ loses its 70/30 and then
 * flips to "character" rather than "lightcone".
 *
 * pearl-sr derives Data.AvatarList from AvatarConfig.json at startup: rows whose
 * AvatarID equals their AdventurePlayerID, id <= 8001, id != 1224, rarity 4 (22
 * ids). That pool is design data, not owned-avatar data, so the same predicate is
 * applied to ConfigManager here instead of being read from the freesr profile.
 * `AdventurePlayerID` is present in AvatarConfig.json but missing from the
 * ConfigManager interface, hence the cast.
 */
let fourStarCharacterPoolCache: number[] | null = null;

function fourStarCharacterPool(session: NetSession): number[] {
    if (fourStarCharacterPoolCache) return fourStarCharacterPoolCache;

    const pool: number[] = [];
    for (const cfg of session.config.avatarConfig.values()) {
        if (cfg.AvatarID !== (cfg as any).AdventurePlayerID) continue;
        if (cfg.AvatarID > 8001 || cfg.AvatarID === 1224) continue;
        if (cfg.Rarity === 'CombatPowerAvatarRarityType4') pool.push(cfg.AvatarID);
    }
    if (pool.length === 0) {
        console.warn('[gacha] derived 4-star character pool is empty; gacha will return itemId 0');
    }
    fourStarCharacterPoolCache = pool;
    return pool;
}

// ---- handlers --------------------------------------------------------------

/**
 * The single advertised banner: the standard pool as its ceiling list.
 *
 * Built as a local rather than an inline literal because the static field checker
 * (dev/tools/check-proto-fields.js) validates a nested object literal's keys against
 * the enclosing message, which turns every nested key into a false "unknown
 * field" report.
 */
function gachaInfo(): starrail.GachaInfo {
    return {
        gachaId: GACHA_ID,
        beginTime: 0,
        endTime: GACHA_END_TIME,
        gachaCeiling: {
            ceilingNum: CEILING_NUM,
            isClaimed: false,
            avatarList: STANDARD_BANNER.map((avatarId) => ({
                repeatedCnt: CEILING_REPEATED_CNT,
                avatarId,
            })),
        },
    };
}

export async function onGetGachaInfoCsReq(
    _req: starrail.GetGachaInfoCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdGetGachaInfoScRsp, {
        retcode: 0,
        gachaRandom: 0,
        gachaInfoList: [gachaInfo()],
    });
}

/** Shop purchase: a fixed 101 × 100 grant regardless of goods or price. */
export async function onBuyGoodsCsReq(req: starrail.BuyGoodsCsReq, session: NetSession): Promise<void> {
    const returnItemList: starrail.ItemList = { itemList: [{ itemId: 101, num: 100 }] };

    await session.sendRsp(CmdID.CmdBuyGoodsScRsp, {
        retcode: 0,
        goodsId: req?.goodsId ?? 0,
        goodsBuyTimes: req?.goodsNum ?? 0,
        shopId: 0,
        returnItemList,
    });
}

/** Hcoin exchange: echoes the amount; no currency is actually moved. */
export async function onExchangeHcoinCsReq(
    req: starrail.ExchangeHcoinCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdExchangeHcoinScRsp, {
        retcode: 0,
        num: req?.num ?? 0,
    });
}

/**
 * One GachaItem result.
 *
 * `transferItemList` rules (spec Part C §C.5): a 5★ character (id < 10000 that is
 * in the rate-up or standard banner) converts to its 11000-series shard item plus
 * 20 × item 252; any other character gets only 252 × 20; a lightcone (id >= 10000)
 * gets an empty transfer list. `tokenItem` is always 252 × 20, and `isNew` is
 * always false in the reference.
 */
function makeGachaItem(id: number): starrail.GachaItem {
    let transferItemList: starrail.ItemList = { itemList: [] };
    if (id < 10000) {
        if (RATE_UP_BANNER.includes(id) || STANDARD_BANNER.includes(id)) {
            transferItemList = {
                itemList: [
                    { itemId: id + 10000, num: 1 },
                    { itemId: 252, num: 20 },
                ],
            };
        } else {
            transferItemList = { itemList: [{ itemId: 252, num: 20 }] };
        }
    }

    return {
        gachaItem: { itemId: id },
        isNew: false,
        transferItemList,
        tokenItem: { itemList: [{ itemId: 252, num: 20 }] },
    };
}

/**
 * One pull (or ten).
 *
 * Exact port of pearl-sr's onDoGacha, including the quirks the spec calls out:
 *
 *  * both rates are computed once per pull from the pity values *before* the pull;
 *  * RNG draw #1 (the float) happens on every pull, including a hard-pity pull —
 *    `pity == 89` short-circuits the comparison, not the roll;
 *  * a 5★ hit resets `fiveStarPity` to 0 and then the unconditional `pity += 1`
 *    one line later leaves it at **1**, while `fourStarPity` is left untouched by
 *    a 5★ hit (only the 4★ branch clears it);
 *  * a lost 5★ coin flip sets the 5★ guarantee; a lost 70/30 sets the 4★
 *    guarantee, and the 4★ guarantee short-circuits the 70/30 roll entirely;
 *  * for a multi-pull that produced no 4★, one *uniformly chosen index* of the
 *    whole result list (possibly a 5★ slot) is overwritten with a rate-up 4★.
 */
export async function onDoGachaCsReq(req: starrail.DoGachaCsReq, session: NetSession): Promise<void> {
    const requested = Math.max(0, Math.floor(Number(req?.gachaNum ?? 0) || 0));
    const gachaNum = Math.min(requested, MAX_GACHA_NUM);
    if (requested > gachaNum) {
        console.warn(`[gacha] gacha_num ${requested} clamped to ${MAX_GACHA_NUM}`);
    }

    const rateUpBanner = RATE_UP_BANNER;
    const standardBanner = STANDARD_BANNER;
    const rateUpFourStarBanner = RATE_UP_FOUR_STAR_BANNER;
    const characterPool = fourStarCharacterPool(session);

    const selectedIds: number[] = [];
    let gotFourStar = false;

    for (let i = 0; i < gachaNum; i++) {
        const fiveStarRate = getFiveStarRate(fiveStarPity);
        const fourStarRate = getFourStarRate(fourStarPity);
        const randomValue = randomFloat(); // RNG #1 — always consumed
        let selectedBanner: number[] = LIGHTCONE_LIST_3; // default: 3★ lightcones

        if (randomValue < fiveStarRate || fiveStarPity === FIVE_STAR_HARD_PITY) {
            fiveStarPity = 0;
            if (guaranteedFiveStarRateUp) {
                selectedBanner = rateUpBanner;
                guaranteedFiveStarRateUp = false;
            } else if (randomBoolean()) {
                // RNG #2 (only when there is no guarantee)
                selectedBanner = rateUpBanner;
            } else {
                selectedBanner = standardBanner;
                guaranteedFiveStarRateUp = true;
            }
            // fourStarPity is intentionally NOT cleared here (reference quirk).
        } else if (
            fourStarPity === FOUR_STAR_HARD_PITY ||
            randomValue < fiveStarRate + fourStarRate
        ) {
            fourStarPity = 0;
            gotFourStar = true;
            if (guaranteedFourStarRateUp || randomFloat() < 0.7) {
                // RNG #2 in the 4★ branch — skipped entirely when guaranteed.
                selectedBanner = rateUpFourStarBanner;
                guaranteedFourStarRateUp = false;
            } else {
                // RNG #3: character pool or 4★ lightcones.
                selectedBanner = randomBoolean() ? characterPool : LIGHTCONE_LIST_4;
                guaranteedFourStarRateUp = true;
            }
        } else {
            fourStarPity += 1;
        }

        // Unconditional, and after the reset above: a 5★ hit therefore ends with
        // fiveStarPity == 1.
        fiveStarPity += 1;
        selectedIds.push(pickRandomId(selectedBanner));
    }

    // 10-pull insurance.
    if (gachaNum > 1 && !gotFourStar && selectedIds.length > 0) {
        selectedIds[randomIntBelow(selectedIds.length)] = pickRandomId(rateUpFourStarBanner);
    }

    await session.sendRsp(CmdID.CmdDoGachaScRsp, {
        retcode: 0,
        // Echoes the *requested* count, not the number of items produced.
        gachaNum: req?.gachaNum ?? 0,
        gachaId: req?.gachaId ?? 0,
        ceilingNum: CEILING_NUM,
        gachaItemList: selectedIds.map(makeGachaItem),
    });

    console.debug(
        `FIVE STAR PITY: ${fiveStarPity}, (RATE: ${(getFiveStarRate(fiveStarPity) * 100).toFixed(4)}%)`,
    );
    console.debug(
        `FOUR STAR PITY: ${fourStarPity}, (RATE: ${(getFourStarRate(fourStarPity) * 100).toFixed(4)}%)`,
    );
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetGachaInfoCsReq, action: onGetGachaInfoCsReq },
    { cmdId: CmdID.CmdBuyGoodsCsReq, action: onBuyGoodsCsReq },
    { cmdId: CmdID.CmdExchangeHcoinCsReq, action: onExchangeHcoinCsReq },
    { cmdId: CmdID.CmdDoGachaCsReq, action: onDoGachaCsReq },
];
