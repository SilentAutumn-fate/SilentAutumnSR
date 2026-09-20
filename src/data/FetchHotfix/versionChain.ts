/**
 * Version chain (hotfix auto-fetch) —— 对齐 pearl-sr 的 dispatch 行为
 *
 * 流程（与 pearl-sr/dispatch/src/dispatch.zig 一致）：
 *   1. 按版本前缀选择官方 dispatch 主机        selectHost()
 *   2. 构造官方 query_gateway URL               constructGatewayUrl()
 *   3. HTTPS GET（基岩为 base64 文本）
 *   4. base64 解码 → starrail.GateServer 反序列化
 *   5. 抽取 asset_bundle_url / ex_resource_url / lua_url / ifix_url
 *   6. 回写 version.json
 *
 * 与 pearl-sr 的差异：pearl-sr 写 hotfix.json（字段 ifix_url），
 * SilentAutumnSR 沿用自身的 version.json（字段 ifixUrl），保持 http-server 读取方式不变。
 */
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs-extra';
import { starrail } from 'src/proto/starrail';

/** version.json 里单个版本条目的形状（与 DataService.VersionConfig 保持一致） */
export interface VersionEntry {
    asset_bundle_url: string;
    ex_resource_url: string;
    lua_url: string;
    lua_version: string;
    ifixUrl: string;
}

/** 官方 dispatch 主机选择表（照搬 pearl-sr selectHost） */
export function selectHost(version: string): string {
    if (version.startsWith('CNPROD')) return 'prod-gf-cn-dp01.bhsr.com';
    if (version.startsWith('CNBETA')) return 'beta-release01-cn.bhsr.com';
    if (version.startsWith('OSPROD')) return 'prod-official-asia-dp01.starrails.com';
    if (version.startsWith('OSBETA')) return 'beta-release01-asia.starrails.com';
    return '';
}

/** 由 lua_url 反推 lua_version（形如 .../output_7668875_xxx） */
export function extractLuaVersion(luaUrl: string): string {
    const m = /output_(\d+)_/.exec(luaUrl || '');
    return m ? m[1] : '';
}

/**
 * 构造官方 query_gateway URL。
 * 参数取值与 pearl-sr constructUrl 一致（已验证可用）。
 */
export function constructGatewayUrl(host: string, version: string, dispatchSeed: string): string {
    const qs = new URLSearchParams({
        version,
        dispatch_seed: dispatchSeed || '',
        language_type: '1',
        platform_type: '2',
        channel_id: '1',
        sub_channel_id: '1',
        is_need_url: '1',
        account_type: '1',
    });
    return `https://${host}/query_gateway?${qs.toString()}`;
}

/** 从官方 GateServer 报文中抽取 hotfix 条目 */
export function extractHotfix(gate: starrail.GateServer): VersionEntry | null {
    const asset_bundle_url = gate.assetBundleUrl || '';
    const ex_resource_url = gate.exResourceUrl || '';
    const lua_url = gate.luaUrl || '';
    const ifixUrl = gate.ifixUrl || '';

    // 与 pearl-sr 相同的完整性判据
    if (!asset_bundle_url || !ex_resource_url || !lua_url) return null;

    return {
        asset_bundle_url,
        ex_resource_url,
        lua_url,
        lua_version: extractLuaVersion(lua_url),
        ifixUrl,
    };
}

/**
 * 报文是否算"纯文本"错误。
 *
 * 注意：正常的 GateServer 报文里内嵌了大量 URL 与 base64（活动签名等），
 * 可打印字符占比同样很高（实测 >0.95），因此**不能只看可打印率**。
 * 官方错误信息非常短（实测 97 / 131 字节），故以长度为主判据。
 */
function looksLikeText(buf: Buffer): boolean {
    if (buf.length === 0 || buf.length > 512) return false;
    let printable = 0;
    for (const b of buf) {
        if ((b >= 0x20 && b < 0x7f) || b === 0x0a || b === 0x0d || b === 0x09) printable++;
    }
    return printable / buf.length > 0.9;
}

/** 在二进制里抓出所有 http(s) URL */
/**
 * 按 protobuf wire 格式遍历报文，收集所有"内容为 http(s) URL"的长度限定字段。
 *
 * 为什么不直接用正则扫 ASCII：URL 后面紧跟的通常是下一个字段的 tag 字节，
 * 而这些字节时常恰好是可打印字母（实测吞到过 'J'、'x'），正则会污染 URL。
 * 走 wire 格式能拿到精确的字段长度，不会越界。
 */
function collectUrlStrings(buf: Buffer, out: string[], depth = 0): void {
    if (depth > 8) return;
    let i = 0;

    const readVarint = (): number | null => {
        let v = 0;
        let shift = 0;
        for (;;) {
            if (i >= buf.length || shift > 35) return null;
            const b = buf[i++];
            v += (b & 0x7f) * Math.pow(2, shift);
            shift += 7;
            if (!(b & 0x80)) return v;
        }
    };

    while (i < buf.length) {
        const tag = readVarint();
        if (tag === null) return;

        const wire = tag % 8;

        if (wire === 0) {
            if (readVarint() === null) return;
        } else if (wire === 1) {
            i += 8;
            if (i > buf.length) return;
        } else if (wire === 5) {
            i += 4;
            if (i > buf.length) return;
        } else if (wire === 2) {
            const len = readVarint();
            if (len === null) return;
            if (i + len > buf.length) return;
            const sub = buf.subarray(i, i + len);
            i += len;

            if (sub.length >= 8 && sub.subarray(0, 8).toString('latin1').toLowerCase().startsWith('http')) {
                out.push(sub.toString('latin1'));
            } else {
                collectUrlStrings(sub, out, depth + 1);
            }
        } else {
            // 3/4 组类型（已废弃）或非法，停止
            return;
        }
    }
}

