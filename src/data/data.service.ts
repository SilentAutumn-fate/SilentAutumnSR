import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AvatarJson, JsonData, resolveDataPath } from './loadFreeData';
import { DataInGame, SceneJson } from './loadDataInGame';
import { ConfigManager } from '../game-server/manager/config_mgr';
import {
    DEFAULT_ENTRY_ID,
    DEFAULT_FLOOR_ID,
    DEFAULT_NICKNAME,
    DEFAULT_PLANE_ID,
    M7_AVATAR_IDS,
    MC_AVATAR_IDS,
} from '../common/constants';

import type { VersionEntry } from './hotfix-sources';

/**
 * The entry shape lives in hotfix-sources.ts so the resolver, the CLI, and the
 * tests share one definition; re-exported here for existing callers.
 */
export type { VersionEntry };

export type VersionConfig = { [version: string]: VersionEntry };

/**
 * Owns everything the server reads off disk:
 *   src/data/version.json         - version chain served by query_gateway
 *   src/data/freesr-data.json     - freesr account profile (lightcones/relics/avatars/battle)
 *   src/data/data-in-game.json    - persisted world state (lineups/position/scene)
 *   src/data/resources/*.json     - static design data, via ConfigManager
 *
 * Paths are resolved from process.cwd() so the server can be started from the
 * project root without copying data files into dist/.
 */
@Injectable()
export class DataService {
    private readonly logger = new Logger(DataService.name);

    private dataVersion: VersionConfig = {};
    private dataJson: JsonData = new JsonData();
    private dataInGame: DataInGame = new DataInGame();

    /** Primary (Trailblazer) and March 7th multipath selections. */
    private mainId = 8006;
    private march7Id = 1224;

    constructor(public readonly config: ConfigManager) {}

    // ---- bootstrap ---------------------------------------------------------

    public loadAll(): void {
        this.loadVersion();
        this.config.load();
        this.loadFreeData();
        this.loadDataInGame();
        this.logger.log(
            `data loaded: versions=${Object.keys(this.dataVersion).length} ` +
                `avatars=${this.dataJson.avatarIds().length} ` +
                `relics=${this.dataJson.relics.length} ` +
                `lightcones=${this.dataJson.lightcones.length} ` +
                `scenes=${this.config.sceneConfig.size}`,
        );
    }

    private loadVersion(): void {
        const file = resolveDataPath('version.json');
        if (!fs.existsSync(file)) {
            this.logger.warn(`version.json not found at ${file}`);
            this.dataVersion = {};
            return;
        }
        this.dataVersion = JSON.parse(fs.readFileSync(file, 'utf-8'));
    }

    private loadFreeData(): void {
        const file = resolveDataPath('freesr-data.json');
        if (!fs.existsSync(file)) {
            this.logger.warn(`freesr-data.json not found at ${file}`);
        } else {
            this.dataJson.loadFromObject(JSON.parse(fs.readFileSync(file, 'utf-8')));
        }

        // The design table also contains NPC, story and trial variants. Only
        // avatars whose adventure ID is their own can be added to the roster.
        for (const avatar of this.config.avatarConfig.values()) {
            const id = avatar.AvatarID;
            if (avatar.Release !== true || avatar.AdventurePlayerID !== id ||
                (id >= 8001 && !MC_AVATAR_IDS.includes(id)) || this.dataJson.avatar(id)) {
                continue;
            }
            const family = MC_AVATAR_IDS.includes(id)
                ? MC_AVATAR_IDS.filter((pathId) => pathId % 2 === id % 2)
                : M7_AVATAR_IDS.includes(id) ? M7_AVATAR_IDS : [];
            const siblings = family.map((pathId) => this.dataJson.avatar(pathId));
            const skills = Object.fromEntries(
                this.config.skillTreeOf(id)
                    .filter((point) => point.DefaultUnlock && point.Level === 1)
                    .map((point) => [point.PointID, 1]),
            );
            this.dataJson.avatars[id] = AvatarJson.fromJson({
                avatar_id: id,
                level: Math.max(1, ...siblings.map((path) => path?.level ?? 1)),
                promotion: Math.max(0, ...siblings.map((path) => path?.promotion ?? 0)),
                data: { skills },
            });
        }
    }

    private loadDataInGame(): void {
        const file = resolveDataPath('data-in-game.json');
        if (!fs.existsSync(file)) {
            // A fresh checkout has no save file (it is a mutable runtime file and
            // is git-ignored). Without a starting lineup the scene would have no
            // actor entities and no leader, and the client could not spawn, so
            // seed a valid one derived from the profile and write it out.
            this.logger.log(`no save file yet at ${file}; creating a default one`);
            this.dataInGame = this.seedDataInGame();
            void this.saveDataInGame();
            return;
        }
        this.dataInGame = DataInGame.fromJson(JSON.parse(fs.readFileSync(file, 'utf-8')));
        // Restore the persisted multipath selection so lineups resolve correctly
        // from the very first request after a restart.
        const { mcPathId, march7PathId } = this.dataInGame.player;
        if (mcPathId && MC_AVATAR_IDS.includes(mcPathId) && this.dataJson.avatar(mcPathId)) {
            this.mainId = mcPathId;
        }
        if (march7PathId && M7_AVATAR_IDS.includes(march7PathId) && this.dataJson.avatar(march7PathId)) {
            this.march7Id = march7PathId;
        }
    }

