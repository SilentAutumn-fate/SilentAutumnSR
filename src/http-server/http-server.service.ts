import { Injectable, Logger } from '@nestjs/common';
import { HotfixService } from '../data/hotfix.service';
import { starrail } from '../proto/starrail';
import { assertFields } from '../proto/validate';
import { Gateway47, usesGateway47 } from '../proto/gateway47';
import { isProtocol47 } from '../proto/profile';
import {
    DEFAULT_TOKEN,
    DEFAULT_UID,
    GAME_PORT,
    GATEWAY_HOST,
    HTTP_PORT,
    HTTP_PUBLIC_HOST,
    SERVER_NAME,
} from '../common/constants';

// Preserve the extra flags used by the previously verified 4.5 beta client.
const LEGACY_GATE_SERVER_BOOL_FIELDS = [99, 497, 717, 1150, 1427, 1463];

/**
 * The account identity every SDK answer is built around.
 *
 * Sourced from the shared settings so one `server.config.json` (or the
 * `SASR_UID` / `SASR_TOKEN` environment variables) drives the whole login
 * surface: passport login, session verify and the combo granter all read the
 * same pair, and the client keys its session on it.
 */
const SDK_UID = String(DEFAULT_UID);
const SDK_TOKEN = DEFAULT_TOKEN;

@Injectable()
export class HttpServerService {
    private readonly logger = new Logger(HttpServerService.name);

    constructor(private readonly hotfixService: HotfixService) {}

    // ---- dispatch / gateway ------------------------------------------------

    /** GET /query_dispatch */
    public getDispatchService(): string {
        const proto: starrail.Dispatch = {
            retcode: 0,
            [isProtocol47 ? 'topServerRegionName' : 'topSeverRegionName']: SERVER_NAME,
            regionList: [
                {
                    name: SERVER_NAME,
                    title: SERVER_NAME,
                    displayName: SERVER_NAME,
                    envType: isProtocol47 ? '11' : '9',
                    dispatchUrl: `http://${HTTP_PUBLIC_HOST}:${HTTP_PORT}/query_gateway`,
                },
            ],
        };
        return this.encodeBase64('Dispatch', proto);
    }

    /**
     * GET /query_gateway?version=&dispatch_seed=
     *
     * Serves the hotfix (asset/resource/lua/ifix) URLs for the requested client
     * version. HotfixService resolves them from every configured source and
     * persists whatever it learns into src/data/version.json.
     */
    public async getGatewayService(version: string, dispatchSeed = ''): Promise<string> {
        // The client's HEAD probe carries no version and only checks HTTP status.
        if (!version) return '';
        const urls = (await this.hotfixService.resolve(version, dispatchSeed)).entry;

        if (usesGateway47(version)) {
            const fields = {
                ip: GATEWAY_HOST, port: GAME_PORT, regionName: SERVER_NAME,
                assetBundleUrl: urls.asset_bundle_url, exResourceUrl: urls.ex_resource_url,
                luaUrl: urls.lua_url, luaVersion: urls.lua_version,
                baseAssetBundleUrl: urls.base_asset_bundle_url ?? '',
                ifixUrl: urls.ifixUrl ?? '', ifixVersion: urls.ifix_version ?? '0',
                unk1: true, unk2: true, unk3: true, unk4: true,
                unk5: true, unk6: true, unk7: true, unk8: true,
            };
            return Buffer.from(Gateway47.encode(Gateway47.fromObject(fields)).finish()).toString('base64');
        }

        const proto: starrail.GateServer = {
            ip: GATEWAY_HOST,
            port: GAME_PORT,
            regionName: SERVER_NAME,
            assetBundleUrl: urls.asset_bundle_url,
            exResourceUrl: urls.ex_resource_url,
            luaUrl: urls.lua_url,
            ifixUrl: urls.ifixUrl ?? '',
            ifixVersion: urls.ifix_version ?? '0',
            mdkResVersion: '0',
            // Match the flags PearlSR sets in its gateway response.
            unk1: true,
            unk2: true,
            unk3: true,
            unk4: true,
            unk5: true,
            unk6: true,
            unk7: true,
            unk8: true,
            unk9: true,
            unk10: true,
            unk11: true,
            unk12: true,
            unk13: true,
            unk14: true,
            unk15: true,
            unk16: true,
        };

        const type = starrail.GateServer;
        assertFields('GateServer', type, proto);
        const encoded = Buffer.from(type.encode(type.fromObject(proto)).finish());
        const legacy = /^(CN|OS)BETAWin4\.5\./.test(version);
        return (legacy ? appendBoolFields(encoded, LEGACY_GATE_SERVER_BOOL_FIELDS) : encoded)
            .toString('base64');
    }

