/**
 * SilentAutumnSR build.
 *
 * 1. type-check + emit TypeScript with the project-local tsc
 * 2. copy the proto runtime that tsc deliberately skips into dist/
 *
 * `src/proto/starrail.gen.js` is a 55 MB generated protobufjs module. It is
 * excluded from the TypeScript program (see tsconfig.json) because parsing it
 * costs minutes per build, so it has to be copied by hand.
 *
 * Usage: node tools/build.js [--clean]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const generated = path.join(root, 'src', 'proto', 'starrail.gen.js');
const generatedOut = path.join(dist, 'proto', 'starrail.gen.js');
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

const clean = process.argv.includes('--clean');

function main() {
    const stamp = path.join(root, 'src/proto/.inputs.sha256');
    const changed = !fs.existsSync(stamp) || fs.readFileSync(stamp,'utf8') !== require('./protocol-inputs')();
    if (changed || !fs.existsSync(generated)) {
        const gen = spawnSync(process.execPath,[path.join(root,'tools/gen-proto.js')],{cwd:root,stdio:'inherit'});
        if (gen.status !== 0) process.exit(gen.status || 1);
    } else {
        require('./prepare-protocol');
    }
    if (!fs.existsSync(generated)) {
        console.error(
            `[build] missing ${path.relative(root, generated)}\n` +
                '        run: npm run gen:proto   (or: node tools/gen-proto.js)',
        );
        process.exit(1);
    }

    if (clean && fs.existsSync(dist)) {
        fs.rmSync(dist, { recursive: true, force: true });
        console.log('[build] removed dist/');
    }

    const started = Date.now();
    console.log('[build] tsc');
    // A clean build must emit every file even if a previous build cache exists.
    const tscArgs = [tsc, '-p', 'tsconfig.build.json'];
    if (clean) tscArgs.push('--incremental', 'false');
    const res = spawnSync(process.execPath, tscArgs, {
        cwd: root,
        stdio: 'inherit',
    });
    if (res.status !== 0) {
        console.error(`[build] tsc failed with exit code ${res.status}`);
        process.exit(res.status || 1);
    }
    console.log(`[build] tsc ok (${((Date.now() - started) / 1000).toFixed(1)}s)`);

    fs.mkdirSync(path.dirname(generatedOut), { recursive: true });
    fs.copyFileSync(generated, generatedOut);
    console.log(
        `[build] copied proto runtime -> ${path.relative(root, generatedOut)} ` +
            `(${(fs.statSync(generatedOut).size / 1024 / 1024).toFixed(1)} MB)`,
    );

    // Data files are read from src/data at runtime (path.resolve(process.cwd(),
    // 'src/data', ...)), so nothing else needs copying.
    console.log('[build] done');
}

main();
