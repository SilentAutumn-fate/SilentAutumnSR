import fs from 'fs';
import { onPlayerHeartBeatCsReq } from './misc';

it('ships the production chat fix with diagnostics disabled and refreshes its cache version on change', async () => {
    const previous = process.env.SASR_DIAG_ACTIVITY;
    process.env.SASR_DIAG_ACTIVITY = '0';
    let script = 'if _G.chat_fixed then return end';
    const read = jest.spyOn(fs, 'readFileSync').mockImplementation((file: any) => {
        if (String(file).endsWith('chat-entry.lua')) return script;
        throw Error('Unexpected diagnostic read');
    });
    const replies: any[] = [];
    const session: any = { state: {}, sendRsp: async (_: number, body: any) => replies.push(body) };
    try {
        await onPlayerHeartBeatCsReq({}, session);
        script += '\n-- updated chat fix';
        await onPlayerHeartBeatCsReq({}, session);
    } finally {
        read.mockRestore();
        if (previous === undefined) delete process.env.SASR_DIAG_ACTIVITY;
        else process.env.SASR_DIAG_ACTIVITY = previous;
    }
    expect(replies[0].downloadData.data.toString('utf8')).toContain('local function applyChatEntryFix()');
    expect(replies[0].downloadData.data.toString('utf8')).toContain('if _G.chat_fixed then return end');
    expect(replies[1].downloadData.version).not.toBe(replies[0].downloadData.version);
});

it('appends a diagnostic Lua file saved with a UTF-8 BOM', async () => {
    const originalFlag = process.env.SASR_DIAG_ACTIVITY;
    process.env.SASR_DIAG_ACTIVITY = '1';
    const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const read = jest.spyOn(fs, 'readFileSync').mockReturnValue('\uFEFF-- diagnostic script');
    const sendRsp = jest.fn();
    try {
        await onPlayerHeartBeatCsReq({}, { state: {}, sendRsp } as any);
    } finally {
        read.mockRestore();
        exists.mockRestore();
        if (originalFlag === undefined) delete process.env.SASR_DIAG_ACTIVITY;
        else process.env.SASR_DIAG_ACTIVITY = originalFlag;
    }
    const lua = sendRsp.mock.calls[0][1].downloadData.data.toString('utf8');
    expect(lua).toContain('-- diagnostic script');
    expect(lua).not.toContain('\uFEFF');
});
