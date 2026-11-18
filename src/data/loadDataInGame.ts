import * as fs from 'fs';
import * as path from 'path';
import type { starrail } from '../proto/starrail';

/**
 * Persisted per-account world state: the "save file".
 *
 * Format is deliberately identical to KainSR's data-in-game.json so an existing
 * deployment's save keeps working (and so the file stays hand-editable):
 *
 *   {
 *     "lineups":  { "<slot>": <avatar_id> },
 *     "position": { "x": …, "y": …, "z": …, "rotY": … },
 *     "scene":    { "plane_id": …, "floor_id": …, "entry_id": … }
 *   }
 *
 * Newer fields are additive with defaults, so a file written by an older build
 * still loads.
 */
export class PositionJson {
    constructor(
        public x: number,
        public y: number,
        public z: number,
        public rotY: number = 0,
    ) {}

    public isEmpty(): boolean {
        return this.x === 0 && this.y === 0 && this.z === 0;
    }

    public toMotion(): starrail.MotionInfo {
        return {
            pos: { x: this.x, y: this.y, z: this.z },
            rot: { x: 0, y: this.rotY, z: 0 },
        };
    }

    public toVector(): starrail.Vector {
        return { x: this.x, y: this.y, z: this.z };
    }

    public static fromJson(json: any): PositionJson {
        return new PositionJson(json?.x ?? 0, json?.y ?? 0, json?.z ?? 0, json?.rotY ?? 0);
    }
}

export class SceneJson {
    constructor(
        public plane_id: number,
        public floor_id: number,
        public entry_id: number,
    ) {}

    public static fromJson(json: any): SceneJson {
        return new SceneJson(json?.plane_id ?? 0, json?.floor_id ?? 0, json?.entry_id ?? 0);
    }
}

/**
 * Account-level fields that survive a restart.
 *
 * pearl-sr persists nothing at all, and KainSR's data-in-game.json only held
 * lineups/position/scene — so every cosmetic choice made through
 * SetSignature / SetHeadIcon / SetAvatarPath was lost on reconnect. This block
 * is additive: a file written by KainSR still loads, it simply has no `player`.
 */
export interface PlayerSave {
    uid?: number;
    nickname?: string;
    signature?: string;
    birthday?: number;
    level?: number;
    worldLevel?: number;
    headIcon?: number;
    phoneTheme?: number;
    chatBubble?: number;
    phoneCase?: number;
    personalCard?: number;
    displayAvatarList?: number[];
    mcPathId?: number;
    march7PathId?: number;
    avatarSkinIds?: Record<number, number>;
    outfitIds?: number[];
    pamSkinId?: number;
}

export interface SavedLineup {
    slots: Record<string, number>;
    name: string;
    leaderSlot: number;
}

export class DataInGame {
    public propStates: Record<string, number> = {};
    public lineups: { [key: string]: number } = {};
    public lineupTeams: Record<string, SavedLineup> = {};
    public currentLineupIndex = 0;
    public position: PositionJson = new PositionJson(0, 0, 0, 0);
    public scene: SceneJson = new SceneJson(0, 0, 0);
    /** Account fields that should survive a restart; see PlayerSave. */
    public player: PlayerSave = {};

    public static fromJson(json: any): DataInGame {
        const out = new DataInGame();
        out.lineups = json?.lineups ?? {};
        out.currentLineupIndex = Number.isInteger(json?.currentLineupIndex) && json.currentLineupIndex >= 0
            && json.currentLineupIndex < 100 ? json.currentLineupIndex : 0;
        for (const [index, team] of Object.entries(json?.lineupTeams ?? {}) as [string, any][]) {
            if (!/^\d+$/.test(index) || Number(index) >= 100 || !team?.slots) continue;
            out.lineupTeams[index] = { slots: { ...team.slots }, name: String(team.name ?? ''),
                leaderSlot: Number.isInteger(team.leaderSlot) ? team.leaderSlot : 0 };
        }
        if (out.lineupTeams[out.currentLineupIndex]) out.lineups = { ...out.lineupTeams[out.currentLineupIndex].slots };
        out.position = PositionJson.fromJson(json?.position);
        out.scene = SceneJson.fromJson(json?.scene);
        out.player = json?.player ?? {};
        for (const [key, state] of Object.entries(json?.propStates ?? {})) {
            if (/^\d+:\d+:\d+$/.test(key) && Number.isInteger(state) && Number(state) >= 0 && Number(state) <= 109) {
                out.propStates[key] = Number(state);
            }
        }
        return out;
    }

    public toJson(): any {
        return {
            lineups: this.lineups,
            currentLineupIndex: this.currentLineupIndex,
            lineupTeams: { ...this.lineupTeams, [this.currentLineupIndex]: {
                ...this.team(this.currentLineupIndex), slots: { ...this.lineups },
            } },
            position: {
                x: this.position.x,
                y: this.position.y,
                z: this.position.z,
                rotY: this.position.rotY,
            },
            scene: {
                plane_id: this.scene.plane_id,
                floor_id: this.scene.floor_id,
                entry_id: this.scene.entry_id,
            },
            player: this.player,
            propStates: this.propStates,
        };
    }

    public async loadJson(filePath: string): Promise<DataInGame> {
        if (!fs.existsSync(filePath)) return this;
        const fileContent = await fs.promises.readFile(filePath, 'utf-8');
        return DataInGame.fromJson(JSON.parse(fileContent));
    }

    public async saveJson(filePath: string): Promise<void> {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, JSON.stringify(this.toJson(), null, 2), 'utf-8');
    }

    /** Lineup slots as an ordered [slot, avatarId] list, skipping empty slots. */
    public team(index = this.currentLineupIndex): SavedLineup {
        const existing = this.lineupTeams[index];
        return { slots: index === this.currentLineupIndex ? { ...this.lineups } : { ...(existing?.slots ?? {}) },
            name: existing?.name ?? '', leaderSlot: existing?.leaderSlot ?? 0 };
    }

    public setTeam(index: number, team: SavedLineup): void {
        this.lineupTeams[index] = { ...team, slots: { ...team.slots } };
        if (index === this.currentLineupIndex) this.lineups = { ...team.slots };
    }

    public switchTeam(index: number): void {
        this.setTeam(this.currentLineupIndex, this.team());
        this.lineups = { ...(this.lineupTeams[index]?.slots ?? {}) };
        this.currentLineupIndex = index;
    }

    public lineupEntries(index = this.currentLineupIndex): [number, number][] {
        return Object.entries(this.team(index).slots)
            .map(([slot, id]) => [Number(slot), Number(id)] as [number, number])
            .filter(([, id]) => !!id)
            .sort((a, b) => a[0] - b[0]);
    }
}