    private encodeBase64(messageName: string, fields: Record<string, any>): string {
        const type = starrail[messageName];
        if (!type) throw new Error(`unknown protobuf type ${messageName}`);
        assertFields(messageName, type, fields);
        const encoded = type.encode(type.fromObject(fields)).finish();
        return Buffer.from(encoded).toString('base64');
    }

    // ---- SDK stubs ---------------------------------------------------------
    //
    // These bodies are copied literal-for-literal from the reference
    // (pearl-sr dispatch/src/authentication.zig, see docs/spec-dispatch.md §5).
    // The field names and even the typos matter: the client parses these
    // responses by key, and a plausible-looking but differently-shaped body is
    // rejected with nothing but "login failed" on the client side.

    /** POST /:product_name/mdk/shield/api/login */
    public loginWithAnyService() {
        return {
            data: {
                account: {
                    area_code: '**',
                    // The reference ships this account name; this server brands
                    // it with its own name instead.
                    email: `${SERVER_NAME}@StarRail.com`,
                    country: 'RU',
                    is_email_verify: '1',
                    token: SDK_TOKEN,
                    uid: SDK_UID,
                },
                device_grant_required: false,
                reactivate_required: false,
                realperson_required: false,
                // No underscore between "mobile" and "required" in the reference.
                safe_mobilerequired: false,
            },
            message: 'OK',
            retcode: 0,
        };
    }

    /** POST /account/risky/api/check */
    public riskyApiCheckService() {
        return {
            retcode: 0,
            message: 'OK',
            data: {
                id: '06611ed14c3131a676b19c0d34c0644b',
                action: 'ACTION_NONE',
                // Explicit JSON null in the reference.
                geetest: null,
            },
        };
    }

    /**
     * POST /:product_name/combo/granter/login/v2/login
     *
     * The 4.5.54 CN SDK parses this with `ComboManager.OnRequestComboLogin`,
     * which hands the inner `data` string to `ProtocolManager.CheckShowProtocol`
     * to decide whether to show the user-agreement dialog. That parser reads the
     * protocol fields straight off the parsed node, so the reference's minimal
     * `{"guest": false}` makes it dereference a missing key and throw
     * NullReferenceException —the request "succeeds" but the SDK aborts the
     * login job, its HTTP coroutine catches the throw, and the player sees the
     * network-timeout toast while the game loops back to `login_account_plat`:
     *
     *   PerformHttpRequest:System.NullReferenceException
     *     at MiHoYo.SDK.ProtocolManager.CheckShowProtocol (MiHoYo.SDK.JSONNode)
     *     at MiHoYo.SDK.Win.ComboManager.OnRequestComboLogin (...)
     *     at MiHoYo.SDK.NetUtil+<PerformHttpRequestInternal>d__16.MoveNext ()
     *
     * The protocol block is therefore sent twice —inline in the `data` string the
     * SDK actually parses, and at the top level for the callers that read it there.
     */
    public granterLoginVerificationService() {
        return {
            data: {
                account_type: 1,
                open_id: SDK_UID,
                combo_id: SDK_UID,
                combo_token: '9065ad8507d5a1991cb6fddacac5999b780bbd92',
                heartbeat: false,
                // A JSON string inside JSON; the SDK parses this one.
                data: '{"guest": false, "protocol": false, "protocol_version": "3", "protocol_revision": 0}',
                protocol: false,
                protocol_version: '3',
                protocol_revision: 0,
            },
            message: 'OK',
            retcode: 0,
        };
    }

    /**
     * POST /:product_name/combo/granter/api/compareProtocolVersion
     *
     * Part of the combo login handshake: the client offers its protocol version
     * and the server may hand back a replacement. Answering "no update" (`protocol:
     * false`) makes the client keep its built-in protocol.
     *
     * This endpoint is easy to miss because the global-client proxy config blocks
     * it, so it never reached a server; the CN client calls it for real and a 404
     * stops the login dead —the client retries and never asks for the gateway.
     */
    public granterCompareProtocolVersionService(body: any) {
        return {
            retcode: 0,
            message: 'OK',
            data: {
                protocol: false,
                protocol_version: String(body?.major ?? '3'),
                protocol_revision: 0,
            },
        };
    }

