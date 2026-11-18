import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../../common/constants';
import { loadMaterialCatalog, MaterialCatalog } from '../../data/material-catalog';
import { loadTournRoomTable, TournRoomTable } from '../../data/rogue-tourn-rooms';
import { loadTournAreaTable, TournAreaTable } from '../../data/rogue-tourn-areas';
import { loadTournHandbook, TournHandbook } from '../../data/rogue-tourn-handbook';
import { loadTournTalents, TournTalentTable } from '../../data/rogue-tourn-talents';
import { ActivityScheduleTable, loadActivitySchedules } from '../../data/activity-schedules';
import { ContentPackageTable, loadContentPackages } from '../../data/content-packages';

/**
 * Static design-data (Excel table) access.
 *
 * The JSON files under src/data/resources are the extracted GDD tables the
 * client itself uses; they are loaded once at startup and indexed by primary
 * key so handlers can do O(1) lookups.
 *
 * These files are large (res.json alone is ~25 MB), so loading is done with a
 * synchronous read guarded by a single `load()` call from bootstrap rather than
 * lazily per request.
 */

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface SceneProp {
    groupId: number;
    instId: number;
    propState: number;
    propId: number;
    pos: Vec3;
    rot: Vec3;
}

export interface InteractConfig {
    InteractID: number;
    SrcState: number;
    TargetState: number;
}

export interface SceneMonster {
    groupId: number;
    instId: number;
    monsterId: number;
    eventId: number;
    pos: Vec3;
    rot: Vec3;
}

export interface SceneTeleport {
    anchorId: number;
    groupId: number;
    instId: number;
    teleportId: number;
    pos: Vec3;
    rot: Vec3;
}

export interface SceneConfig {
    planeID: number;
    entryID: number;
    props: SceneProp[];
    monsters: SceneMonster[];
    teleports: SceneTeleport[];
}

export interface MapEntrance {
    ID: number;
    EntranceType: string;
    PlaneID: number;
    FloorID: number;
    StartGroupID?: number;
    StartAnchorID?: number;
    BeginMainMissionList: number[];
    FinishMainMissionList: number[];
    FinishSubMissionList: number[];
}

export interface MazePlane {
    PlaneID: number;
    PlaneType: string;
    SubType: number;
    MazePoolType: number;
    WorldID: number;
    PlaneName?: { Hash: number; Hash64: number };
    StartFloorID: number;
    FloorIDList: number[];
}

export interface AvatarConfig {
    AvatarID: number;
    /** Set for "adventure player" avatars; equals AvatarID for the MC paths. */
    AdventurePlayerID?: number;
    AvatarName?: { Hash: number; Hash64: number };
    AvatarFullName?: { Hash: number; Hash64: number };
    Rarity: string;
    DamageType: string;
    AvatarBaseType: string;
    MaxPromotion: number;
    MaxRank: number;
    SPNeed?: number;
    DefaultAvatarHeadIconPath?: string;
    DefaultAvatarModelPath?: string;
    RankIDList: number[];
    SkillList: number[];
    Release?: boolean;
}

export interface AvatarSkillTreeConfig {
    AvatarID: number;
    PointID: number;
    Level: number;
    MaxLevel: number;
    DefaultUnlock: boolean;
    PointType: number;
    AnchorType?: string;
    PrePoint?: number;
    StatusAddList?: any[];
    LevelUpSkillID?: number[];
}

export interface StageConfig {
    Level: number;
    StageID: number;
    /** Monster ids grouped into waves. */
    MonsterList: number[][];
}

export interface StageInvasionConfig {
    StageID: number;
    InvasionID: number;
    MonsterInvasionList: number[];
}

export interface ChallengeConfig {
    ID: number;
    Name?: { Hash: number; Hash64: number };
    GroupID: number;
    /** Present on 802 of 823 rows; the challenge's floor within its group. */
    Floor?: number;
    MapEntranceID: number;
    MapEntranceID2: number;
    PreLevel: number;
    RewardID: number;
    DamageType1?: string;
    DamageType2?: string;
    ChallengeTargetID: number[];
    StageNum: number;
    MonsterID1: number;
    MonsterID2: number;
    ChallengeCountDown: number;
    MazeGroupID1: number;
    /** Present on 813 of 823 rows; the node-2 maze group. */
    MazeGroupID2?: number;
    ConfigList1?: number[];
    NpcMonsterIDList1?: number[];
    EventIDList1?: number[];
    ConfigList2?: number[];
    NpcMonsterIDList2?: number[];
    EventIDList2?: number[];
    MazeBuffID?: number;
}

