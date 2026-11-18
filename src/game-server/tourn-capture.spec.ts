import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { starrail } from '../proto/starrail';
import {
    DEFAULT_CAPTURE_FILE,
    TournCapture,
    decodeTournBody,
    isGridFightMessage,
    isTournMessage,
} from './tourn-capture';

describe('isTournMessage', () => {
    it('accepts every RogueTourn request and response name', () => {
        expect(isTournMessage('RogueTournQueryCsReq')).toBe(true);
        expect(isTournMessage('RogueTournEnterScRsp')).toBe(true);
        expect(isTournMessage('RogueTournBattleFailSettleInfoScNotify')).toBe(true);
    });

    it('rejects other families and missing names', () => {
        expect(isTournMessage('PlayerLoginCsReq')).toBe(false);
        expect(isTournMessage('RogueCommonDialogueInfo')).toBe(false);
        expect(isTournMessage(undefined)).toBe(false);
        expect(isTournMessage('')).toBe(false);
    });
});

describe('isGridFightMessage', () => {
    it('accepts grid-fight requests and responses only', () => {
        expect(isGridFightMessage('GridFightGetDataCsReq')).toBe(true);
        expect(isGridFightMessage('GridFightEnterBattleStageScRsp')).toBe(true);
        expect(isGridFightMessage('RogueTournQueryCsReq')).toBe(false);
        expect(isGridFightMessage(undefined)).toBe(false);
    });
});

describe('decodeTournBody', () => {
    it('reports unknown-message instead of throwing', () => {
        const decoded = decodeTournBody('RogueTournNoSuchThingCsReq', new Uint8Array(0));
        expect(decoded.fields).toEqual({});
        expect(decoded.error).toBe('unknown-message');
    });

    it('round-trips a real RogueTourn message', () => {
        // RogueTournRenameArchiveCsReq is the one Tourn request with a plain
        // string field, so it proves the decoder reaches protobufjs at all.
        const type = (starrail as Record<string, any>).RogueTournRenameArchiveCsReq;
        if (!type) return; // older protocol revisions may omit it
        const body = type.encode(type.fromObject({ name: 'capture-probe' })).finish();
        const decoded = decodeTournBody('RogueTournRenameArchiveCsReq', body);
        expect(decoded.error).toBeUndefined();
        expect(decoded.fields).toEqual({ name: 'capture-probe' });
    });

    it('reports a decode error for a truncated body', () => {
        const decoded = decodeTournBody('RogueTournRenameArchiveCsReq', Uint8Array.from([0x0a]));
        expect(decoded.error).toBeTruthy();
    });
});

describe('TournCapture', () => {
    let directory: string;

    beforeEach(async () => {
        directory = await fs.mkdtemp(join(tmpdir(), 'sasr-tourn-'));
    });

    afterEach(async () => {
        await fs.rm(directory, { recursive: true, force: true });
    });

    it('appends one JSON line per request and keeps the observed fields', async () => {
        const file = join(directory, 'nested', 'tourn.jsonl');
        const capture = new TournCapture(file);
        await capture.record(6034, 'RogueTournQueryCsReq', new Uint8Array(0));
        await capture.record(6099, 'RogueTournEnterScRsp', new Uint8Array(0));

        const lines = (await fs.readFile(file, 'utf8')).trim().split('\n');
        expect(lines).toHaveLength(2);
        const first = JSON.parse(lines[0]);
        expect(first.cmdId).toBe(6034);
        expect(first.name).toBe('RogueTournQueryCsReq');
        expect(first.bytes).toBe(0);
        expect(first.fields).toEqual({});
        expect(typeof first.ts).toBe('string');
        expect(Number.isNaN(Date.parse(first.ts))).toBe(false);
    });

    it('survives an unwritable destination', async () => {
        const capture = new TournCapture(join(directory, 'gone', 'tourn.jsonl'));
        await fs.writeFile(join(directory, 'gone'), 'not a directory', 'utf8');
        await expect(capture.record(6034, 'RogueTournQueryCsReq', new Uint8Array(0))).resolves.toBeUndefined();
    });

    it('preserves unknown wire fields when raw capture is requested', async () => {
        const file = join(directory, 'grid-fight.jsonl');
        const capture = new TournCapture(file);
        // 4.7.51 division_id=5; field 999 is deliberately unknown.
        await capture.record(8579, 'GridFightStartGamePlayCsReq', Uint8Array.from([0x28, 0x02, 0xb8, 0x3e, 0x01]), true);
        const record = JSON.parse(await fs.readFile(file, 'utf8'));
        expect(record.fields).toEqual({ divisionId: 2 });
        expect(record.bodyHex).toBe('2802b83e01');
    });

    it('records the direction so requests and responses pair up', async () => {
        const file = join(directory, 'grid-fight.jsonl');
        const capture = new TournCapture(file);
        await capture.record(8541, 'GridFightGetDataCsReq', new Uint8Array(0), false, 'C');
        const type = (starrail as Record<string, any>).GridFightGetDataScRsp;
        const body = type.encode(type.fromObject({ retcode: 0 })).finish() as Uint8Array;
        await capture.record(8542, 'GridFightGetDataScRsp', body, true, 'S');

        const records = (await fs.readFile(file, 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
        expect(records.map((record) => record.dir)).toEqual(['C', 'S']);
        expect(records[0].fields).toEqual({});
        expect(records[1].fields.retcode).toBe(0);
        expect(records[1].name).toBe('GridFightGetDataScRsp');
    });

    it('defaults on, honours SASR_TOURN_CAPTURE=0 and the file override', () => {
        expect(TournCapture.fromEnv({})?.file).toBe(DEFAULT_CAPTURE_FILE);
        expect(TournCapture.fromEnv({ SASR_TOURN_CAPTURE: '0' })).toBeNull();
        expect(TournCapture.fromEnv({ SASR_TOURN_CAPTURE_FILE: 'custom.jsonl' })?.file).toBe('custom.jsonl');
    });
});