    /**
     * A minimal, valid starting save: the default free-roam scene plus a party
     * built from whatever avatars the profile owns (Trailblazer leading).
     */
    private seedDataInGame(): DataInGame {
        const save = new DataInGame();
        save.scene = new SceneJson(DEFAULT_PLANE_ID, DEFAULT_FLOOR_ID, DEFAULT_ENTRY_ID);
        save.player.nickname = DEFAULT_NICKNAME;

        const ids = this.dataJson.avatarIds();
        if (ids.length > 0) {
            // The Trailblazer is the highest multipath id in the profile; using it
            // as the leader exercises the path resolution in the lineups.
            const leader = this.dataJson.avatar(this.mainId) ? this.mainId : ids[0];
            const party = [leader, ...ids.filter((id) =>
                id !== leader && !MC_AVATAR_IDS.includes(id) && id !== 1224,
            ).slice(0, 3)];
            save.lineups = Object.fromEntries(party.map((id, slot) => [String(slot), id]));
        } else {
            this.logger.warn('the freesr profile owns no avatars; the party will be empty');
        }

        save.player.mcPathId = this.mainId;
        save.player.march7PathId = this.march7Id;
        return save;
    }

    // ---- versions ----------------------------------------------------------

    public getVersionData(): VersionConfig {
        return this.dataVersion;
    }

    public hasVersion(version: string): boolean {
        return !!this.dataVersion[version];
    }

    /** Persist version.json after a successful hotfix lookup. */
    public saveVersion(): void {
        const file = resolveDataPath('version.json');
        try {
            fs.writeFileSync(file, JSON.stringify(this.dataVersion, null, 2) + '\n', 'utf-8');
        } catch (err: any) {
            this.logger.error(`failed to persist version.json: ${err?.message ?? err}`);
        }
    }

    // ---- freesr profile ----------------------------------------------------

    public getDataJson(): JsonData {
        return this.dataJson;
    }

    /** Re-read freesr-data.json from disk (in-game `/update`). */
    public async updateDataJson(): Promise<void> {
        this.dataJson = new JsonData();
        this.loadFreeData();
    }

    public getIdMain(): number {
        return this.mainId;
    }

    public getIdM7(): number {
        return this.march7Id;
    }

    public setMainId(id: number): void {
        // Guard the multipath selection: a malformed SetAvatarPathCsReq (or a
        // future one carrying a path id we do not know) must not blank it out,
        // because every lineup then fails to resolve the Trailblazer.
        if (!MC_AVATAR_IDS.includes(id)) {
            this.logger.warn(`ignoring invalid Trailblazer path id ${id}`);
            return;
        }
        this.mainId = id;
        this.dataInGame.player = { ...this.dataInGame.player, mcPathId: id };
    }

    public setMarch7Id(id: number): void {
        if (!M7_AVATAR_IDS.includes(id)) {
            this.logger.warn(`ignoring invalid March 7th path id ${id}`);
            return;
        }
        this.march7Id = id;
        this.dataInGame.player = { ...this.dataInGame.player, march7PathId: id };
    }

    // ---- persisted world state --------------------------------------------

    public getDataInGame(): DataInGame {
        return this.dataInGame;
    }

    public async updateDataInGame(): Promise<void> {
        this.dataInGame = new DataInGame();
        this.loadDataInGame();
    }

    /**
     * Supplies the current connection's PlayerState snapshot at save time.
     *
     * Handlers call `saveDataInGame()` from every setter, so the account block
     * has to be harvested here rather than passed in by each caller. Only one
     * game connection is served at a time in practice, so a single provider is
     * enough; the most recently connected session wins.
     */
    private playerSaveProvider: (() => Record<string, any>) | null = null;

    public registerPlayerSaveProvider(provider: () => Record<string, any>): void {
        this.playerSaveProvider = provider;
    }

    private saveChain: Promise<void> = Promise.resolve();

    /**
     * Persist data-in-game.json. Writes are serialised so a burst of
     * SceneEntityMove packets cannot interleave and corrupt the file.
     */
    public saveDataInGame(): Promise<void> {
        if (this.playerSaveProvider) {
            try {
                this.dataInGame.player = {
                    ...this.dataInGame.player,
                    ...this.playerSaveProvider(),
                };
            } catch (err: any) {
                this.logger.warn(`could not snapshot player state: ${err?.message ?? err}`);
            }
        }
        // Re-read path ids so a reload after a multipath switch is consistent.
        this.dataInGame.player.mcPathId = this.mainId;
        this.dataInGame.player.march7PathId = this.march7Id;

        const snapshot = JSON.stringify(this.dataInGame.toJson(), null, 2);
        const file = resolveDataPath('data-in-game.json');
        this.saveChain = this.saveChain
            .then(async () => {
                await fs.promises.mkdir(path.dirname(file), { recursive: true });
                await fs.promises.writeFile(file, snapshot, 'utf-8');
            })
            .catch((err) => {
                this.logger.error(`failed to persist data-in-game.json: ${err?.message ?? err}`);
            });
        return this.saveChain;
    }

    public async saveLineups(lineups: { [key: string]: number }): Promise<void> {
        this.dataInGame.lineups = lineups;
        await this.saveDataInGame();
    }
}
