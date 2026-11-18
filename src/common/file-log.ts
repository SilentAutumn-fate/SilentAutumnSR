import * as fs from 'fs';
import * as path from 'path';
import { LOGS_DIR } from './constants';

/**
 * Mirror everything the server prints into `<logs dir>/server.log`.
 *
 * Diagnosis needs the server's own output, but the server is normally started by
 * run.bat in its own window, where that output scrolls away and cannot be read
 * afterwards. Writing it to a file means "what did the client actually ask for"
 * is always answerable. The directory is configurable (`SASR_LOGS_DIR`), so a
 * checkout can be run from a read-only tree with logs redirected elsewhere.
 *
 * The log is appended to and truncated once it passes MAX_BYTES, so a long
 * running server cannot fill the disk. File writes are best-effort: the server
 * must keep running even if the log cannot be written.
 */
const MAX_BYTES = 8 * 1024 * 1024;

let stream: fs.WriteStream | null = null;
let bytesWritten = 0;
let installed = false;

function logPath(): string {
    return path.join(LOGS_DIR, 'server.log');
}

function open(): void {
    const file = logPath();
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });

        // Rotate once per process start if the previous log grew too large.
        if (fs.existsSync(file)) {
            const { size } = fs.statSync(file);
            if (size > MAX_BYTES) {
                fs.renameSync(file, `${file}.1`);
            } else {
                bytesWritten = size;
            }
        }
        stream = fs.createWriteStream(file, { flags: 'a' });
    } catch {
        stream = null;
    }
}

function write(line: string): void {
    if (!stream) return;
    try {
        stream.write(`${new Date().toISOString()} ${line}\n`);
        bytesWritten += line.length + 1;
        if (bytesWritten > MAX_BYTES) {
            stream.end();
            stream = null;
            // Reopen on the next write, rotating the oversized file away first.
            setTimeout(() => {
                try {
                    fs.renameSync(logPath(), `${logPath()}.1`);
                } catch {
                    /* best effort */
                }
                bytesWritten = 0;
                open();
            }, 0);
        }
    } catch {
        /* never let logging break the server */
    }
}

/** Format console arguments the way console.log would, without ANSI colour. */
function format(args: unknown[]): string {
    return args
        .map((a) => {
            if (typeof a === 'string') return a;
            if (a instanceof Error) return a.stack ?? a.message;
            try {
                return JSON.stringify(a);
            } catch {
                return String(a);
            }
        })
        .join(' ');
}

/** Call once, before anything else logs. */
export function installFileLogging(): void {
    if (installed) return;
    installed = true;
    open();

    for (const level of ['log', 'info', 'warn', 'error'] as const) {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]): void => {
            original(...args);
            write(`[${level.toUpperCase()}] ${format(args)}`);
        };
    }

    write(`--- SilentAutumnSR starting (pid ${process.pid}, node ${process.version}) ---`);
    console.log(`[log] writing to ${logPath()}`);
}
