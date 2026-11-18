/**
 * `/help` — port of pearl-sr `gameserver/src/commands/help.zig`.
 *
 * The reference answers with **eight separate** `RevcMsgScNotify` packets (one
 * per `commandhandler.sendMessage` call). The dispatcher contract in
 * `./index.ts` returns a single reply string that the chat handler sends as one
 * packet, so the lines are concatenated in the reference's order. Every line
 * already ends with '\n' — that newline is what keeps them on separate chat
 * lines inside the single message, and it is reproduced verbatim (including the
 * "chage" typo and the missing full stop on the last line).
 */
export const HELP_LINES: string[] = [
    '/tp to teleport, /sync to sync data from config\n',
    '/refill to refill technique point after battle\n',
    '/set to set gacha banner\n',
    '/node to chage node in PF, AS, MoC\n',
    '/id to turn ON custom mode for challenge mode. /id info to check current challenge id. /id off to turn OFF\n',
    '/funmode to Sillyism\n',
    'You can enter MoC, PF, AS via F4 menu\n',
    "(If your Castorice technique enabled, you must enter battle by using Castorice's technique)\n",
];

/** The concatenated help text, ready to be handed back as one chat reply. */
export function helpCommand(): string {
    return HELP_LINES.join('');
}
