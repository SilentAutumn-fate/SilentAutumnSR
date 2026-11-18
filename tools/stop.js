/**
 * Stop the SilentAutumnSR server.
 *
 * Only processes that are actually LISTENING on this project's ports are
 * terminated — never a blanket "kill all node", which would take down unrelated
 * Node applications (editors, other dev servers, the DSH harness itself).
 *
 * Usage: node tools/stop.js
 */
const { execSync } = require('child_process');
const { settings } = require('./server-config');

// Ports come from the same settings the server uses (server.config.json /
// SASR_* environment variables), so a non-default port still gets stopped.
const PORTS = [...new Set([settings.game.port, settings.http.port])];

function listeningPids() {
    let out = '';
    try {
        out = execSync('netstat -ano -p tcp', { encoding: 'utf-8' });
    } catch (err) {
        out = String(err?.stdout ?? '');
    }

    const found = new Map();
    for (const line of out.split(/\r?\n/)) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 5) continue;
        const [proto, local, , state, pid] = cols;
        if (proto.toUpperCase() !== 'TCP') continue;
        if (state.toUpperCase() !== 'LISTENING') continue;
        const port = Number(local.split(':').pop());
        if (!PORTS.includes(port)) continue;
        found.set(Number(pid), port);
    }
    return found;
}

function main() {
    const pids = listeningPids();
    if (pids.size === 0) {
        console.log('[stop] nothing is listening on ' + PORTS.join(' / '));
        return;
    }
    for (const [pid, port] of pids) {
        console.log(`[stop] killing pid ${pid} (listening on ${port})`);
        try {
            process.kill(pid);
        } catch (err) {
            console.warn(`[stop] could not kill pid ${pid}: ${err.message}`);
        }
    }
    setTimeout(() => {
        const left = listeningPids();
        if (left.size) {
            console.warn('[stop] still listening: ' + [...left.entries()].map(([p, o]) => `${p}@${o}`).join(', '));
        } else {
            console.log('[stop] ports are free');
        }
    }, 500);
}

main();