export interface ChallengePeakConfig {
    ID: number;
    Title?: { Hash: number; Hash64: number };
    NormalTargetList?: number[];
    DamageType?: string;
    EventIDList?: number[];
    TagList?: number[];
    ProgressValueList?: number[];
    HPProgressValueList?: number[];
    NpcMonsterIDList?: number[];
    MapEntranceID: number;
    MazeGroupID: number;
}

export interface ChallengePeakGroupConfig {
    ID: number;
    Title?: { Hash: number; Hash64: number };
    RecommendID: number;
    ActivityModule?: string;
    PreLevelIDList?: number[];
    BossLevelID: number;
    RewardGroupID: number;
}

export interface ChallengePeakBossConfig {
    ID: number;
    HardTitle?: { Hash: number; Hash64: number };
    BuffList?: number[];
    ColorMedalTarget?: number[];
    HardTarget?: number[];
    HardEventIDList?: number[];
    HardTagList?: number[];
}

export interface ChallengeTierceConfig {
    ID: number;
    PreChallengeMazeID: number;
    MapEntranceID: number;
    MazeGroupID: number;
    ConfigList?: number[];
    NpcMonsterIDList?: number[];
    EventIDList?: number[];
    ChallengeTargetID: number[];
    ChallengeTierceTargetID: number[];
    RewardID: number;
}

export interface TutorialGuideConfig {
    GroupID: number;
    TutorialGuideIDList: number[];
    /** TutorialGuideType enum: the client keys its guide map by (GroupID, type). */
    TutorialType: number;
    CanReview: boolean;
    TutorialShowType: string;
    Order: number;
    RewardID: number;
}

export interface TutorialConfig {
    TutorialID: number;
    Priority: number;
    TutorialJsonPath?: string;
    TriggerParams?: string;
    FinishTriggerParams?: string;
}

export interface ActivityConfig {
    ActivityID: number;
    ResidentModuleList?: string[];
    ActivityModuleIDList?: number[];
}

export interface PlayerIconConfig {
    ID: number;
    ImagePath: string;
    AvatarID: number;
    Type: string;
    SortType: string;
    Sort: number;
}

export interface MainMissionConfig {
    MainMissionID: number;
    Type: string;
    WorldID: number;
    NextMainMissionList?: number[];
    ChapterID?: number;
}

export interface QuestConfig {
    QuestID: number;
    QuestType: string;
    QuestTitle?: { Hash: number; Hash64: number };
    UnlockType?: string;
    UnlockParamList?: number[];
    RewardID?: number;
    FinishWayID?: number;
    GotoID?: number;
}

/** Resolve the configured data directory's `resources/` (see settings.ts). */
export function resourcesDir(): string {
    return path.join(DATA_DIR, 'resources');
}

/** Anchor.json row: the named anchors of one map entry. */
export interface AnchorEntry {
    ID: number;
    pos: Vec3;
    rot: Vec3;
}

export interface AnchorConfig {
    entryID: number;
    anchor: AnchorEntry[];
}

/** One entry of FloorSavedValuesConfig's per-floor `SavedValues` list. */
export interface SavedValue {
    Name?: string;
    MaxValue?: number;
}

export interface FloorSavedValues {
    FloorID: number;
    SavedValues: SavedValue[];
}

/** BuffInfoConfig.json (.text_map_config): challenge buff group metadata. */
export interface BuffInfoConfig {
    GroupID: number;
    BuffList1: number[];
    BuffList2: number[];
}

export class ConfigManager {
    private dir = resourcesDir();
    public materialCatalog: MaterialCatalog | null = null;
    /** Divergent Universe rooms; null when the generated table is absent. */
    public tournRooms: TournRoomTable | null = null;
    /** Divergent Universe areas (official ExcelOutput export). */
    public tournAreas: TournAreaTable | null = null;
    /** Divergent Universe handbook id pools (official ExcelOutput export). */
    public tournHandbook: TournHandbook | null = null;
    /** Divergent Universe permanent talent tree (official ExcelOutput export). */
    public tournTalents: TournTalentTable | null = null;
    /** Activity schedule rows that expose the Divergent Universe activity panel. */
    public activitySchedules: ActivityScheduleTable | null = null;
    /** Story content packages reported as finished (official full-progress state). */
    public contentPackages: ContentPackageTable | null = null;

