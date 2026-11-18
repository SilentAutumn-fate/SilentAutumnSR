import * as fs from 'fs';
import * as path from 'path';

import type { NetSession } from '../../NetSession';
import { isMarch7th, isTrailblazer } from '../../manager/avatar_mgr';
import { resourcesDir } from '../../manager/config_mgr';
import type { ChallengeConfig, StageConfig } from '../../manager/config_mgr';

/**
 * `/test`, `/node`, `/set`, `/id` and `/funmode` — port of pearl-sr
 * `gameserver/src/commands/value.zig` (the reference's grab-bag command module;
 * its `command.zig` registry maps these five handlers onto the command words
 * `test`, `node`, `set`, `id` and `funmode` — there is no `/value` command).
 *
 * This file also owns the argument lexer every command in this package uses:
 * pearl-sr's `value.zig` is the module that exercises Zig's tokenizers the
 * hardest (`/set` uses `splitSequence`, `/id` uses `tokenizeScalar`, `/funmode`
 * uses `tokenizeAny`), so the emulations live here and `/tp` imports them.
 *
 * State, and where it lives here rather than in the reference:
 *
 *  - `utils/logic.zig` keeps `CustomMode()` and `FunMode()` in **process-global**
 *    statics. They are per-connection here (a `WeakMap` keyed by the session, as
 *    PORTING-GUIDE requires for module-owned state), because a multi-connection
 *    server must not let one player's `/id 1001 floor 1 node 2` retarget another
 *    player's challenge. Accessors are exported so the challenge and battle
 *    handlers can read the same selection.
 *  - `Banner()` is **deliberately kept process-global** like the reference: the
 *    gacha pools are server-wide configuration, not per-player state. The
 *    getters/setters below are the read side the gacha handler needs.
 */

// ---- argument lexing (Zig std.mem emulation) --------------------------------

/**
 * Zig `std.mem.splitSequence(u8, s, " ")` semantics, which is exactly what
 * JavaScript's `String.prototype.split(' ')` does:
 *
 *  - an empty buffer yields **one empty field** (not "no field"),
 *  - a run of spaces yields empty fields,
 *  - a trailing delimiter yields a trailing empty field.
 *
 * The distinction matters: pearl-sr's `/tp` and `/set` iterators are
 * `orelse`-checked, and the "missing argument" branches are unreachable because
 * of the empty-buffer rule.
 */
function splitFields(input: string): string[] {
    return input.split(' ');
}

/**
 * Zig `std.mem.tokenizeAny/tokenizeScalar(u8, s, ' ')` semantics: leading,
 * trailing and repeated delimiters are skipped, so no empty token is produced.
 */
function tokenizeSpaces(input: string): string[] {
    return input.split(' ').filter((token) => token.length > 0);
}

/** `std.mem.trim(u8, s, " ")` — trims spaces only, not newlines or tabs. */
function trimSpaces(input: string): string {
    return input.replace(/^ +/, '').replace(/ +$/, '');
}

/** A cursor over split fields; `next()` is the reference's `arg_iter.next()`. */
interface FieldCursor {
    next(): string | null;
}

function fieldCursor(fields: string[]): FieldCursor {
    let index = 0;
    return {
        next: () => (index < fields.length ? fields[index++] : null),
    };
}

/**
 * `std.fmt.parseInt` for a decimal unsigned/signed integer:
 * an empty buffer or a non-digit is an error, a leading '+' is accepted, '_' is
 * skipped anywhere (Zig's digit separator), and the value must fit the type.
 * Returns `undefined` where Zig returns a parse/overflow error.
 */
