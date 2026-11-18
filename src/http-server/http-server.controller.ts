import { All, Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { HttpServerService } from './http-server.service';

/**
 * The dispatch surface, ported route-for-route from the reference
 * (pearl-sr `dispatch/src/main.zig` + `authentication.zig`).
 *
 * The reference serves exactly these paths and answers every other request with
 * a 404. That matters: the client's SDK parses each response by key, so an
 * invented "generous" reply for an endpoint the reference does not implement is
 * worse than no reply at all — the SDK reads a success code, then fails on a
 * missing field, and the only symptom is "login failed".
 *
 * Response bodies live in HttpServerService and are copied literal-for-literal
 * from the reference; see docs/spec-dispatch.md §5.
 *
 * POST routes are pinned to 200 because the endpoints they imitate answer 200
 * and Nest would otherwise reply 201.
 */
@Controller('')
export class HttpServerController {
    constructor(private readonly httpServerService: HttpServerService) {}

    // ---- dispatch / gateway (protobuf, base64) -----------------------------

    @Get('/query_dispatch')
    async getDispatch(): Promise<string> {
        return this.httpServerService.getDispatchService();
    }

    @Get('/query_gateway')
    async getGateway(
        @Query('version') version: string,
        @Query('dispatch_seed') dispatchSeed: string,
    ): Promise<string> {
        return this.httpServerService.getGatewayService(version, dispatchSeed ?? '');
    }

    // ---- JSON endpoints ----------------------------------------------------

    @HttpCode(200)
    @Post('/account/risky/api/check')
    async riskyApiCheck() {
        return this.httpServerService.riskyApiCheckService();
    }

    @HttpCode(200)
    @Post('/:productName/mdk/shield/api/login')
    async shieldApiLogin() {
        return this.httpServerService.loginWithAnyService();
    }

    @HttpCode(200)
    @Post('/:productName/mdk/shield/api/verify')
    async shieldApiVerify(@Body() body: any) {
        return this.httpServerService.shieldApiVerifyService(body);
    }

    @HttpCode(200)
    @Post('/:productName/combo/granter/login/v2/login')
    async granterLoginVerification() {
        return this.httpServerService.granterLoginVerificationService();
    }

    @HttpCode(200)
    @Post('/account/ma-cn-passport/app/loginByPassword')
    async loginByPassword() {
        return this.httpServerService.passportLoginService();
    }

    @HttpCode(200)
    @Post('/hkrpg_global/account/ma-passport/api/appLoginByPassword')
    async globalLoginByPassword() {
        return this.httpServerService.globalPassportLoginService();
    }

    // HoYoPass verifies its cached local session before opening the login UI.
    // Returning the neutral fallback here produces an SDK ret=1 despite HTTP 200.
    @HttpCode(200)
    @Post('/hkrpg_global/account/ma-passport/token/verifySToken')
    async globalVerifySToken() {
        return this.httpServerService.globalPassportLoginService();
    }

    @HttpCode(200)
    @Post('/account/ma-cn-session/app/verify')
    async passportVerify() {
        return this.httpServerService.passportVerifyService();
    }

    // ---- config reads the client makes during login ------------------------
    //
    // Not routed in the reference (its handlers are dead code there), but the
    // 4.5.54 client requests both and they are pure configuration, so they are
    // served rather than 404'd.

    @Get('/:productName/combo/granter/api/getConfig')
    async granterApiGetConfig() {
        return this.httpServerService.granterApiGetConfigService();
    }

    @Get('/:productName/mdk/shield/api/loadConfig')
    async shieldApiLoadConfig() {
        return this.httpServerService.shieldApiLoadConfigService();
    }

    /**
     * POST /:product_name/combo/granter/api/compareProtocolVersion
     *
     * Also unrouted in the reference, but the CN client calls it as part of the
     * combo handshake and a 404 there makes it retry and never ask for the
     * gateway. `protocol: false` means "keep your built-in protocol".
     */
    @HttpCode(200)
    @Post('/:productName/combo/granter/api/compareProtocolVersion')
    async granterCompareProtocolVersion(@Body() body: any) {
        return this.httpServerService.granterCompareProtocolVersionService(body);
    }

    // ---- account-platform surface the launcher-injected CN SDK walks --------
    //
    // With the reference's proxy these paths were either blocked outright or
    // never redirected; hkrpg.dll rewrites every SDK URL to this server, so each
    // one needs a real answer. A JSON 404 here reads to the SDK as a failed
    // network job, and the game restarts login in a loop until it times out.

    @HttpCode(200)
    @Post('/account/ma-cn-session/app/exchange')
    async sessionExchange(@Body() body: any) {
        return this.httpServerService.sessionExchangeService(body);
    }

    @HttpCode(200)
    @Post('/account/ma-cn-session/app/getTokenByGameToken')
    async getTokenByGameToken(@Body() body: any) {
        return this.httpServerService.getTokenByGameTokenService(body);
    }

    @HttpCode(200)
    @Post('/data_abtest_api/config/experiment/list')
    async experimentList() {
        return this.httpServerService.experimentListService();
    }

    @Get('/:productName/mdk/agreement/api/getAgreementInfos')
    async agreementInfos() {
        return this.httpServerService.agreementInfosService();
    }

    @Get('/device-fp/api/getExtList')
    async deviceExtList() {
        return this.httpServerService.deviceExtListService();
    }

    @Get('/combo/box/api/config/:name')
    async comboBoxConfig() {
        return this.httpServerService.comboBoxConfigService();
    }

    // Telemetry uploaders. The reference proxy blocks these; keeping them out of
    // the 404 path stops the uploader from retrying for the whole session.
    @HttpCode(200)
    @Post(['/sdk/dataUpload', '/loginsdk/dataUpload', '/hkrpg/dataUpload', '/crash/dataUpload'])
    async dataUpload() {
        return this.httpServerService.dataUploadService();
    }

    /**
     * Catch-all. MUST stay last: Nest registers controller methods in
     * declaration order, so every route above wins and only genuinely unmodelled
     * paths reach here — where they get a neutral 200 and a loud warning instead
     * of a 404 that would restart an SDK job.
     */
    @All('*')
    async fallback(@Req() req: any) {
        return this.httpServerService.fallbackService(req.method, req.originalUrl ?? req.url);
    }
}
