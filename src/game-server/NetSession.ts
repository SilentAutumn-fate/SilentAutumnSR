import { Socket } from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { NetPacket, PacketStreamReader } from './NetPacket';
import { CmdID } from '../proto/cmdId';
import { starrail } from '../proto/starrail';
import { assertFields } from '../proto/validate';
import type { HandlerEntry } from './handler/types';
import { handlerList, dummyList } from './handler/registry';
import { DataService } from '../data/data.service';
import { ConfigManager } from './manager/config_mgr';
import { LOGS_DIR } from '../common/constants';
import { PlayerState } from './PlayerState';
import { TournCapture, isGridFightMessage, isTournMessage } from './tourn-capture';
import { loadRun, removeRun, saveRun } from './manager/grid-fight-store';
import type { TournRun } from './handler/rogue-tourn-run';

/**
 * Command id -> message name.
 *
 * The generated protobuf classes are named without the protocol's `Cmd` prefix
 * (`PlayerLoginCsReq`), while CmdID keys carry it (`CmdPlayerLoginCsReq`), so
 * request/response types can be derived from the command id alone. This is what
 * lets a handler be declared as `{ cmdId, action }` with no type table to keep
 * in sync.
 */
const nameByCmdId = new Map<number, string>();
const cmdIdByName = new Map<string, number>();

/**
 * Every GridFight command in the 4.7-derived table sits inside this window
 * (`CmdGridFightBackToPrepareReq` 8429 .. `CmdGridFightUpdatePosCsReq` 8795, 81
 * commands). The 4.6.54 client also sends season-two selection requests that the
 * table cannot name at all; they still land inside the same window, so the
 * dispatcher treats unnamed ids in it as GridFight captures instead of noise.
 */
const GRID_FIGHT_CMD_MIN = 8400;
const GRID_FIGHT_CMD_MAX = 8999;

/**
 * Best-effort protobuf field scan for bodies the server has no schema for.
 *
 * The 4.6.54 client sends season-two selection requests whose message types do
 * not exist in the 4.7-derived table, so `decode()` can only return `{}`. The
 * raw field list still identifies the chosen id or option, which is what the
 * handler has to be built from later. The scanner never throws: malformed input
 * simply ends the scan.
 */
function scanWire(body: Uint8Array): string {
    const fields: string[] = [];
    let offset = 0;
    const varint = (): number | undefined => {
        let value = 0;
        let shift = 0;
        while (offset < body.length && shift < 64) {
            const byte = body[offset++];
            value += (byte & 0x7f) * 2 ** shift;
            if ((byte & 0x80) === 0) return value;
            shift += 7;
        }
        return undefined;
    };
    while (offset < body.length && fields.length < 16) {
        const tag = varint();
        if (tag === undefined) break;
        const field = Math.floor(tag / 8);
        const wire = tag % 8;
        if (field <= 0) break;
        if (wire === 0) {
            const value = varint();
            if (value === undefined) break;
            fields.push(`${field}=${value}`);
        } else if (wire === 2) {
            const length = varint();
            if (length === undefined || offset + length > body.length) break;
            const slice = body.subarray(offset, offset + length);
            offset += length;
            fields.push(`${field}=[${length}]${Buffer.from(slice).toString('hex').slice(0, 32)}`);
        } else if (wire === 1 || wire === 5) {
            const width = wire === 1 ? 8 : 4;
            if (offset + width > body.length) break;
            offset += width;
            fields.push(`${field}=fixed${width}`);
        } else {
            fields.push(`${field}=wire${wire}`);
            break;
        }
    }
    return fields.join(' ');
}

/**
 * Several command ids carry more than one name: hsr-proto leaves some names
 * obfuscated (`CmdAAKFAEEILGA`) and dev/tools/reconcile-cmdid.js adds the real one
 * for the same id. Whichever name we keep must be the one that actually exists
 * as a protobuf message, otherwise replies for that command would be sent empty.
 *
 * Score: a name with a resolvable message type beats one without, and a
 * human-readable name (`CmdPlayerLoginScRsp`) beats an all-caps blob.
 */
function nameScore(name: string): number {
    let score = 0;
    if (starrail[name]) score += 2;
    if (!/^[A-Z0-9]{8,}$/.test(name)) score += 1;
    return score;
}

for (const [key, value] of Object.entries(CmdID)) {
    if (!key.startsWith('Cmd')) continue;
    cmdIdByName.set(key, value);

    const candidate = key.slice(3);
    const current = nameByCmdId.get(value);
    if (current === undefined || nameScore(candidate) > nameScore(current)) {
        nameByCmdId.set(value, candidate);
    }
}