    public sceneConfig = new Map<number, SceneConfig>();
    public mapEntrance = new Map<number, MapEntrance>();
    public mazePlane = new Map<number, MazePlane>();
    public avatarConfig = new Map<number, AvatarConfig>();
    public avatarSkillTree = new Map<number, AvatarSkillTreeConfig>();
    public stageConfig = new Map<number, StageConfig>();
    public stageInvasionConfig = new Map<number, StageInvasionConfig>();
    public challengeConfig = new Map<number, ChallengeConfig>();
    public challengePeakConfig = new Map<number, ChallengePeakConfig>();
    public challengePeakGroupConfig = new Map<number, ChallengePeakGroupConfig>();
    public challengePeakBossConfig = new Map<number, ChallengePeakBossConfig>();
    public challengeTierceConfig = new Map<number, ChallengeTierceConfig>();
    public tutorialGuideConfig = new Map<number, TutorialGuideConfig>();
    public tutorialConfig = new Map<number, TutorialConfig>();
    public anchorConfig = new Map<number, AnchorConfig>();
    public activityConfig = new Map<number, ActivityConfig>();
    public playerIconConfig = new Map<number, PlayerIconConfig>();
    public mainMissionConfig = new Map<number, MainMissionConfig>();
    public questConfig = new Map<number, QuestConfig>();
    public savedValues = new Map<number, FloorSavedValues>();
    public interactConfig = new Map<number, InteractConfig>();
    /** BuffInfoConfig.json, keyed by GroupID. */
    public buffInfoConfig = new Map<number, BuffInfoConfig>();

    private loaded = false;