/**
 * 兜底提取：官方返回的 GateServer 布局可能与本地 proto 的版本不一致
 * （实测 4.5.0 正式服的响应无法用 4.5.51 beta 的 GateServer 严格反序列化），
 * 但 URL 作为长度限定字段在报文里是明文的。
 * 按路径特征分类取首个出现 —— 与请求 platform_type 对应的那一份排在最前。
 */
export function extractHotfixByUrls(buf: Buffer): VersionEntry | null {
    const urls: string[] = [];
    collectUrlStrings(buf, urls);

    const pick = (seg: string) => urls.find((u) => u.includes(seg)) || '';

    const lua_url = pick('/lua/');
    const asset_bundle_url = pick('/asb/');
    const ex_resource_url = pick('/design_data/');
    const ifixUrl = pick('/ifix/');

    if (!lua_url || !asset_bundle_url || !ex_resource_url) return null;

    return {
        asset_bundle_url,
        ex_resource_url,
        lua_url,
        lua_version: extractLuaVersion(lua_url),
        ifixUrl,
    };
}

export interface FetchOptions {
    /** 重试次数（pearl-sr 为 3） */
    retries?: number;
    /** 重试间隔毫秒（pearl-sr 为 100ms） */
    retryDelayMs?: number;
    /** 单次请求超时毫秒 */
    timeoutMs?: number;
}

export interface FetchResult {
    ok: boolean;
    entry?: VersionEntry;
    /** 失败原因，便于日志与排查 */
    reason?: string;
    /** 官方原始响应片段（截断），便于判断是 403/维护/维护中 */
    raw?: string;
}

/**
 * 向官方查询单个版本的 hotfix 信息。
 * 不抛异常，失败通过 FetchResult.reason 返回。
 */
export async function fetchHotfixFromServer(
    version: string,
    dispatchSeed: string,
    opts: FetchOptions = {},
): Promise<FetchResult> {
    const { retries = 3, retryDelayMs = 100, timeoutMs = 10_000 } = opts;

    const host = selectHost(version);
    if (!host) {
        return { ok: false, reason: `未知版本前缀，无法推断 dispatch 主机: ${version}` };
    }

    const url = constructGatewayUrl(host, version, dispatchSeed);
    let lastReason = 'unknown';

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await axios.get(url, {
                timeout: timeoutMs,
                responseType: 'text',
                transformResponse: [(d) => d],
                headers: {
                    // 与 pearl-sr 一致，伪装成游戏客户端
                    'User-Agent': 'UnityPlayer/2021.3.21f1',
                    Accept: '*/*',
                },
                validateStatus: () => true,
            });

            if (res.status !== 200) {
                lastReason = `HTTP ${res.status}`;
                continue;
            }

            const body = typeof res.data === 'string' ? res.data.trim() : String(res.data);
            if (!body) {
                lastReason = '官方返回空响应';
                continue;
            }

            let buf: Buffer;
            try {
                buf = Buffer.from(body, 'base64');
            } catch {
                lastReason = 'base64 解码失败';
                continue;
            }

            // 路径 1：严格反序列化（本地 proto 与目标版本一致时可用）
            let entry: VersionEntry | null = null;
            try {
                const gate = starrail.GateServer.decode(buf);
                entry = extractHotfix(gate);
            } catch (e) {
                entry = null;
            }

            // 路径 2：兜底按 URL 特征提取（proto 版本不一致时，URL 在报文里是明文的）
            if (!entry) {
                entry = extractHotfixByUrls(buf);
            }

            // 路径 3：仍未成功，判断是否为官方文本错误
            if (!entry) {
                if (looksLikeText(buf)) {
                    const msg = buf.toString('utf8').trim();
                    lastReason =
                        `官方拒绝：${msg}` +
                        (dispatchSeed ? '' : '（本次未携带 dispatch_seed；客户端请求时会自动带上）');
                } else {
                    lastReason = '未能从官方响应中提取出 hotfix URL（可能处于维护状态）';
                }
                continue;
            }

            return { ok: true, entry };
        } catch (e) {
            lastReason = (e as Error).message;
        }

        if (attempt < retries) {
            await new Promise((r) => setTimeout(r, retryDelayMs));
        }
    }

    return { ok: false, reason: lastReason };
}

/** 读写 version.json 的低层助手（data.service 也用它，避免两处逻辑分叉） */
export class VersionStore {
    private readonly filePath: string;

    constructor(cwd: string = process.cwd()) {
        this.filePath = path.resolve(cwd, './src/data/version.json');
    }

    get path(): string {
        return this.filePath;
    }

    read(): Record<string, VersionEntry> {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, VersionEntry>;
    }

    write(data: Record<string, VersionEntry>): void {
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    has(version: string): boolean {
        return !!this.read()[version];
    }

    upsert(version: string, entry: VersionEntry): void {
        const data = this.read();
        data[version] = entry;
        this.write(data);
    }
}
