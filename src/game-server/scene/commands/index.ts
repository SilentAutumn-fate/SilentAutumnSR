import type { NetSession } from '../../NetSession';
import { helpCommand } from './help';
import { refillCommand } from './refill';
import { syncCommand } from './sync';
import { tpCommand } from './tp';
import { unstuckCommand } from './unstuck';
import {
    buffIdCommand,
    challengeNodeCommand,
    funModeCommand,
    setGachaCommand,
    testCommand,
} from './value';

/**
 * Chat-command dispatcher — port of pearl-sr `gameserver/src/command.zig`.
 *
 * The chat handler (`handler/chat.ts`, `CmdSendMsgCsReq`) calls
 * `handleCommand(session, text)` and is responsible for sending `outcome.reply`
 * as its own chat message (`RevcMsgScNotify`), because the exact message shape
 * belongs to the chat module. Everything a command pushes on its own initiative
 * — `SyncLineupNotify`, `PlayerSyncScNotify`, `EnterSceneByServerScNotify` — is
 * sent from the command modules, exactly as the reference does.
 *
 * Command table (peer-sr `command.zig::commandList`, same order, same words):
 *
 *   help                    `./help.ts`      — the command list
 *   test                    `./value.ts`     — "Test Command for Chat"
 *   node                    `./value.ts`     — toggle the challenge node (PF/AS/MoC)
 *   set standard|rateup     `./value.ts`     — rewrite the gacha banner pools
 *   tp                      `./tp.ts`        — teleport to an entry id
 *   unstuck                 `./unstuck.ts`   — teleport to the fixed safe spot
 *   sync                    `./sync.ts`      — re-read freesr-data.json and push items
 *   refill                  `./refill.ts`    — refill skill points + push the lineup
 *   id                      `./value.ts`     — custom challenge/buff selection
 *   funmode                 `./value.ts`     — fun-mode switches
 */

export interface CommandOutcome {
    /** true when the text was a recognised command and was executed. */
    handled: boolean;
    /** Text to send back to the player as a chat reply, if any. */
    reply?: string;
}

/** `command.zig`: the answer to a message that does not start with '/'. */
export const MISSING_PREFIX_REPLY = "Commands must start with a '/'";
/** `command.zig`: the answer to an unknown or empty command word. */
export const INVALID_COMMAND_REPLY = 'Invalid command';

type CommandRun = (
    session: NetSession,
    args: string,
) => Promise<string | undefined> | string | undefined;

interface CommandDefinition {
    name: string;
    run: CommandRun;
}

/** pearl-sr's `commandList`, in the reference's order (a linear scan there). */
const commandList: CommandDefinition[] = [
    { name: 'help', run: () => helpCommand() },
    { name: 'test', run: () => testCommand() },
    { name: 'node', run: (session) => challengeNodeCommand(session) },
    { name: 'set', run: (_session, args) => setGachaCommand(args) },
    { name: 'tp', run: (session, args) => tpCommand(session, args) },
    { name: 'unstuck', run: (session) => unstuckCommand(session) },
    { name: 'sync', run: (session) => syncCommand(session) },
    { name: 'refill', run: (session) => refillCommand(session) },
    { name: 'id', run: (session, args) => buffIdCommand(session, args) },
    { name: 'funmode', run: (session, args) => funModeCommand(session, args) },
];

const commands = new Map<string, CommandDefinition>(
    commandList.map((command): [string, CommandDefinition] => [command.name, command]),
);

/** The registered command words, in registry order. */
export const COMMAND_NAMES: string[] = commandList.map((command) => command.name);

/**
 * Does this text start a command?
 *
 * pearl-sr requires '/'. DEVIATION: a leading '!' is accepted as well (the
 * dispatcher contract asks for both), but only when a letter follows it — so
 * "!!!" stays ordinary chat and is still echoed by the caller instead of being
 * swallowed as an unknown command.
 */
function startsCommand(text: string): boolean {
    if (text[0] === '/') return true;
    return text[0] === '!' && /^[A-Za-z]$/.test(text[1] ?? '');
}

/**
 * `command.zig`: `msg[1..]`, then `tokenizeAny(...).next()` for the command word
 * and `tokenizer.rest()` for the arguments.
 *
 * Zig's `TokenIterator.rest()` advances past the delimiters that follow the
 * token, so `args` never carries a leading space — `/tp  123` and `/tp 123` both
 * hand `123` to `tp.zig`. Interior spacing is preserved, which is what `/set`,
 * `/id` and `/funmode` rely on.
 */
function splitCommandInput(input: string): { command: string | null; args: string } {
    let index = 0;
    while (index < input.length && input[index] === ' ') index++;
    if (index >= input.length) return { command: null, args: '' };

    const start = index;
    while (index < input.length && input[index] !== ' ') index++;
    const command = input.slice(start, index);

    while (index < input.length && input[index] === ' ') index++;
    return { command, args: input.slice(index) };
}

/** `command.zig::sendMessage` logs every reply it sends (`std.log.debug`). */
function logReply(text: string): string {
    console.log(`[command] ${text}`);
    return text;
}

/**
 * Run one chat message as a command.
 *
 * Returns `{ handled: false }` for ordinary chat text — the caller keeps
 * ownership of that message (the reference echoes it back as a private-chat
 * reply). A message that does not start with a command prefix but *contains* a
 * slash is still treated as a command attempt, because that is exactly the
 * reference's dispatch rule in `onSendMsg` (`indexOf("/") != null`) and it
 * answers those with "Commands must start with a '/'".
 */
export async function handleCommand(session: NetSession, text: string): Promise<CommandOutcome> {
    const message = typeof text === 'string' ? text : '';

    if (!startsCommand(message)) {
        // zig: std.debug.print("Message Text 2: {any}\n", .{msg}) for every
        // message that is not a command.
        console.log(`Message Text 2: ${message}`);
        if (message.includes('/')) {
            return { handled: true, reply: logReply(MISSING_PREFIX_REPLY) };
        }
        return { handled: false };
    }

    const { command, args } = splitCommandInput(message.slice(1));
    if (command === null) return { handled: true, reply: logReply(INVALID_COMMAND_REPLY) };

    const definition = commands.get(command);
    if (!definition) return { handled: true, reply: logReply(INVALID_COMMAND_REPLY) };

    let reply: string | undefined;
    try {
        reply = await definition.run(session, args);
    } catch (err: any) {
        // zig `try cmd.func(...)`: the error escapes the command and the player
        // gets no reply; its caller logs it. Do the same, but with a stack.
        console.error(`[command] /${command} failed: ${err?.stack ?? err}`);
        return { handled: true };
    }

    if (reply === undefined) return { handled: true };
    return { handled: true, reply: logReply(reply) };
}