    /** Read every table. Safe to call once during bootstrap. */
    public load(): void {
        if (this.loaded) return;
        if (!fs.existsSync(this.dir)) {
            throw new Error(
                `[config] design data not found at ${this.dir}. ` +
                    'The src/data/resources/*.json tables are required.',
            );
        }

        this.indexInto(this.sceneConfig, this.read('res.json', 'scene_config'), (e) => e.entryID);
        this.indexInto(this.mapEntrance, this.read('MapEntrance.json', 'map_entrance_config'), (e) => e.ID);
        this.indexInto(this.mazePlane, this.read('MazePlane.json', 'maze_plane_config'), (e) => e.PlaneID);
        this.indexInto(this.avatarConfig, this.read('AvatarConfig.json', 'avatar_config'), (e) => e.AvatarID);
        this.indexInto(
            this.avatarSkillTree,
            this.read('AvatarSkillTreeConfig.json', 'avatar_skill_tree'),
            (e) => e.PointID,
        );
        this.indexInto(this.stageConfig, this.read('StageConfig.json', 'stage_config'), (e) => e.StageID);
        this.indexInto(
            this.stageInvasionConfig,
            this.read('StageInvasionConfig.json', 'stage_invasion_config'),
            (e) => e.StageID,
        );
        this.indexInto(
            this.challengeConfig,
            this.read('ChallengeMazeConfig.json', 'challenge_config'),
            (e) => e.ID,
        );
        this.indexInto(
            this.challengePeakConfig,
            this.read('ChallengePeakConfig.json', 'challenge_peak_config'),
            (e) => e.ID,
        );
        this.indexInto(
            this.challengePeakGroupConfig,
            this.read('ChallengePeakGroupConfig.json', 'challenge_peak_group_config'),
            (e) => e.ID,
        );
        this.indexInto(
            this.challengePeakBossConfig,
            this.read('ChallengePeakBossConfig.json', 'challenge_peak_boss_config'),
            (e) => e.ID,
        );
        this.indexInto(
            this.challengeTierceConfig,
            this.read('ChallengeMazeTierceConfig.json', 'challenge_tierce_config'),
            (e) => e.ID,
        );
        this.indexInto(
            this.tutorialGuideConfig,
            this.read('TutorialGuideGroup.json', 'tutorial_guide_config'),
            (e) => e.GroupID,
        );
        this.indexInto(
            this.tutorialConfig,
            this.read('TutorialData.json', 'tutorial_config'),
            (e) => e.TutorialID,
        );
        this.indexInto(this.anchorConfig, this.read('Anchor.json', 'anchor_config'), (e) => e.entryID);
        this.indexInto(this.activityConfig, this.read('ActivityConfig.json', 'activity_config'), (e) => e.ActivityID);
        this.indexInto(
            this.playerIconConfig,
            this.read('AvatarPlayerIcon.json', 'player_icon_config'),
            (e) => e.ID,
        );
        this.indexInto(
            this.mainMissionConfig,
            this.read('MainMission.json', 'main_mission_config'),
            (e) => e.MainMissionID,
        );
        this.indexInto(this.questConfig, this.read('QuestData.json', 'quest_config'), (e) => e.QuestID);
        this.indexInto(
            this.savedValues,
            this.read('FloorSavedValuesConfig.json', 'saved_values'),
            (e) => e.FloorID,
        );
        this.indexInto(
            this.buffInfoConfig,
            this.read('BuffInfoConfig.json', 'text_map_config'),
            (e) => e.GroupID,
        );

        this.materialCatalog = loadMaterialCatalog(this.dir);
        this.indexInto(this.interactConfig,
            this.read<InteractConfig>('InteractConfig.json', 'interact_config'), row => row.InteractID);
        if (!this.materialCatalog) {
            console.warn('[config] sandbox-materials.json missing: full-material inventory is unavailable; using legacy materials');
        }
        try {
            this.tournRooms = loadTournRoomTable(this.dir);
        } catch (error) {
            console.warn(`[config] rogue-tourn-rooms.json ignored: ${(error as Error).message}`);
            this.tournRooms = null;
        }
        if (!this.tournRooms) {
            console.warn('[config] rogue-tourn-rooms.json missing: Divergent Universe cannot start a scene');
        }
        try {
            this.tournAreas = loadTournAreaTable(this.dir);
        } catch (error) {
            console.warn(`[config] rogue-tourn-areas.json ignored: ${(error as Error).message}`);
            this.tournAreas = null;
        }
        if (!this.tournAreas) {
            console.warn('[config] rogue-tourn-areas.json missing: falling back to the reference layer plan');
        }
        try {
            this.tournHandbook = loadTournHandbook(this.dir);
        } catch (error) {
            console.warn(`[config] rogue-tourn-handbook.json ignored: ${(error as Error).message}`);
            this.tournHandbook = null;
        }
        if (!this.tournHandbook) {
            console.warn('[config] rogue-tourn-handbook.json missing: the handbook stays locked');
        }
        try {
            this.tournTalents = loadTournTalents(this.dir);
        } catch (error) {
            console.warn(`[config] rogue-tourn-talents.json ignored: ${(error as Error).message}`);
            this.tournTalents = null;
        }
        if (!this.tournTalents) {
            console.warn('[config] rogue-tourn-talents.json missing: the permanent talent tree stays empty');
        }
        try {
            this.activitySchedules = loadActivitySchedules(this.dir);
        } catch (error) {
            console.warn(`[config] activity-schedules.json ignored: ${(error as Error).message}`);
            this.activitySchedules = null;
        }
        if (!this.activitySchedules) {
            console.warn('[config] activity-schedules.json missing: the Divergent Universe activity panel stays closed');
        }
        try {
            this.contentPackages = loadContentPackages(this.dir);
        } catch (error) {
            console.warn(`[config] content-packages.json ignored: ${(error as Error).message}`);
            this.contentPackages = null;
        }
        if (!this.contentPackages) {
            console.warn('[config] content-packages.json missing: nav-map worlds stay content-locked');
        }
        this.loaded = true;
    }

    /** Skill-tree rows grouped by avatar, built alongside the flat index. */
    private skillTreeByAvatar = new Map<number, AvatarSkillTreeConfig[]>();

    public indexSkillTreeByAvatar(): void {
        this.skillTreeByAvatar.clear();
        for (const row of this.avatarSkillTree.values()) {
            const list = this.skillTreeByAvatar.get(row.AvatarID) ?? [];
            list.push(row);
            this.skillTreeByAvatar.set(row.AvatarID, list);
        }
    }

