/**
 * 批量刷新版本链（离线/主动维护用）
 *
 * 用法（在项目根目录）：
 *   node -r ts-node/register src/data/FetchHotfix/refresh_versions.ts CNBETAWin4.5.51 CNBETAWin4.5.54
 *   node -r ts-node/register src/data/FetchHotfix/refresh_versions.ts --all      # 刷新 version.json 中已有版本
 *   node -r ts-node/register src/data/FetchHotfix/refresh_versions.ts --probe CNPRODWin4.5.0  # 只探测不写盘
 *
 * 行为与 pearl-sr 的 dispatch 自动抓取一致：
 *   按版本前缀选官方主机 → query_gateway → base64 解码 → GateServer → 抽取 URL → 写入 version.json
 */
import { fetchHotfixFromServer, selectHost, VersionStore } from './versionChain';

const PROBE_ONLY = process.argv.includes('--probe');
const ALL = process.argv.includes('--all');

async function main() {
    const store = new VersionStore();

    let versions: string[];
    if (ALL) {
        versions = Object.keys(store.read());
        console.log(`[refresh] --all：准备刷新 version.json 中的 ${versions.length} 个版本`);
    } else {
        versions = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    }

    if (versions.length === 0) {
        console.error('用法: refresh_versions.ts <version...> | --all');
        console.error('示例: refresh_versions.ts CNBETAWin4.5.51 CNBETAWin4.5.52');
        process.exit(2);
    }

    let okCount = 0;
    let failCount = 0;

    for (const version of versions) {
        const host = selectHost(version);
        if (!host) {
            console.log(`✗ ${version.padEnd(24)} 前缀未知，无法推断官方主机`);
            failCount++;
            continue;
        }

        const before = store.read()[version];
        // 先看现有条目，便于对比是否有更新
        const result = await fetchHotfixFromServer(version, '');

        if (!result.ok || !result.entry) {
            console.log(`✗ ${version.padEnd(24)} 抓取失败: ${result.reason}`);
            failCount++;
            continue;
        }

        const e = result.entry;
        const changed = !before || before.asset_bundle_url !== e.asset_bundle_url;
        const mark = changed ? (before ? '↻ 已更新' : '＋ 新增') : '· 无变化';

        console.log(`${changed ? '✓' : '·'} ${version.padEnd(24)} ${mark}`);
        console.log(`    asb : ${e.asset_bundle_url}`);
        console.log(`    res : ${e.ex_resource_url}`);
        console.log(`    lua : ${e.lua_url}   (lua_version=${e.lua_version})`);
        console.log(`    ifix: ${e.ifixUrl}`);

        if (!PROBE_ONLY) store.upsert(version, e);
        okCount++;
    }

    console.log('');
    console.log(
        `完成：成功 ${okCount} / 失败 ${failCount}` +
            (PROBE_ONLY ? '（--probe 模式，未写盘）' : `，已写入 ${store.path}`),
    );
}

main().catch((e) => {
    console.error('refresh_versions 异常:', e);
    process.exit(1);
});
