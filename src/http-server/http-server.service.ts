import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DataService, VersionConfig } from 'src/data/data.service';
import { VersionEntry } from 'src/data/FetchHotfix/versionChain';
import { starrail } from 'src/proto/starrail';

@Injectable()
export class HttpServerService {
    constructor(
        private dataService: DataService
    ) { }

    async getDispatchService() {
        // 4.5.51: GlobalDispatchData -> Dispatch，serverList -> regionList（元素为 RegionInfo）
        const proto: starrail.Dispatch = new starrail.Dispatch({
            retcode: 0,
            regionList: [
                {
                    name: "SilentAutumnSR",
                    title: "SilentAutumnSR",
                    envType: "2",
                    dispatchUrl: "http://127.0.0.1:21000/query_gateway",
                },
            ],
        });
        const buffer = starrail.Dispatch.encode(proto).finish();
        return Buffer.from(buffer).toString("base64");
    }

    /**
     * 版本链自动抓取（对齐 pearl-sr 的 dispatch 行为）：
     *   命中 version.json 直接使用；缺失则向官方 dispatch 抓取并落盘 version.json。
     */
    async getGatewayService(versions: string, dispatchSeed = '') {
        let entry: VersionEntry | null | undefined = this.dataService.getVersionData()[versions]

        if (!entry || !entry.asset_bundle_url) {
            entry = await this.dataService.ensureVersion(versions, dispatchSeed)
        }

        if (!entry) {
            console.warn(`[gateway] 版本 ${versions} 无可用 hotfix（前缀未知或官方抓取失败）`)
            throw new ForbiddenException(
                'This version does not exist',
            );
        }

        const proto: starrail.GateServer = new starrail.GateServer({
            ip: "127.0.0.1",
            port: 23301,
            assetBundleUrl: entry.asset_bundle_url,
            exResourceUrl: entry.ex_resource_url,
            luaUrl: entry.lua_url,
            // 4.5.51: GateServer 已无 lua_version 字段，改走 ifix_url
            ifixUrl: entry.ifixUrl,
            ifixVersion: "0",
            // 4.5.51: GateServer 的这批混淆布尔位（HAFCIPEGPIN 等）已被移除，
            // 新版仅有 unk1..unk10 等未还原字段，不再逐一硬编码
            // MJJBCCMCPLK: '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',
        });
        const buffer = starrail.GateServer.encode(proto).finish();
        return Buffer.from(buffer).toString("base64");

    }
    /** 列出版本链中已知的版本 */
    listVersionsService() {
        return { retcode: 0, message: 'OK', versions: this.dataService.listVersions() }
    }

    /**
     * 强制刷新版本链中的某个版本（无视已有条目，重新向官方抓取并落盘）。
     * 用于客户端报了新版本号、但自动抓取被负缓存挡住时的手动触发。
     */
    async refreshVersionService(version: string, dispatchSeed = '') {
        if (!version) {
            throw new BadRequestException('version 参数必填')
        }
        const ok = await this.dataService.autoUpdateVersion(version, dispatchSeed)
        return {
            retcode: ok ? 0 : 1,
            message: ok ? 'OK' : 'fetch failed（版本前缀未知或官方不可达）',
            version,
        }
    }

    async loginWithPassportService() {
        return {
            "data": {
                "id": "06611ed14c3131a676b19c0d34c0644b",
                "action": "ACTION_NONE",
                "geetest": null
            }, "message": "OK", "retcode": 0
        }
    }
    async loginWithAnyService() {
        return {
            "data": {
                "account": {
                    "area_code": "**",
                    "email": "SilentAutumnSR",
                    "country": "VI",
                    "is_email_verify": "1",
                    "token": "mostsecuretokenever",
                    "uid": "1334"
                },
                "device_grant_required": false,
                "reactivate_required": false,
                "realperson_required": false,
                "safe_mobile_required": false
            },
            "message": "OK",
            "retcode": 0
        }
    }

    async riskyApiCheckService() {
        return {
            "data": {
                "id": "06611ed14c3131a676b19c0d34c0644b",
                "action": "ACTION_NONE",
                "geetest": null
            },
            "message": "OK",
            "retcode": 0
        }
    }

    async granterLoginVerificationService() {
        return {
            "data": {
                "account_type": 1,
                "combo_id": "1337",
                "combo_token": "9065ad8507d5a1991cb6fddacac5999b780bbd92",
                "data": "{\"guest\":false}",
                "heartbeat": false,
                "open_id": "1334"
            },
            "message": "OK",
            "retcode": 0
        }
    }

    async granterApiGetConfigService() {
        return {
            retcode: 0,
            message: "OK",
            data: {
                protocol: true,
                qr_enabled: false,
                log_level: "INFO",
                announce_url: "",
                push_alias_type: 0,
                disable_ysdk_guard: true,
                enable_announce_pic_popup: false,
                app_name: "崩 ??RPG",
                qr_enabled_apps: {
                    bbs: false,
                    cloud: false,
                },
                qr_app_icons: {
                    app: "",
                    bbs: "",
                    cloud: "",
                },
                qr_cloud_display_name: "",
                enable_user_center: true,
                functional_switch_configs: {},
            },
        }
    }

    async shieldApiLoadConfigService() {
        return {
            retcode: 0,
            message: "OK",
            data: {
                id: 24,
                game_key: "hkrpg_global",
                client: "PC",
                identity: "I_IDENTITY",
                guest: false,
                ignore_versions: "",
                scene: "S_NORMAL",
                name: "崩 ??RPG",
                disable_regist: false,
                enable_email_captcha: false,
                thirdparty: ["fb", "tw", "gl", "ap"],
                disable_mmt: false,
                server_guest: false,
                thirdparty_ignore: {},
                enable_ps_bind_account: false,
                thirdparty_login_configs: {
                    tw: {
                        token_type: "TK_GAME_TOKEN",
                        game_token_expires_in: 2592000,
                    },
                    ap: {
                        token_type: "TK_GAME_TOKEN",
                        game_token_expires_in: 604800,
                    },
                    fb: {
                        token_type: "TK_GAME_TOKEN",
                        game_token_expires_in: 2592000,
                    },
                    gl: {
                        token_type: "TK_GAME_TOKEN",
                        game_token_expires_in: 604800,
                    },
                },
                initialize_firebase: false,
                bbs_auth_login: false,
                bbs_auth_login_ignore: {},
                fetch_instance_id: false,
                enable_flash_login: false,
            },
        }
    }

    async shieldApiVerifyService(body: any) {
        let token = 'aa';
        let uid = '1334';

        if (body) {
            if (body.token) {
                token = body.token;
            }
            if (body.uid) {
                uid = body.uid;
            }
        }

        const response = {
            retcode: 0,
            message: 'OK',
            data: {
                account: {
                    email: 'SilentAutumnSR',
                    token: token,
                    uid: uid,
                },
            },
        };

        return response;
    }

}
