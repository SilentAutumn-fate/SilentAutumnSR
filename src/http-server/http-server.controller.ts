import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { HttpServerService } from './http-server.service';

@Controller('')
export class HttpServerController {
    constructor(
        private httpServerService: HttpServerService
    ){}
    
    @Get("/query_dispatch")   
    async getDispatch() {
        const data = await this.httpServerService.getDispatchService()
        return data
    }
        
    @Get("/query_gateway")
    async getGateway(
        @Query("version") version: string,
        @Query("dispatch_seed") dispatchSeed: string,
    ) {
        return await this.httpServerService.getGatewayService(version, dispatchSeed);
    }

    // ---- 版本链管理（自动抓取/刷新 hotfix） ----

    /** 列出当前 version.json 中已知的版本 */
    @Get("/version/list")
    async listVersions() {
        return this.httpServerService.listVersionsService();
    }

    /**
     * 强制刷新某个版本的热更信息（无视已有条目，重新向官方抓取并落盘）
     * 例：/version/refresh?version=CNBETAWin4.5.51
     */
    @Get("/version/refresh")
    async refreshVersion(
        @Query("version") version: string,
        @Query("dispatch_seed") dispatchSeed: string,
    ) {
        return await this.httpServerService.refreshVersionService(version, dispatchSeed);
    }

    @Post("/:product_name/mdk/shield/api/login")
    async loginWithPassword() {
        return await this.httpServerService.loginWithAnyService();
    }

    @Post("/:product_name/mdk/shield/api/verify")
    async loginWithSessionToken() {
        return await this.httpServerService.loginWithAnyService();
    }

    @Post("/:product_name/combo/granter/login/v2/login")
    async granterLoginVerification() {
        return await this.httpServerService.granterLoginVerificationService();
    }

    @Post("/account/risky/api/check")
    async riskyApiCheck() {
        return await this.httpServerService.riskyApiCheckService();
    }
    // @Post("/account/ma-cn-passport/app/loginByPassword")
    // async loginWithPassport() {
    //     return await this.httpServerService.loginWithPassportService()
    // }


    // session login
    @Get("/:product_name/combo/granter/api/getConfig")
    async granterApiGetConfig() {
        return await this.httpServerService.granterApiGetConfigService();
    }
    @Get("/:product_name/mdk/shield/api/loadConfig")
    async shieldApiLoadConfig() {
        return await this.httpServerService.shieldApiLoadConfigService();
    }
    @Post("/:product_name/mdk/shield/api/verify")
    async shieldApiVerify(@Body() body: any) {
        return await this.httpServerService.shieldApiVerifyService(body);
    }
}