function parseZigInteger(text: string, min: number, max: number): number | undefined {
    let body = text ?? '';
    let negative = false;
    if (body.startsWith('+')) {
        body = body.slice(1);
    } else if (body.startsWith('-')) {
        negative = true;
        body = body.slice(1);
    }
    if (body.length === 0) return undefined;

    // Compare digit by digit so a long literal cannot silently lose precision.
    const limit = Math.abs(negative ? min : max);
    let value = 0;
    for (const char of body) {
        if (char === '_') continue;
        if (char < '0' || char > '9') return undefined;
        value = value * 10 + (char.charCodeAt(0) - 48);
        if (value > limit) return undefined;
    }
    return negative ? -value : value;
}

/** `std.fmt.parseInt(u32, …)`: 0 … 4294967295. */
export function parseU32(text: string): number | undefined {
    return parseZigInteger(text, 0, 0xffffffff);
}

/** `std.fmt.parseInt(u8, …)`: 0 … 255 (used for `/id … node <n>`). */
export function parseU8(text: string): number | undefined {
    return parseZigInteger(text, 0, 0xff);
}

/** `std.fmt.parseInt(usize, …)` — the reference's buff index. */
export function parseIndex(text: string): number | undefined {
    return parseZigInteger(text, 0, Number.MAX_SAFE_INTEGER);
}

