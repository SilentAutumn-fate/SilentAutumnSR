import {
    MAX_PACKET_BODY,
    PACKET_HEAD_MAGIC,
    PACKET_HEADER_SIZE,
    PACKET_TAIL_MAGIC,
} from '../common/constants';

/**
 * HSR wire frame.
 *
 *   0                4        6        8                 12
 *   +----------------+--------+--------+-----------------+---------+----------------+
 *   |  HEAD_MAGIC    | cmdId  | headLen|    bodyLen      |  head   |     body       | TAIL_MAGIC |
 *   |  u32 big endian| u16 BE | u16 BE |    u32 BE       | headLen |    bodyLen     |   u32 BE   |
 *   +----------------+--------+--------+-----------------+---------+----------------+
 *
 * The official client always sends headLen == 0, and so do we; the field is kept
 * so that a proxied/other-version client still frames correctly.
 */
export class NetPacket {
    public static readonly HEAD_MAGIC = PACKET_HEAD_MAGIC;
    public static readonly TAIL_MAGIC = PACKET_TAIL_MAGIC;

    public readonly cmdId: number;
    public readonly head: Buffer;
    public readonly body: Buffer;

    constructor(cmdId: number, head: Buffer, body: Buffer) {
        this.cmdId = cmdId;
        this.head = head;
        this.body = body;
    }

    /** Serialise this packet to the wire format. */
    public encode(): Buffer {
        const headLen = this.head.length;
        const bodyLen = this.body.length;
        const out = Buffer.allocUnsafe(PACKET_HEADER_SIZE + headLen + bodyLen + 4);

        out.writeUInt32BE(NetPacket.HEAD_MAGIC, 0);
        out.writeUInt16BE(this.cmdId & 0xffff, 4);
        out.writeUInt16BE(headLen, 6);
        out.writeUInt32BE(bodyLen, 8);
        this.head.copy(out, PACKET_HEADER_SIZE);
        this.body.copy(out, PACKET_HEADER_SIZE + headLen);
        out.writeUInt32BE(NetPacket.TAIL_MAGIC, PACKET_HEADER_SIZE + headLen + bodyLen);

        return out;
    }

    /**
     * Try to decode one frame from the head of `buf`.
     *
     * Returns null when more bytes are required. Throws on a protocol violation
     * (bad magic / oversized body) so the caller can drop the connection instead
     * of silently spinning on garbage.
     */
    public static tryDecode(buf: Buffer): { packet: NetPacket; consumed: number } | null {
        if (buf.length < PACKET_HEADER_SIZE) return null;

        if (buf.readUInt32BE(0) !== NetPacket.HEAD_MAGIC) {
            throw new Error('NetPacket: head magic mismatch');
        }

        const cmdId = buf.readUInt16BE(4);
        const headLen = buf.readUInt16BE(6);
        const bodyLen = buf.readUInt32BE(8);

        if (bodyLen > MAX_PACKET_BODY) {
            throw new Error(`NetPacket: body too large (${bodyLen})`);
        }

        const total = PACKET_HEADER_SIZE + headLen + bodyLen + 4;
        if (buf.length < total) return null;

        const head = Buffer.from(buf.subarray(PACKET_HEADER_SIZE, PACKET_HEADER_SIZE + headLen));
        const bodyStart = PACKET_HEADER_SIZE + headLen;
        const body = Buffer.from(buf.subarray(bodyStart, bodyStart + bodyLen));

        const tailMagic = buf.readUInt32BE(bodyStart + bodyLen);
        if (tailMagic !== NetPacket.TAIL_MAGIC) {
            throw new Error('NetPacket: tail magic mismatch');
        }

        return { packet: new NetPacket(cmdId, head, body), consumed: total };
    }

    /** Convenience factory for an outbound packet with no head section. */
    public static build(cmdId: number, body: Uint8Array): NetPacket {
        return new NetPacket(cmdId, Buffer.alloc(0), Buffer.from(body));
    }
}

/**
 * Incremental frame reader. Feed it socket chunks; it yields whole packets and
 * keeps the remainder buffered, so a packet split across TCP segments (or
 * several packets coalesced into one chunk) is handled correctly.
 */
export class PacketStreamReader {
    private buffer: Buffer = Buffer.alloc(0);

    /** Append a chunk and return every complete packet it completed. */
    public push(chunk: Buffer): NetPacket[] {
        this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

        const packets: NetPacket[] = [];
        for (;;) {
            const decoded = NetPacket.tryDecode(this.buffer);
            if (!decoded) break;
            packets.push(decoded.packet);
            this.buffer = this.buffer.subarray(decoded.consumed);
        }
        return packets;
    }

    /** Bytes currently waiting for the rest of their frame. */
    public get pending(): number {
        return this.buffer.length;
    }
}
