import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs-extra';
import { join } from 'path';
import { readdirSync, statSync } from 'fs';
import { fetchVersionData } from './FetchHotfix/fetch';
import {
    fetchHotfixFromServer,
    selectHost,
    VersionEntry,
} from './FetchHotfix/versionChain';
import { JsonData } from './loadFreeData';
import { DataInGame } from './loadDataInGame';
import { GameResources } from './loadResources';
import { NetSession } from 'src/game-server/NetSession';
import { starrail } from 'src/proto/starrail';
import { CmdID } from 'src/proto/cmdId';


export interface VersionConfig {
    [key: string]: {
        asset_bundle_url: string;
        ex_resource_url: string;
        lua_url: string;
        lua_version: string;
        ifixUrl: string;
    };
}

@Injectable()
export class DataService {
    private dataVersion: VersionConfig;
    private dirFolderGame: string | null;
    private dataJson: JsonData
    private dataInGame: DataInGame
    private dataRecourse: GameResources
    private mainId: number
    private march7Id: number
    /** 抓取失败版本的负缓存（版本 -> 失败时间戳），避免反复打官方接口 */
    private versionFetchFailedAt: Map<string, number> = new Map();
    constructor() {
        // version input
        const filePathVersion = path.resolve(process.cwd(),'./src/data/version.json');
        const fileContentsVersion = fs.readFileSync(filePathVersion, 'utf-8');
        this.dataVersion = JSON.parse(fileContentsVersion) as VersionConfig;

        //Check exist folder game
        this.dirFolderGame = null;
        this.checkStarRailFolders()

        //Data Json
        this.dataJson = new JsonData();
        this.updateDataJson()

        //Data In-game
        this.dataInGame = new DataInGame();
        this.updateDataInGame()

        //load GameResources
        this.dataRecourse = new GameResources();
        this.updateDataResource()

        this.mainId = 8006
        this.march7Id = 1224
    }

    getVersionData(): VersionConfig {
        return this.dataVersion;
    }

    async getUpdateIdChar(id: number, player: NetSession) {
        let avatarType: starrail.MultiPathAvatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_None;
        switch (id) {
            case 8001:
                this.mainId = 8001
                avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_BoyWarriorType;
                break;
            case 8002:
                this.mainId = 8002
                avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_GirlWarriorType;
                break;
            case 8003:
                this.mainId = 8003
                avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_BoyKnightType;
                break;
            case 8004:
                this.mainId = 8004
                avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_GirlKnightType;
                break;
            case 8005:
                this.mainId = 8005
                avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_BoyShamanType;
                break;
            case 8006:
                this.mainId = 8006
                avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_GirlShamanType;
                break;
            case 1224:
                this.march7Id = 1224
                avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_Mar7ThRogueType;
                break;
            case 1001:
                this.march7Id = 1001
                avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_Mar7ThKnightType;
                break;
            default:
                avatarType = starrail.MultiPathAvatarType.MultiPathAvatarType_None;
                break;
        }
        const proto1 = new starrail.SetAvatarPathScRsp({
            retcode: 0,
            avatarId: avatarType
        });
        const bufferData1 = starrail.SetAvatarPathScRsp.encode(proto1).finish();
        await player.send(CmdID.CmdSetAvatarPathScRsp, bufferData1);
    }

    getDataJson() : JsonData{
        return this.dataJson;
    }

    getDataInGame() : DataInGame {
        return this.dataInGame;
    }
    getIdMain() {
        return this.mainId
    }
    getIdM7() {
        return this.march7Id
    }
    getDataResource() : GameResources {
        return this.dataRecourse;
    }