/** `std.fmt.parseInt(i64, …)` — used by `/funmode hp <n>`. */
export function parseI64(text: string): number | undefined {
    return parseZigInteger(text, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
}

// ---- reply assembly ---------------------------------------------------------

/**
 * pearl-sr answers a command with 0..n separate `RevcMsgScNotify` packets. The
 * dispatcher returns one string, so several messages are joined here — but only
 * with a newline when the previous line does not already end in one, which keeps
 * the reference's line breaks without introducing blank lines.
 */
export class ReplyBuilder {
    private parts: string[] = [];

    public add(text: string): this {
        this.parts.push(text);
        return this;
    }

    public addAll(texts: string[]): this {
        for (const text of texts) this.parts.push(text);
        return this;
    }

    public text(): string | undefined {
        let out = '';
        for (const part of this.parts) {
            if (out.length > 0 && !out.endsWith('\n')) out += '\n';
            out += part;
        }
        return this.parts.length === 0 ? undefined : out;
    }
}

// ---- per-session state (utils/logic.zig CustomMode() + FunMode()) -----------

/** `Logic.CustomMode()` + `Logic.FunMode()`, per connection. */
export interface CommandState {
    /** `CustomMode().challenge_node`: 0 = first node, 1 = second. */
    challengeNode: number;
    /** `CustomMode().custom_mode`. */
    customMode: boolean;
    /** `CustomMode().selected_challenge_id`. */
    customChallengeId: number;
    /** `CustomMode().selected_buff_id`. */
    customBuffId: number;
    /** `FunMode().on_funmode`. */
    funMode: boolean;
    /** `FunMode().max_Hp` (0 = use the real HP value). */
    funModeHp: number;
    /** `BattleManager.funmodeAvatarID`, rewritten by `/funmode on`. */
    funModeAvatarIds: number[];
}

const scratchBySession = new WeakMap<NetSession, CommandState>();

/** The calling module's per-connection command state. */
export function commandState(session: NetSession): CommandState {
    let state = scratchBySession.get(session);
    if (!state) {
        state = {
            challengeNode: 0,
            customMode: false,
            customChallengeId: 0,
            customBuffId: 0,
            funMode: false,
            funModeHp: 0,
            funModeAvatarIds: [],
        };
        scratchBySession.set(session, state);
    }
    return state;
}

// Read side for the challenge / battle handlers: `Logic.CustomMode()` and
// `Logic.FunMode()` are the reference's cross-module switches.

/** `Logic.CustomMode().CustomMode()` — `/id … ` turned the custom node on. */
export function isCustomMode(session: NetSession): boolean {
    return commandState(session).customMode;
}

/** `Logic.CustomMode().FirstNode()` — true while the first challenge node is selected. */
export function isFirstChallengeNode(session: NetSession): boolean {
    return commandState(session).challengeNode === 0;
}

/** `Logic.CustomMode().GetChallengeNode()`. */
export function getChallengeNode(session: NetSession): number {
    return commandState(session).challengeNode;
}

/** `Logic.CustomMode().GetCustomChallengeID()`. */
export function getCustomChallengeId(session: NetSession): number {
    return commandState(session).customChallengeId;
}

/** `Logic.CustomMode().GetCustomBuffID()`. */
export function getCustomBuffId(session: NetSession): number {
    return commandState(session).customBuffId;
}

/** `Logic.CustomMode().SetCustomMode()`, for handlers that clear the selection. */
export function setCustomMode(session: NetSession, on: boolean): void {
    commandState(session).customMode = on;
}

/** `Logic.FunMode().FunMode()`. */
export function isFunMode(session: NetSession): boolean {
    return commandState(session).funMode;
}

/** `Logic.FunMode().GetHp()`. */
export function getFunModeHp(session: NetSession): number {
    return commandState(session).funModeHp;
}

/** `BattleManager.funmodeAvatarID`. */
export function getFunModeAvatarIds(session: NetSession): number[] {
    return commandState(session).funModeAvatarIds;
}

// ---- gacha banner pools (utils/logic.zig Banner()) ---------------------------

/**
 * Defaults from `Logic.Banner()`, verbatim. These are process-global on purpose:
 * `/set` rewrites server-wide gacha configuration, exactly as in the reference
 * (which is why `/set` is not per-connection state).
 */
export const DEFAULT_STANDARD_BANNER: number[] = [1003, 1004, 1101, 1104, 1209, 1211];
export const DEFAULT_RATE_UP: number[] = [1503];
export const DEFAULT_RATE_UP_FOUR_STARS: number[] = [1210, 1108, 1207];

let standardBannerPool = [...DEFAULT_STANDARD_BANNER];
let rateUpPool = [...DEFAULT_RATE_UP];
let rateUpFourStarPool = [...DEFAULT_RATE_UP_FOUR_STARS];

/** `Logic.Banner().GetStandardBanner()` — read by the gacha handler. */
export function getStandardBanner(): number[] {
    return standardBannerPool;
}

/** `Logic.Banner().GetRateUp()`. */
export function getRateUp(): number[] {
    return rateUpPool;
}

/** `Logic.Banner().GetRateUpFourStar()`. */
export function getRateUpFourStars(): number[] {
    return rateUpFourStarPool;
}

// ---- `/test` ----------------------------------------------------------------

/** `value.zig::handle` — the command the reference registers as `/test`. */
export function testCommand(): string {
    return 'Test Command for Chat\n';
}

// ---- `/node` ----------------------------------------------------------------

/**
 * `value.zig::challengeNode` -> `Logic.CustomMode().ChangeNode()`.
 *
 * The reference toggles `challenge_node` between 0 and 1 and reports the node it
 * switched **to**.
 */
export function challengeNodeCommand(session: NetSession): string {
    const state = commandState(session);
    if (state.challengeNode === 0) {
        state.challengeNode = 1;
        return 'Change Challenge Node 2\n';
    }
    state.challengeNode = 0;
    return 'Change Challenge Node 1\n';
}

// ---- `/set` -----------------------------------------------------------------

/** `isValidAvatarId`: pearl-sr accepts a 4-digit id. */
function isValidAvatarId(id: number): boolean {
    return id >= 1000 && id <= 9999;
}

const INVALID_AVATAR_ID = 'Error: Invalid avatar ID. Please provide a valid unsigned 32-bit integer.';

/**
 * `value.zig::setGachaCommand`.
 *
 * NOTE: the reference's `orelse` branch — "Error: Missing sub-command. Usage:
 * /set <sub-command> [arguments]" — is unreachable, because `splitSequence` on
 * an empty buffer yields one empty field rather than null. Bare `/set` therefore
 * falls through to the "Unknown sub-command" answer below, exactly as it does in
 * pearl-sr.
 */
export function setGachaCommand(args: string): string {
    const cursor = fieldCursor(splitFields(args));
    const subCommand = cursor.next() ?? '';

    if (subCommand === 'standard') return setStandardBannerCommand(cursor);
    if (subCommand === 'rateup') {
        const number = cursor.next();
        if (number === null) return 'Error: Missing number for rateup. Usage: /set rateup <number>';
        if (number === '5') return setRateUpFiveStarCommand(cursor);
        if (number === '4') return setRateUpFourStarCommand(cursor);
        return 'Error: Invalid rateup number. Please use 4 (four stars) or 5 (5 stars).';
    }
    return 'Error: Unknown sub-command. Available: standard, rateup 5, rateup 4';
}

/** `/set standard <id> <id> <id> <id> <id> <id>` — exactly six ids. */
function setStandardBannerCommand(cursor: FieldCursor): string {
    const ids: number[] = [];
    while (ids.length < 6) {
        const text = cursor.next();
        if (text === null) break;
        const id = parseU32(text);
        if (id === undefined) return INVALID_AVATAR_ID;
        if (!isValidAvatarId(id)) return 'Error: Invalid Avatar ID format.';
        ids.push(id);
    }
    // The reference checks "another field exists" BEFORE the count.
    if (cursor.next() !== null || ids.length !== 6) {
        return 'Error: You must provide exactly 6 avatar IDs.';
    }
    standardBannerPool = [...ids];
    return `Set standard banner ID to: ${ids.join(', ')}`;
}

/** `/set rateup 5 <id>` — exactly one id. */
function setRateUpFiveStarCommand(cursor: FieldCursor): string {
    const text = cursor.next();
    if (text === null) return 'Error: You must provide a rate-up avatar ID.';
    const id = parseU32(text);
    if (id === undefined) return INVALID_AVATAR_ID;
    if (!isValidAvatarId(id)) return 'Error: Invalid Avatar ID format.';
    if (cursor.next() !== null) return 'Error: Only one rate-up avatar ID is allowed.';
    rateUpPool = [id];
    return `Set rate up ID to: ${id}`;
}

/** `/set rateup 4 <id> <id> <id>` — exactly three ids. */
function setRateUpFourStarCommand(cursor: FieldCursor): string {
    const ids: number[] = [];
    while (ids.length < 3) {
        const text = cursor.next();
        if (text === null) break;
        const id = parseU32(text);
        if (id === undefined) return INVALID_AVATAR_ID;
        if (!isValidAvatarId(id)) return 'Error: Invalid Avatar ID format.';
        ids.push(id);
    }
    if (cursor.next() !== null || ids.length !== 3) {
        return 'Error: You must provide exactly 3 avatar IDs.';
    }
    rateUpFourStarPool = [...ids];
    return `Set 4 star rate-up ID to: ${ids.join(', ')}`;
}

// ---- `/id` ------------------------------------------------------------------

/** Challenge mode names by `group_id / 1000`, as the reference spells them. */
function challengeModeName(groupId: number): string {
    switch (Math.trunc(groupId / 1000)) {
        case 1:
            return 'MoC';
        case 2:
            return 'PF';
        case 3:
            return 'AS';
        default:
            return 'Unknown';
    }
}

/**
 * `ChallengeMazeConfig.json` rows carry `Floor`, which the shared
 * `ConfigManager` interface does not declare (see the final report): the table
 * is indexed by `ID` and typed without it. Read it through this alias instead of
 * editing the shared file.
 */
type ChallengeRow = ChallengeConfig & { Floor?: number };

function challengeRows(session: NetSession): ChallengeRow[] {
    return [...session.config.challengeConfig.values()] as ChallengeRow[];
}

/** The reference's first-match linear scan over `(group_id, floor)`. */
function findChallenge(session: NetSession, groupId: number, floor: number): ChallengeRow | undefined {
    return challengeRows(session).find((row) => row.GroupID === groupId && row.Floor === floor);
}

/**
 * `value.zig::onBuffId` — the command the reference registers as `/id`.
 *
 * Three shapes are accepted:
 *   `/id info`                              -> current challenge ids
 *   `/id off`                               -> custom mode off
 *   `/id <group> floor <n> node <1|2> [keyword]`
 *
 * QUIRK (reproduced): the reference rejects anything with **fewer than six**
 * tokens, but the form it prints in the usage line has only five — so plain
 * `/id 1001 floor 1 node 1` answers with "Error: Usage: …" and a sixth token is
 * mandatory. For MoC that token is `set`; for PF/AS it is any word other than
 * `buff`/`set`, which then falls through to the stage listing.
 */
export function buffIdCommand(session: NetSession, input: string): string | undefined {
    if (trimSpaces(input).toLowerCase() === 'info') return buffInfoCommand(session);

    // `std.mem.tokenizeScalar(u8, input, ' ')`: runs of spaces collapse.
    const tokens = tokenizeSpaces(input);
    if (tokens.length === 0) return 'Error: Missing command arguments.';

    const state = commandState(session);
    if (tokens[0].toLowerCase() === 'off') {
        state.customMode = false;
        return 'Custom mode OFF.';
    }

    if (tokens.length < 6) return 'Error: Usage: /id <group_id> floor <n> node <1|2>';

    const groupId = parseU32(tokens[0]);
    if (groupId === undefined) return 'Error: Invalid group ID.';
    if (tokens[1].toLowerCase() !== 'floor') return "Error: Expected 'floor' keyword.";
    const floor = parseU32(tokens[2]);
    if (floor === undefined) return 'Error: Invalid floor number.';
    if (tokens[3].toLowerCase() !== 'node') return "Error: Expected 'node' keyword.";
    const node = parseU8(tokens[4]);
    if (node === undefined) return 'Error: Invalid node number.';
    if (node !== 1 && node !== 2) return 'Error: Node must be 1 or 2.';

    state.challengeNode = node - 1;

    // "Challenge mode: …" is sent before any validation below, so every early
    // exit keeps it — the reference's `sendMessage` calls are not undone by a
    // later error.
    const reply = new ReplyBuilder().add(`Challenge mode: ${challengeModeName(groupId)}`);

    const challenge = findChallenge(session, groupId, floor);
    if (!challenge) return reply.add('Error: Could not find matching challenge ID.').text();

    if (tokens.length > 5) {
        const keyword = tokens[5].toLowerCase();
        if (keyword === 'buff') {
            if (tokens.length < 7) {
                return reply.add('Error: Missing buff sub-command (info/set <index>).').text();
            }
            const sub = tokens[6].toLowerCase();
            if (sub === 'info') return reply.addAll(buffInfoLines(groupId, node)).text();
            if (sub === 'set') return reply.add("Error: Missing buff index for 'set' command.").text();

            const buffIndex = parseIndex(tokens[6]);
            if (buffIndex === undefined) return reply.add('Error: Invalid buff index.').text();
            if (tokens.length < 8 || tokens[7].toLowerCase() !== 'set') {
                return reply.add("Error: Expected 'set' after buff index.").text();
            }
            return reply.add(selectBuff(session, groupId, node, buffIndex, challenge.ID)).text();
        }
        if (keyword === 'set') {
            if (Math.trunc(groupId / 1000) !== 1) {
                return reply
                    .add("Error: Unexpected 'set' command. Did you mean 'buff <index> set' ?")
                    .text();
            }
            return reply.add(selectMoCChallenge(session, challenge.ID)).text();
        }
        // Any other keyword falls through to the stage/event lookup below,
        // exactly like the reference.
    }

    const nodeList = node === 1 ? challenge.EventIDList1 : challenge.EventIDList2;
    const eventId = nodeList && nodeList.length > 0 ? nodeList[0] : null;
    if (eventId === null) return reply.add('Error: Could not find matching EventID.').text();

    if (Math.trunc(groupId / 1000) === 1) {
        return reply.add(selectMoCChallenge(session, challenge.ID)).text();
    }

    const stage = session.config.getStage(eventId);
    if (!stage) return reply.add('Error: Stage not found for given EventID.').text();
    return reply.addAll(stageInfoLines(groupId, floor, node, stage)).text();
}

/** `value.zig::handleMoCSelectChallenge`. */
function selectMoCChallenge(session: NetSession, challengeId: number): string {
    const state = commandState(session);
    state.customChallengeId = challengeId;
    state.customBuffId = 0;
    state.customMode = true;
    return `Selected MoC Challenge ID: ${challengeId}`;
}

/** `value.zig::handleBuffSetCommand` — buff indices are 1-based. */
function selectBuff(
    session: NetSession,
    groupId: number,
    node: number,
    buffIndex: number,
    challengeId: number,
): string {
    const list = buffsForNode(groupId, node);
    if (list === undefined) return 'Error: Buff group ID not found.';
    if (buffIndex === 0 || buffIndex > list.length) return 'Error: Buff index out of range.';

    const buff = list[buffIndex - 1];
    const state = commandState(session);
    state.customChallengeId = challengeId;
    state.customBuffId = buff.id;
    state.customMode = true;
    return `Selected Challenge ID: ${challengeId}, Buff ID: ${buff.id} - ${buff.name}`;
}

/** `value.zig::sendBuffInfo` — one message per buff. */
function buffInfoLines(groupId: number, node: number): string[] {
    const list = buffsForNode(groupId, node);
    if (list === undefined) return ['Error: Buff group ID not found.'];
    return list.map((buff) => `id: ${buff.id} - ${buff.name}`);
}

function buffsForNode(groupId: number, node: number): BuffInfoEntry[] | undefined {
    const row = buffInfoRows().find((entry) => entry.GroupID === groupId);
    if (row) return (node === 1 ? row.BuffList1 : row.BuffList2) ?? [];
}

/** `value.zig::onBuffInfo` — the highest group id of each challenge family. */
function buffInfoCommand(session: NetSession): string {
    let maxMoc = 0;
    let maxPf = 0;
    let maxAs = 0;

    for (const row of challengeRows(session)) {
        const id = row.GroupID;
        if (id >= 1000 && id < 2000) {
            if (id > maxMoc) maxMoc = id;
        } else if (id >= 2000 && id < 3000) {
            if (id > maxPf) maxPf = id;
        } else if (id >= 3000 && id < 4000) {
            if (id > maxAs) maxAs = id;
        }
    }

    return `Current Challenge IDs: MoC: ${maxMoc}, PF: ${maxPf}, AS: ${maxAs}`;
}

/**
 * `value.zig::sendStageInfo` — the stage header plus one line per monster wave.
 *
 * `StageConfig.MonsterList` is `number[][]` (waves of monster ids) in the JSON,
 * but the shared interface declares it `number[]`; the cast is deliberate.
 */
function stageInfoLines(groupId: number, floor: number, node: number, stage: StageConfig): string[] {
    const lines = [`GroupID: ${groupId}, Floor: ${floor}, Node: ${node}, StageID: ${stage.StageID}`];
    const waves = (stage.MonsterList ?? []) as unknown as number[][];
    waves.forEach((wave, index) => {
        let line = `wave ${index + 1}:`;
        for (const monsterId of wave) line += ` ${monsterId},`;
        lines.push(line);
    });
    return lines;
}

// ---- BuffInfoConfig.json ----------------------------------------------------

interface BuffInfoEntry {
    id: number;
    name: string;
}

interface BuffInfoRow {
    GroupID: number;
    BuffList1?: BuffInfoEntry[];
    BuffList2?: BuffInfoEntry[];
}

let buffInfoCache: BuffInfoRow[] | null = null;

/**
 * `resources/BuffInfoConfig.json` -> `text_map_config`.
 *
 * `ConfigManager` does not load this table (its `GameConfigCache` equivalent in
 * pearl-sr does), and `manager/config_mgr.ts` is a shared file this module must
 * not edit, so `/id … buff …` reads the file itself, once, the same way
 * `ConfigManager.read()` would. See the final report for the one-line
 * integration change that would remove this shim.
 */
function buffInfoRows(): BuffInfoRow[] {
    if (buffInfoCache) return buffInfoCache;
    buffInfoCache = [];
    try {
        const file = path.join(resourcesDir(), 'BuffInfoConfig.json');
        const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (Array.isArray(json?.text_map_config)) buffInfoCache = json.text_map_config as BuffInfoRow[];
    } catch (err: any) {
        console.warn(`[command] could not read BuffInfoConfig.json: ${err?.message ?? err}`);
    }
    return buffInfoCache;
}

// ---- `/funmode` -------------------------------------------------------------

/**
 * `LineupManager.getFunModeAvatarID` input: the profile's roster with the
 * multipath ids resolved to the currently selected path, each path taken once
 * (the reference's `picked_mc` / `picked_m7th` flags).
 */
function funModeAvatarIds(session: NetSession): number[] {
    const ids: number[] = [];
    let pickedMc = false;
    let pickedM7th = false;

    for (const id of session.data.getDataJson().avatarIds()) {
        if (isTrailblazer(id)) {
            if (pickedMc) continue;
            pickedMc = true;
            ids.push(session.data.getIdMain());
            continue;
        }
        if (isMarch7th(id)) {
            if (pickedM7th) continue;
            pickedM7th = true;
            ids.push(session.data.getIdM7());
            continue;
        }
        ids.push(id);
    }
    return ids;
}

/** `std.math.maxInt(i32)` — the value `/funmode hp max` stores. */
const FUN_MODE_MAX_HP = 2147483647;
const FUN_MODE_HP_HINT = 'Remember to set it back to 0 to use actual HP value\n';

/** `value.zig::FunMode`. */
export function funModeCommand(session: NetSession, input: string): string | undefined {
    const tokens = tokenizeSpaces(input);
    const subCommand = tokens[0];
    if (subCommand === undefined) return 'Usage: /funmode <on|off|hp>\n';

    const state = commandState(session);

    if (subCommand === 'on') {
        state.funMode = true;
        state.funModeAvatarIds = funModeAvatarIds(session);
        return 'Fun mode ON\n';
    }

    if (subCommand === 'off') {
        state.funMode = false;
        return 'Fun mode OFF\n';
    }

    if (subCommand !== 'hp') return 'Unknown funmode subcommand\n';

    const value = tokens[1];
    if (value === undefined) return 'Usage: /funmode hp <max|number>\n';

    if (value === 'max') {
        state.funModeHp = FUN_MODE_MAX_HP;
        return new ReplyBuilder()
            .add('Set HP = MAX (2,147,483,647)\n')
            .add(FUN_MODE_HP_HINT)
            .text();
    }

    const parsed = parseI64(value);
    if (parsed === undefined) {
        // DEVIATION: the reference lets `parseInt`'s error escape the handler, so
        // the player gets no reply at all and the failure only shows up in the
        // server log. Answering with an error is strictly more useful and keeps
        // the rest of the command's grammar intact.
        return 'Error: Invalid HP value. Please provide a number.\n';
    }

    if (parsed < 0 || parsed > FUN_MODE_MAX_HP) {
        return 'Error: HP out of range (0 - 2147483647)\n';
    }

    state.funModeHp = parsed;
    return new ReplyBuilder().add(`Set HP = ${parsed}\n`).add(FUN_MODE_HP_HINT).text();
}