    /** GET /:product_name/combo/granter/api/getConfig */
    public granterApiGetConfigService() {
        return {
            retcode: 0,
            message: 'OK',
            data: {
                // SASR does not serve remote user agreements. Keep this consistent
                // with compareProtocolVersion, which tells the SDK to keep its built-in protocol.
                protocol: false,
                qr_enabled: false,
                log_level: 'INFO',
                announce_url: '',
                push_alias_type: 0,
                disable_ysdk_guard: true,
                enable_announce_pic_popup: false,
                app_name: '崩坏：星穹铁道',
                qr_enabled_apps: { bbs: false, cloud: false },
                qr_app_icons: { app: '', bbs: '', cloud: '' },
                qr_cloud_display_name: '',
                enable_user_center: true,
                functional_switch_configs: {},
            },
        };
    }

    /** GET /:product_name/mdk/shield/api/loadConfig */
    public shieldApiLoadConfigService() {
        return {
            retcode: 0,
            message: 'OK',
            data: {
                id: 24,
                game_key: 'hkrpg_cn',
                client: 'PC',
                identity: 'I_IDENTITY',
                guest: false,
                ignore_versions: '',
                scene: 'S_NORMAL',
                name: '崩坏：星穹铁道',
                disable_regist: false,
                enable_email_captcha: false,
                thirdparty: ['fb', 'tw', 'gl', 'ap'],
                disable_mmt: false,
                server_guest: false,
                thirdparty_ignore: {},
                enable_ps_bind_account: false,
                thirdparty_login_configs: {
                    tw: { token_type: 'TK_GAME_TOKEN', game_token_expires_in: 2592000 },
                    ap: { token_type: 'TK_GAME_TOKEN', game_token_expires_in: 604800 },
                    fb: { token_type: 'TK_GAME_TOKEN', game_token_expires_in: 2592000 },
                    gl: { token_type: 'TK_GAME_TOKEN', game_token_expires_in: 604800 },
                },
                initialize_firebase: false,
                bbs_auth_login: false,
                bbs_auth_login_ignore: {},
                fetch_instance_id: false,
                enable_flash_login: false,
            },
        };
    }

    /** POST /:product_name/mdk/shield/api/verify */
    public shieldApiVerifyService(body: any) {
        return {
            retcode: 0,
            message: 'OK',
            data: {
                account: {
                    area_code: '**',
                    country: 'CN',
                    is_email_verify: '1',
                    email: `${SERVER_NAME}@StarRail.com`,
                    // Only string values are echoed; anything else falls back.
                    token: typeof body?.token === 'string' ? body.token : SDK_TOKEN,
                    uid: typeof body?.uid === 'string' ? body.uid : SDK_UID,
                },
            },
        };
    }

    /**
     * POST /account/ma-cn-passport/app/loginByPassword
     *
     * This is the response the client's AccountPlatNative.dll actually parses.
     * The reference returns `data.token` + `data.user_info` (there is no
     * `data.account` here, and no device/realperson flags) —the same body shape
     * as shield login does NOT work.
     *
     * Note the singular `token` key here versus `tokens` in
     * passportVerifyService; they are read differently and must not be unified.
     */
    public passportLoginService() {
        return {
            retcode: 0,
            message: 'OK',
            data: {
                token: { token: SDK_TOKEN, token_type: '1' },
                user_info: {
                    aid: SDK_UID,
                    mid: SDK_UID,
                    area_code: '**',
                    country: 'RU',
                    email: `${SERVER_NAME}@StarRail.com`,
                    is_email_verify: '1',
                    is_adult: '1',
                },
            },
        };
    }

    /**
     * POST /account/ma-cn-session/app/verify
     *
     * Identical to passportLoginService except that the key is `tokens`
     * (plural) and the value is an OBJECT, not an array.
     */
    public globalPassportLoginService() {
        const result = this.passportLoginService();
        return {
            ...result,
            data: {
                token: { token: SDK_TOKEN, token_type: 1 },
                user_info: { ...result.data.user_info, account_name: SERVER_NAME, token: SDK_TOKEN, is_adult: 1 },
                bind_email_action_ticket: '',
                reactivate_action_token: '',
                ext_user_info: { birth: '0', guardian_email: '' },
            },
        };
    }

    public passportVerifyService() {
        return {
            retcode: 0,
            message: 'OK',
            data: {
                tokens: { token: SDK_TOKEN, token_type: '1' },
                user_info: {
                    aid: SDK_UID,
                    mid: SDK_UID,
                    area_code: '**',
                    country: 'RU',
                    email: `${SERVER_NAME}@StarRail.com`,
                    is_email_verify: '1',
                    is_adult: '1',
                },
            },
        };
    }

    /** Empty-but-valid answer for the endpoints the client probes alongside login. */
    public emptyOkService() {
        return { retcode: 0, message: 'OK', data: {} };
    }