    checkStarRailFolders = () => {
        const baseDir = join(__dirname, '..', '..');
        const targetFolders = ['Star Rail', 'StarRail'].map(folder => folder.toLowerCase());
        const directories = readdirSync(baseDir).filter(file => {
            const fullPath = join(baseDir, file);
            return statSync(fullPath).isDirectory();
        });
    
        const foundFolders = directories.filter(directory => 
            targetFolders.some(target => directory.toLowerCase().startsWith(target))
        );
    
        if (foundFolders.length > 0) {
            this.dirFolderGame = join(__dirname, '..', '..', foundFolders[0]);
            console.log("Folder game detected: ", this.dirFolderGame)
        } 
    };

    saveVersion() {
        const filePathVersion = path.resolve(process.cwd(), './src/data/version.json');
        const updatedContentsVersion = JSON.stringify(this.dataVersion, null, 2);
        fs.writeFileSync(filePathVersion, updatedContentsVersion, 'utf-8');
    }

    /**
     * 自动补全缺失版本的 hotfix 信息（对齐 pearl-sr 的 dispatch 行为）。
     *
     * 路径 1：本地存在游戏目录时，用 BinaryVersion.bytes 反推（原有逻辑）
     * 路径 2：直接向官方 dispatch 查询 —— 没有客户端也能续版本链
     */
    async autoUpdateVersion(version: string, dispatchSeed = ''): Promise<boolean> {
        // ---- 路径 1：本地客户端 ----
        if (this.dirFolderGame) {
            const dataReturn = await fetchVersionData(this.dirFolderGame)
            if (dataReturn && dataReturn.asset_bundle_url) {
                this.dataVersion[version] = dataReturn;
                this.saveVersion()
                console.log(`[version] ${version} 已通过本地客户端解析写入 version.json`)
                return true
            }
        }

        // ---- 路径 2：官方 dispatch ----
        const result = await fetchHotfixFromServer(version, dispatchSeed)
        if (result.ok && result.entry) {
            this.dataVersion[version] = result.entry
            this.saveVersion()
            console.log(`[version] ${version} 已从官方 hotfix 写入 version.json`)
            return true
        }
        console.warn(`[version] ${version} 抓取失败: ${result.reason}`)
        return false
    }

    /**
     * 供 HTTP 层使用：确保版本存在；缺失则自动抓取并落盘。
     * 带 60s 负缓存，避免客户端反复请求不存在的版本时持续打官方接口。
     */
    async ensureVersion(version: string, dispatchSeed = ''): Promise<VersionEntry | null> {
        const existing = this.dataVersion[version]
        if (existing && existing.asset_bundle_url) return existing

        // 前缀不认识则不可能抓到，直接判定不支持
        if (!selectHost(version)) return null

        const COOLDOWN_MS = 60_000
        const lastFail = this.versionFetchFailedAt.get(version)
        if (lastFail && Date.now() - lastFail < COOLDOWN_MS) return null

        if (await this.autoUpdateVersion(version, dispatchSeed)) {
            this.versionFetchFailedAt.delete(version)
            return this.dataVersion[version]
        }

        this.versionFetchFailedAt.set(version, Date.now())
        return null
    }

    /** 列出版本链中已有的版本（便于排查客户端实际请求的版本号） */
    listVersions(): string[] {
        return Object.keys(this.dataVersion)
    }

    async updateDataJson() {
        const filePathJson = path.resolve(process.cwd(), './src/data/freesr-data.json');
        this.dataJson = await this.dataJson.loadJson(filePathJson)
    }

    async updateDataInGame() {
        const filePathJson = path.resolve(process.cwd(), './src/data/data-in-game.json');
        this.dataInGame = await this.dataInGame.loadJson(filePathJson)
    }

    async saveDataLineUp(lineups: { [key: string]: number }) {
        const filePathJson = path.resolve(process.cwd(), './src/data/data-in-game.json');
        this.dataInGame.lineups = lineups
        await this.dataInGame.saveJson(filePathJson)
    }

    async updateDataResource() {
        const filePathJson = path.resolve(process.cwd(), './src/data/resources.json');
        this.dataRecourse = await this.dataRecourse.loadJson(filePathJson)
    }
}
