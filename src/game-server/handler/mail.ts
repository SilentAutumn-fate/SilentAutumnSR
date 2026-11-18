import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { HandlerEntry } from './types';
import { SERVER_NAME } from '../../common/constants';

/**
 * Mail.
 *
 *   GetMailCsReq            (834) -> GetMailScRsp            (825)
 *   TakeMailAttachmentCsReq (858) -> TakeMailAttachmentScRsp (856)
 *
 * The reference server has no mailbox model: one hard-coded "Readme" mail is
 * returned on every request (always unread — `is_read` is never persisted, so
 * taking its attachment and re-requesting the list shows it unread again), and
 * taking attachments grants nothing. Text is reproduced byte-for-byte, including
 * the `sofware` typo and the trailing `:Đ`.
 */

/** MailType_Star — a "star" mail, i.e. one with an attachment that can be claimed. */
const MAIL_TYPE_STAR = 1;

/** Fixed mail time / expiry from the reference (seconds; expiry is > 2^32). */
const MAIL_TIME = 1723334400;
const MAIL_EXPIRE_TIME = 17186330890;

const MAIL_CONTENT =
    `${SERVER_NAME} is a free and open-source Star Rail server\n` +
    'Welcome, Trailblazer.\n' +
    'Use https://relic-builder.vercel.app to setup relic :Đ';

function readmeMail(): starrail.ClientMail {
    return {
        sender: 'March 7th',
        title: 'Readme',
        isRead: false,
        id: 1,
        content: MAIL_CONTENT,
        time: MAIL_TIME,
        expireTime: MAIL_EXPIRE_TIME,
        mailType: MAIL_TYPE_STAR,
        attachment: { itemList: [{ itemId: 1503, num: 1 }] },
    };
}

export async function onGetMailCsReq(_req: starrail.GetMailCsReq, session: NetSession): Promise<void> {
    await session.sendRsp(CmdID.CmdGetMailScRsp, {
        retcode: 0,
        totalNum: 1,
        isEnd: true,
        start: 0,
        mailList: [readmeMail()],
    });
}

/**
 * Attachment claim. The reference echoes every requested id back as "success"
 * without checking that it exists (or that it still has an attachment), and
 * grants no items — `attachment` and `failMailList` stay unset.
 */
export async function onTakeMailAttachmentCsReq(
    req: starrail.TakeMailAttachmentCsReq,
    session: NetSession,
): Promise<void> {
    await session.sendRsp(CmdID.CmdTakeMailAttachmentScRsp, {
        retcode: 0,
        succMailIdList: [...(req?.mailIdList ?? [])],
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdGetMailCsReq, action: onGetMailCsReq },
    { cmdId: CmdID.CmdTakeMailAttachmentCsReq, action: onTakeMailAttachmentCsReq },
];