    // ---- account-platform endpoints ---------------------------------------
    //
    // The 4.5.54 CN SDK walks more of passport-api than the reference ever sees,
    // because the reference's proxy config only force-redirects the dispatch and
    // gateway URLs. With launcher injection (hkrpg.dll rewrites every SDK URL to
    // this server) each of these must answer, or the SDK job that needs it fails
    // and the game restarts the whole login flow in a tight loop.

    /**
     * POST /account/ma-cn-session/app/exchange
     *
     * Swaps the session token returned by passport login (`token_type` 1) for a
     * game token (`token_type` 4). Request:
     *   {"mid":"1337","dst_token_type":4,"src_token":{"token_type":1,"token":"aa"}}
     *
     * `dst_token_type` is echoed back because the SDK compares it with what it
     * asked for; a 404 here makes the login job fail with "http request failed"
     * and the client retries until it gives up with a network timeout.
     */
    public sessionExchangeService(body: any) {
        return {
            retcode: 0,
            message: 'OK',
            data: {
                token: {
                    token_type: String(body?.dst_token_type ?? 4),
                    token: SDK_TOKEN,
                },
                user_info: this.userInfo(),
            },
        };
    }

    /** POST /account/ma-cn-session/app/getTokenByGameToken (same shape as exchange). */
    public getTokenByGameTokenService(body: any) {
        return {
            retcode: 0,
            message: 'OK',
            data: {
                token: {
                    token_type: String(body?.dst_token_type ?? 4),
                    token: SDK_TOKEN,
                },
                user_info: this.userInfo(),
            },
        };
    }

    /**
     * POST /data_abtest_api/config/experiment/list
     *
     * The SDK asks for A/B experiments right after the combo login. Copied from
     * FreeSR's GetExperimentListHandler: the reply has no `data` key at all, just
     * `success` —an empty experiment list is the "no experiments" answer.
     */
    public experimentListService() {
        return { retcode: 0, success: true, message: '', data: [] };
    }

    /**
     * POST /sdk/dataUpload, /loginsdk/dataUpload, /hkrpg/dataUpload, ...
     *
     * Telemetry. The reference proxy config blocks these outright; answering
     * `{"code":0}` (FreeSR's SdkDataUploadHandler) is the cheapest way to keep
     * the uploader quiet without 404 noise in the log.
     */
    public dataUploadService() {
        return { code: 0 };
    }

    /** GET /:product_name/mdk/agreement/api/getAgreementInfos */
    public agreementInfosService() {
        return {
            retcode: 0,
            message: 'OK',
            data: { marketing_agreements: [] },
        };
    }

    /** GET /device-fp/api/getExtList */
    public deviceExtListService() {
        return {
            retcode: 0,
            message: 'OK',
            data: { ext_list: [], device_id: SDK_TOKEN },
        };
    }

    /** GET /combo/box/api/config/sdk/combo and /combo/box/api/config/sw/precache */
    public comboBoxConfigService() {
        return {
            retcode: 0,
            message: 'OK',
            data: { vals: {} },
        };
    }

    /**
     * Last-resort answer for any SDK path we have not modelled.
     *
     * Deliberately declared last so every explicit route wins. It exists because
     * a 404 from Nest reads to the SDK as a failed network job: with the proxy
     * these paths were either blocked or passed through to the real service, so
     * the client never had to cope with a JSON error body.
     */
    public fallbackService(method: string, url: string) {
        this.logger.warn(`unmodelled SDK request ${method} ${url} — answering a neutral 200`);
        return { retcode: 0, message: 'OK', data: {} };
    }

    /** The `user_info` block shared by every session/token answer. */
    private userInfo() {
        return {
            aid: SDK_UID,
            mid: SDK_UID,
            area_code: '**',
            country: 'RU',
            email: `${SERVER_NAME}@StarRail.com`,
            is_email_verify: '1',
            is_adult: '1',
        };
    }
}


/**
 * Append bare `true` varint fields to an already-encoded protobuf message.
 * Duplicate field numbers are legal on the wire and the client's last-wins
 * parser produces the intended value.
 */
export function appendBoolFields(encoded: Buffer, fieldNumbers: number[]): Buffer {
    const extra: number[] = [];
    for (const field of fieldNumbers) {
        const tagBytes: number[] = [];
        let value = field << 3; // wire type 0 (varint)
        // Encode the tag as a varint, then the value 1.
        do {
            let byte = value & 0x7f;
            value >>>= 7;
            if (value) byte |= 0x80;
            tagBytes.push(byte);
        } while (value);
        extra.push(...tagBytes, 1);
    }
    return extra.length ? Buffer.concat([encoded, Buffer.from(extra)]) : encoded;
}
