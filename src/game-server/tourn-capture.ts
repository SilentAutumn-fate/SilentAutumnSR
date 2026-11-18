import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { LOGS_DIR } from '../common/constants';
import { starrail } from '../proto/starrail';

/**
 * Divergent Universe evidence capture.
 *
 * The RogueTourn (Divergent Universe) message family exists in the protocol but
 * the server does not implement it yet, and the repository has no authoritative
 * source for the meaning of its fields: the client dump only carries config
 * types, and the public protocol dumps name the fields with obfuscated
 * identifiers. Before writing any gameplay state we therefore record what the
 * real client actually sends, so the implementation can be derived from evidence
 * instead of being invented.
 *
 * Only RogueTourn traffic is recorded, so this stays quiet for normal play.
 */
export function isTournMessage(name: string | undefined): name is string {
    return typeof name === 'string' && name.startsWith('RogueTourn');
}

/** Grid-fight traffic shares the capture format; see grid-fight-capture.jsonl. */
export function isGridFightMessage(name: string | undefined): name is string {
    return typeof name === 'string' && name.startsWith('GridFight');
}

/** Packet direction: client request or server response. */
export type CaptureDirection = 'C' | 'S';

export interface DecodedTournBody {
    /** Plain object with the decoded fields; `{}` when decoding failed. */
    fields: Record<string, unknown>;
    error?: string;
}

/**
 * Decode one request body with the generated message type of the same name.
 *
 * `defaults: false` keeps the record to fields the client actually sent: a
 * zero value that was never on the wire must not look like observed behaviour.
 */
export function decodeTournBody(name: string, body: Uint8Array): DecodedTournBody {
    const type = (starrail as Record<string, any>)[name];
    if (!type || typeof type.decode !== 'function') {
        return { fields: {}, error: 'unknown-message' };
    }
    try {
        const message = type.decode(body);
        const fields = type.toObject(message, {
            longs: String,
            enums: Number,
            bytes: String,
            defaults: false,
            arrays: true,
            objects: true,
        });
        return { fields };
    } catch (err: any) {
        return { fields: {}, error: err?.message ?? String(err) };
    }
}

export interface TournCaptureRecord {
    ts: string;
    /** `C` for a client request, `S` for a server response. */
    dir: CaptureDirection;
    cmdId: number;
    name: string;
    bytes: number;
    fields: Record<string, unknown>;
    error?: string;
    bodyHex?: string;
}

/** Default capture file: the configured logs directory (see settings.ts). */
export const DEFAULT_CAPTURE_FILE = join(LOGS_DIR, 'tourn-capture.jsonl');

/**
 * Append-only JSONL writer for Tourn requests.
 *
 * Writes are serialised through a promise chain and never reject: a capture
 * failure must not take a game session down.
 */
export class TournCapture {
    private chain: Promise<void> = Promise.resolve();
    private directoryReady = false;

    constructor(public readonly file: string = DEFAULT_CAPTURE_FILE) {}

    /**
     * Capture is on unless SASR_TOURN_CAPTURE=0; SASR_TOURN_CAPTURE_FILE
     * overrides the destination.
     */
    public static fromEnv(env: NodeJS.ProcessEnv = process.env): TournCapture | null {
        if (env.SASR_TOURN_CAPTURE === '0') return null;
        return new TournCapture(env.SASR_TOURN_CAPTURE_FILE || DEFAULT_CAPTURE_FILE);
    }

    public record(
        cmdId: number,
        name: string,
        body: Uint8Array,
        includeWire = false,
        dir: CaptureDirection = 'C',
    ): Promise<void> {
        const decoded = decodeTournBody(name, body);
        const record: TournCaptureRecord = {
            ts: new Date().toISOString(),
            dir,
            cmdId,
            name,
            bytes: body.length,
            fields: decoded.fields,
        };
        if (decoded.error) record.error = decoded.error;
        if (includeWire) record.bodyHex = Buffer.from(body).toString('hex');
        return this.append(record);
    }

    public append(record: TournCaptureRecord): Promise<void> {
        const line = JSON.stringify(record) + '\n';
        this.chain = this.chain.then(async () => {
            try {
                if (!this.directoryReady) {
                    await fs.mkdir(dirname(this.file), { recursive: true });
                    this.directoryReady = true;
                }
                await fs.appendFile(this.file, line, 'utf8');
            } catch (err: any) {
                console.warn(`[tourn-capture] write failed: ${err?.message ?? err}`);
            }
        });
        return this.chain;
    }
}