    private read<T>(file: string, key: string): T[] {
        const full = path.join(this.dir, file);
        if (!fs.existsSync(full)) {
            console.warn(`[config] missing ${file}; treating .${key} as empty`);
            return [];
        }
        const json = JSON.parse(fs.readFileSync(full, 'utf-8'));
        const value = json[key];
        if (!Array.isArray(value)) {
            console.warn(`[config] ${file} has no array .${key}`);
            return [];
        }
        return value as T[];
    }

    private indexInto<T>(map: Map<number, T>, rows: T[], keyOf: (row: T) => number): void {
        for (const row of rows) {
            const key = keyOf(row);
            if (key === undefined || key === null) continue;
            map.set(Number(key), row);
        }
    }

    // ---- lookups -----------------------------------------------------------

    public getScene(entryId: number): SceneConfig | undefined {
        return this.sceneConfig.get(entryId);
    }

    public getEntrance(id: number): MapEntrance | undefined {
        return this.mapEntrance.get(id);
    }

    public scenesOnFloor(floorId: number, preferredEntryId = 0): SceneConfig[] {
        if (!floorId) return [];
        const scenes = [...this.sceneConfig.values()].filter(
            (scene) => this.getEntrance(scene.entryID)?.FloorID === floorId,
        );
        const preferred = scenes.findIndex((scene) => scene.entryID === preferredEntryId);
        if (preferred > 0) scenes.unshift(...scenes.splice(preferred, 1));
        return scenes;
    }

    public findTeleport(floorId: number, entryId: number, teleportId: number): SceneTeleport | undefined {
        const teleports = this.scenesOnFloor(floorId, entryId).flatMap((scene) => scene.teleports ?? []);
        if (teleportId) return teleports.find((teleport) => teleport.teleportId === teleportId);
        const entrance = this.getEntrance(entryId);
        const spawn = entrance?.StartGroupID && entrance?.StartAnchorID
            ? teleports.find((teleport) => teleport.groupId === entrance.StartGroupID &&
                teleport.anchorId === entrance.StartAnchorID)
            : undefined;
        return spawn ?? teleports.find((teleport) => teleport.teleportId === entryId) ?? teleports[0];
    }

    public getPlane(planeId: number): MazePlane | undefined {
        return this.mazePlane.get(planeId);
    }

    /** Plane that owns a given floor, if the entrance table is incomplete. */
    public getPlaneByFloor(floorId: number): MazePlane | undefined {
        for (const plane of this.mazePlane.values()) {
            if (plane.StartFloorID === floorId) return plane;
            if (plane.FloorIDList && plane.FloorIDList.includes(floorId)) return plane;
        }
        return undefined;
    }

    public getAvatar(id: number): AvatarConfig | undefined {
        return this.avatarConfig.get(id);
    }

    public getStage(stageId: number): StageConfig | undefined {
        return this.stageConfig.get(stageId);
    }

    public getChallenge(id: number): ChallengeConfig | undefined {
        return this.challengeConfig.get(id);
    }

    public getChallengePeak(id: number): ChallengePeakConfig | undefined {
        return this.challengePeakConfig.get(id);
    }

    public getChallengeTierce(id: number): ChallengeTierceConfig | undefined {
        return this.challengeTierceConfig.get(id);
    }

    /** Skill-tree rows belonging to one avatar. */
    public skillTreeOf(avatarId: number): AvatarSkillTreeConfig[] {
        if (this.skillTreeByAvatar.size === 0) this.indexSkillTreeByAvatar();
        return this.skillTreeByAvatar.get(avatarId) ?? [];
    }

    /** Buff group metadata used by `/id <group> ... buff ...`. */
    public getBuffInfo(groupId: number): BuffInfoConfig | undefined {
        return this.buffInfoConfig.get(groupId);
    }

    /** Every challenge in a group, ordered by id. */
    public challengesInGroup(groupId: number): ChallengeConfig[] {
        return [...this.challengeConfig.values()]
            .filter((c) => c.GroupID === groupId)
            .sort((a, b) => a.ID - b.ID);
    }
}

/** Process-wide singleton; bootstrap calls load(). */
export const configManager = new ConfigManager();