const typeCache = new Map<string, any>();

function messageType(name: string): any {
    if (typeCache.has(name)) return typeCache.get(name);
    const type = starrail[name];
    typeCache.set(name, type);
    return type;
}

/** Scene/battle context for the current connection. */
export interface SceneContext {
    planeId: number;
    floorId: number;
    entryId: number;
    leaderEntityId: number;
    gameModeType: number;
    /** Entity ids the client currently knows about. */
    entityIds: number[];
    monsterEvents?: Map<number, number>;
}

export interface BattleContext {
    battleId: number;
    stageId: number;
    /** Avatar ids participating, in slot order. */
    avatarIds: number[];
}

export class NetSession {
    public readonly state = new PlayerState();

    /** Current scene bookkeeping (mirrors what was last sent to the client). */
    public scene: SceneContext | null = null;
    /** Divergent Universe run bookkeeping (layers/rooms are simulated as a state machine). */
    public tournRun: { run: TournRun; roomId: number; entryId: number; scene: any } | null = null;
    public gridFightRun: starrail.MPIMAEMCEFH | null = null;
    public nextGridFightRunId = 1;
    public nextGridFightRoleId = 4;
    public gridFightBattleId: number | null = null;
    public nextGridFightBattleId = 10000;
    public gridFightAwaitingPrepare = false;
    public gridFightBonfireHealed = false;
    /** 局内羁绊效果选择（traitId → effectId），随本局存在，不落存档。 */
    public gridFightTraitEffects = new Map<number, number>();
    /** Divergent Universe selection echoed back by GetCurRogueCocoonInfo. */
    public tournCocoon: { areaId: number; groupId: number; roomId: number; difficultyLevel: number } | null = null;
    /** Active battle, if any. */
    public battle: BattleContext | null = null;
    /** Active challenge id (0 = none). */
    public challengeId = 0;
    /** Challenge Peak / Tierce selection state. */
    public challengePeakId = 0;
    public challengeTierceId = 0;
    /** Lineups the client has been told about, keyed by lineup index. */
    public lineups: { [index: number]: number[] } = {};

    private readonly socket: Socket;
    private readonly reader = new PacketStreamReader();
    private readonly handlers = new Map<number, HandlerEntry>();
    private readonly dummies = new Map<number, number>();
    private closed = false;
    /** Serialises writes so interleaved handlers cannot reorder packets. */
    private writeChain: Promise<void> = Promise.resolve();

    /**
     * Log every protocol packet in both directions when SASR_PACKET_LOG=1.
     *
     * Off by default because a normal client sends thousands of movement packets,
     * but it is the only way to see where a handshake stops: "the game says
     * network timeout" becomes "the client sent X and never sent Y".
     */
    private readonly packetLog = process.env.SASR_PACKET_LOG === '1';

