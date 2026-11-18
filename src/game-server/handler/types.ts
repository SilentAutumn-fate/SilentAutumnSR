import type { NetSession } from '../NetSession';

/**
 * A protocol handler.
 *
 * `req` is the decoded request message (or `{}` when the request type is not
 * known to us). Handlers reply through `session` and may push additional
 * unsolicited *Notify messages.
 */
export type HandlerAction<TReq = any> = (
    req: TReq,
    session: NetSession,
) => Promise<void> | void;

export interface HandlerEntry {
    /** Request command id, e.g. CmdID.CmdPlayerLoginCsReq. */
    cmdId: number;
    /** protobufjs message type used to decode the request body (optional). */
    reqType?: any;
    action: HandlerAction;
}

/** Request/response command id pair used by the dummy (empty reply) table. */
export interface DummyEntry {
    req: number;
    rsp: number;
}