    /** Requests whose raw body is printed: `SASR_PKT_HEX=<id,id>` or `all`. */
    private readonly packetHexAll = process.env.SASR_PKT_HEX === 'all';
    private readonly packetHexIds = new Set(
        (process.env.SASR_PKT_HEX ?? '')
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value) && value > 0),
    );

    /**
     * Optional file sink for the same hex trace. The console trace is useless on
     * a background server whose stdout nobody reads; `SASR_PKT_HEX_FILE` writes
     * `<ts> <name> (<cmd>) <hex>` lines to a file that can be grepped later.
     */
    private readonly packetHexFile = process.env.SASR_PKT_HEX_FILE || '';

    /** Append-only trace of every CsReq name the client sends (see dispatch). */
    private readonly requestLogPath = path.join(LOGS_DIR, 'requests.jsonl');

    /**
     * Records decoded Divergent Universe requests to <logs>/tourn-capture.jsonl.
     * On by default because the family is unimplemented and the only way to
     * learn its field semantics is to watch a real client. See tourn-capture.ts.
     */
    private readonly tournCapture = TournCapture.fromEnv();
    private readonly gridFightCapture = process.env.SASR_GRID_FIGHT_CAPTURE === '1'
        ? new TournCapture(path.join(LOGS_DIR, 'grid-fight-capture.jsonl'))
        : null;

    constructor(
        socket: Socket,
        public readonly data: DataService,
        public readonly config: ConfigManager,
    ) {
        this.socket = socket;
        for (const entry of handlerList) this.handlers.set(entry.cmdId, entry);
        for (const entry of dummyList) this.dummies.set(entry.req, entry.rsp);

        // Restore the account block written by the previous connection and let
        // DataService harvest this session's state on every save.
        this.state.applySave(data.getDataInGame().player);
        data.registerPlayerSaveProvider(() => this.state.toSave());
    }

    // ---- lifecycle ---------------------------------------------------------

    public async run(): Promise<void> {
        const remote = `${this.socket.remoteAddress}:${this.socket.remotePort}`;
        console.log(`[session] connected ${remote}`);

        this.socket.on('error', (err) => {
            console.warn(`[session] socket error (${remote}): ${err.message}`);
        });

        try {
            for await (const chunk of this.socket) {
                let packets: NetPacket[];
                try {
                    packets = this.reader.push(chunk as Buffer);
                } catch (err: any) {
                    console.warn(`[session] framing error (${remote}): ${err?.message ?? err}`);
                    break;
                }
                for (const packet of packets) {
                    await this.dispatch(packet);
                }
            }
        } catch (err: any) {
            if (!this.closed) {
                console.warn(`[session] read loop ended (${remote}): ${err?.message ?? err}`);
            }
        } finally {
            this.closed = true;
            console.log(`[session] disconnected ${remote}`);
        }
    }

    public close(): void {
        this.closed = true;
        this.socket.destroy();
    }

    // ---- currency war persistence -----------------------------------------

    /**
     * Everything a restored run needs that is not part of the wire message.
     * Used both to save and to skip writes when nothing changed.
     */
    private gridFightSignature(): string {
        if (!this.gridFightRun) return '';
        return JSON.stringify([
            this.gridFightRun,
            this.nextGridFightRunId,
            this.nextGridFightRoleId,
            this.nextGridFightBattleId,
            this.gridFightBonfireHealed,
            this.gridFightAwaitingPrepare,
        ]);
    }

    /** Write the live run (or clear the save) once a command changed it. */
    private storeGridFightRun(): void {
        try {
            if (!this.gridFightRun) {
                removeRun(this.state.uid);
                if (process.env.SASR_GF_TRACE !== '0') {
                    console.log(`[gridfight] persist: cleared save for uid ${this.state.uid}`);
                }
                return;
            }
            saveRun(this.state.uid, {
                run: this.gridFightRun,
                nextRunId: this.nextGridFightRunId,
                nextRoleId: this.nextGridFightRoleId,
                nextBattleId: this.nextGridFightBattleId,
                bonfireHealed: this.gridFightBonfireHealed,
                awaitingPrepare: this.gridFightAwaitingPrepare,
                savedAt: 0,
            });
            if (process.env.SASR_GF_TRACE !== '0') {
                console.log(`[gridfight] persist: run ${this.gridFightRun.uniqueId} for uid ${this.state.uid}`);
            }
        } catch (err: any) {
            console.error(`[gridfight] failed to persist run: ${err?.message ?? err}`);
        }
    }

    /**
     * Reload the persisted run for this uid after a reconnect or a restart.
     *
     * A live battle is deliberately *not* restored: the battle context belongs
     * to the connection that opened it, so the client is taken back to the
     * preparation phase of the same node instead of a battle it can no longer
     * receive results for.
     */
    public restoreGridFightRun(): boolean {
        if (this.gridFightRun) return true;
        try {
            const saved = loadRun(this.state.uid);
            if (!saved) return false;
            this.gridFightRun = saved.run;
            // A restart resets the in-memory counters, so derive them past
            // whatever the save already used; otherwise the next run reuses an
            // id, and a stale record under the same uid collides with it.
            this.nextGridFightRunId = Math.max(saved.nextRunId ?? 1, (saved.run.uniqueId ?? 0) + 1);
            this.nextGridFightRoleId = saved.nextRoleId ?? 4;
            this.nextGridFightBattleId = saved.nextBattleId ?? 10000;
            this.gridFightBonfireHealed = saved.bonfireHealed === true;
            // The prepare lock only makes sense while the *same* connection is
            // showing the post-battle screen. After a reconnect the player is
            // back on the node itself, so the node has to be playable again;
            // otherwise every `EnterBattleStage` would be answered 6933.
            this.gridFightAwaitingPrepare = false;
            console.log(`[gridfight] restored run ${saved.run.uniqueId} for uid ${this.state.uid} `
                + `(chapter=${saved.run.NAGDJGMMCBE?.find?.((entry) => entry.KLCPAAHDPJF)?.KLCPAAHDPJF?.DCAHJELNJNP ?? '?'})`);
            return true;
        } catch (err: any) {
            console.error(`[gridfight] failed to restore run: ${err?.message ?? err}`);
            return false;
        }
    }

    // ---- dispatch ----------------------------------------------------------

    private async dispatch(packet: NetPacket): Promise<void> {
        const name = nameByCmdId.get(packet.cmdId);
        if (this.packetLog) {
            console.log(
                `[pkt] <- ${this.cmdName(packet.cmdId)} (${packet.cmdId}, ${packet.body.length}B)`,
            );
        }
        // Payload hex for commands whose wire shape still needs evidence, e.g.
        // the tutorial guide ids the client unlocks on each UI page. Set
        // `SASR_PKT_HEX=1631,1659` (comma separated cmd ids, or `all`) to get
        // them next to the name trace above.
        if (this.packetHexIds.has(packet.cmdId) || this.packetHexAll) {
            const hexLine = `[pkt] hex ${this.cmdName(packet.cmdId)} (${packet.cmdId}) `
                + packet.body.toString('hex');
            console.log(hexLine);
            if (this.packetHexFile) {
                void fs.promises
                    .appendFile(this.packetHexFile, `${new Date().toISOString()} ${hexLine.slice(11)}\n`)
                    .catch(() => undefined);
            }
        }
        // Always-on request trace: the UI debug loop ("I clicked the unlock
        // button and nothing happened") needs the exact request the client
        // fired, and the server console is not always visible on the host.
        if (name && name.endsWith('CsReq')) {
            void fs.promises
                .appendFile(
                    this.requestLogPath,
                    `${new Date().toISOString()} ${name} (${packet.cmdId}, ${packet.body.length}B)\n`,
                )
                .catch(() => undefined);
        }

        // Divergent Universe requests are logged with their decoded fields even
        // though no handler answers them yet: the record is the evidence the
        // implementation has to be built from.
        if (this.tournCapture && isTournMessage(name)) {
            void this.tournCapture.record(packet.cmdId, name, packet.body, false, 'C');
        }
        if (this.gridFightCapture && isGridFightMessage(name)) {
            void this.gridFightCapture.record(packet.cmdId, name, packet.body, true, 'C');
        }

        const handler = this.handlers.get(packet.cmdId);
        if (handler) {
            const req = this.decode(packet.cmdId, packet.body);
            const before = this.gridFightSignature();
            try {
                await handler.action(req, this);
            } catch (err: any) {
                console.error(
                    `[session] handler ${this.cmdName(packet.cmdId)} failed: ${err?.stack ?? err}`,
                );
            }
            // Persist only real transitions: read-only commands (GetData,
            // GetArchive) resize nothing and must not rewrite the save file.
            if (this.gridFightSignature() !== before) this.storeGridFightRun();
            return;
        }

        // Unknown-but-known-to-exist request: reply with an empty response so
        // the client does not stall waiting on a dialog it will never get.
        const dummy = this.dummies.get(packet.cmdId);
        if (dummy !== undefined) {
            // A GridFight request answered with an empty body is almost always a
            // selection dialog the server cannot drive yet; keep the evidence.
            if (packet.cmdId >= GRID_FIGHT_CMD_MIN && packet.cmdId <= GRID_FIGHT_CMD_MAX) {
                console.warn(
                    `[gridfight] empty reply for ${this.cmdName(packet.cmdId)} `
                    + `(${packet.cmdId}, ${packet.body.length}B) ${packet.body.toString('hex').slice(0, 120)}`,
                );
                if (this.gridFightCapture) {
                    void this.gridFightCapture.record(packet.cmdId, name ?? '', packet.body, true, 'C');
                }
            }
            await this.sendEmpty(dummy);
            return;
        }

        if (name && name.endsWith('CsReq')) {
            const rspName = name.slice(0, -'CsReq'.length) + 'ScRsp';
            const rspCmdId = cmdIdByName.get('Cmd' + rspName);
            if (rspCmdId !== undefined) {
                await this.sendEmpty(rspCmdId);
                return;
            }
        }

        // Any command inside the GridFight id window that the 4.7-derived table
        // cannot name is a 4.6.54-only message (the season-two selection flows).
        // It has to be captured verbatim, otherwise the handler cannot be built.
        if (packet.cmdId >= GRID_FIGHT_CMD_MIN && packet.cmdId <= GRID_FIGHT_CMD_MAX) {
            console.warn(
                `[gridfight] unknown command (${packet.cmdId}, ${packet.body.length}B) `
                + `fields=[${scanWire(packet.body)}] hex=${packet.body.toString('hex').slice(0, 160)}`,
            );
            if (this.gridFightCapture) {
                void this.gridFightCapture.record(packet.cmdId, `Unknown_${packet.cmdId}`, packet.body, true, 'C');
            }
            // Every season-two selection request is answered with the same
            // generic pending-action reply, which is the only GridFight response
            // handler the 4.6.54 client registers. Acknowledging keeps the
            // dialog closable; the server still has to act on the payload.
            if (process.env.SASR_GRID_FIGHT_ACK_UNKNOWN !== '0') {
                await this.sendRsp(CmdID.CmdGridFightHandlePendingActionScRsp, { retcode: 0 });
            }
            return;
        }

        console.debug(`[session] unhandled packet ${packet.cmdId} (${name ?? 'unknown'})`);
    }

    private cmdName(cmdId: number): string {
        return nameByCmdId.get(cmdId) ?? String(cmdId);
    }

    /** Decode a request body; returns {} when the type is unknown to us. */
    public decode<T = any>(cmdId: number, body: Uint8Array): T {
        const name = nameByCmdId.get(cmdId);
        if (!name) return {} as T;
        const type = messageType(name);
        if (!type || typeof type.decode !== 'function') return {} as T;
        try {
            return type.decode(body) as T;
        } catch (err: any) {
            console.warn(`[session] failed to decode ${name}: ${err?.message ?? err}`);
            return {} as T;
        }
    }

    // ---- sending -----------------------------------------------------------

    /** Send a pre-encoded body. */
    public send(cmdId: number, body: Uint8Array): Promise<void> {
        // Capture responses too: a request/response pair is the unit the client
        // parses, and a field the server emits wrongly shows up as a silent
        // no-op on the client. Recording only requests hides that half.
        if (this.gridFightCapture) {
            const name = nameByCmdId.get(cmdId);
            if (isGridFightMessage(name)) {
                void this.gridFightCapture.record(cmdId, name, body, true, 'S');
            }
        }
        const frame = NetPacket.build(cmdId, body).encode();
        return this.write(frame);
    }

    public sendEmpty(cmdId: number): Promise<void> {
        if (cmdId < 0) return Promise.resolve();
        return this.send(cmdId, new Uint8Array(0));
    }

    /**
     * Encode `fields` as the response message whose name is derived from
     * `cmdId` (CmdPlayerLoginScRsp -> PlayerLoginScRsp) and send it.
     */
    public sendRsp(cmdId: number, fields: Record<string, any> = {}): Promise<void> {
        return this.sendMessage(cmdId, fields);
    }

    /**
     * Encode `fields` using the message type derived from `cmdId` and send it.
     * Also used for unsolicited *Notify messages.
     */
    public sendMessage(cmdId: number, fields: Record<string, any> = {}): Promise<void> {
        if (cmdId < 0) return Promise.resolve();
        const name = nameByCmdId.get(cmdId);
        const type = name ? messageType(name) : undefined;
        if (!type) {
            console.warn(`[session] no protobuf type for cmdId ${cmdId}; sending empty`);
            return this.sendEmpty(cmdId);
        }
        let body: Uint8Array;
        try {
            assertFields(name, type, fields);
            const msg = typeof type.fromObject === 'function' ? type.fromObject(fields) : fields;
            body = type.encode(msg).finish();
        } catch (err: any) {
            console.error(
                `[session] encode ${name} failed: ${err?.message ?? err}\n` +
                    `          fields: ${JSON.stringify(fields)?.slice(0, 500)}`,
            );
            return Promise.resolve();
        }
        return this.send(cmdId, body);
    }

    private write(frame: Buffer): Promise<void> {
        if (this.closed || this.socket.destroyed) return Promise.resolve();
        if (this.packetLog) {
            // The frame is header(12) + head + body + tail(4); the command id sits
            // at offset 4, so the name is recoverable without re-parsing.
            const cmdId = frame.readUInt16BE(4);
            console.log(`[pkt] -> ${this.cmdName(cmdId)} (${cmdId}, ${frame.length}B)`);
        }
        this.writeChain = this.writeChain.then(
            () =>
                new Promise<void>((resolve) => {
                    this.socket.write(frame, () => resolve());
                }),
        );
        return this.writeChain;
    }

    // ---- convenience -------------------------------------------------------

    public get cmdId(): typeof CmdID {
        return CmdID;
    }

    /** Session-level nickname used by lineup/chat data. */
    public get nickname(): string {
        return this.state.nickname;
    }
}
