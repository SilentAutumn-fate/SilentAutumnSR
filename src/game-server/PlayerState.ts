import { starrail } from '../proto/starrail';
import {
    DEFAULT_NICKNAME,
    DEFAULT_PLAYER_LEVEL,
    DEFAULT_STAMINA,
    DEFAULT_UID,
    DEFAULT_WORLD_LEVEL,
    MAX_STAMINA,
} from '../common/constants';

/**
 * Mutable per-connection player state.
 *
 * Everything the client can observe about "who am I" lives here; anything that
 * must survive a restart is additionally written back through DataService.
 */
export class PlayerState {
    public uid: number = DEFAULT_UID;
    public nickname: string = DEFAULT_NICKNAME;
    public signature: string = '';
    public level: number = DEFAULT_PLAYER_LEVEL;
    public worldLevel: number = DEFAULT_WORLD_LEVEL;
    public stamina: number = DEFAULT_STAMINA;
    public maxStamina: number = MAX_STAMINA;
    public exp: number = 0;
    public birthday: number = 0;

    /** Currencies. */
    public mcoin: number = 99999990;
    public hcoin: number = 99999990;
    public scoin: number = 99999990;
    public talentPoints: number = 99999990;

    /** Currently selected multipath avatar id (Trailblazer / March 7th). */
    public mcPathId: number = 8006;
    public march7PathId: number = 1224;

    /** Profile selections. */
    public headIcon: number = 208001;
    public phoneTheme: number = 221000;
    public chatBubble: number = 220000;
    public phoneCase: number = 254000;
    public personalCard: number = 253000;
    public displayAvatarList: number[] = [];

    /** Login bookkeeping. */
    public loggedIn: boolean = false;
    public loginRandom: bigint | number = 0;
    public lastHeartbeat: number = 0;
    public clientPaused: boolean = false;

    /** Scene bookkeeping (authoritative copy is persisted by DataService). */
    public battleEntered: boolean = false;
    public currentChallengeId: number = 0;
    public challengePeakActive: boolean = false;
    public gridFightArchives: starrail.FAIHLAKPABN[] = [];
    /** Season 2 ranking track, accumulated once per settled run. */
    public gridFightSeasonExp: number = 0;
    public gridFightWeeklyScore: number = 0;
    /** Claimed ranks of the weekly score ladder (`GridFightScoreReward`). */
    public gridFightWeeklyRewardClaimed: number[] = [];
    /** Enabled meta talent nodes (`GridFightTalent` / `GridFightSeasonTalent`). */
    public gridFightPermanentTalents: number[] = [];
    public gridFightSeasonTalents: number[] = [];
    /** Tracked equipment ids for the recommended-build tracker (max 3). */
    public gridFightEquipTrack: number[] = [];

    /** Free-form bag contents handed to the client on CmdGetBagCsReq. */
    public itemList: number[] = [];

    /** Convert to the wire-level PlayerBasicInfo. */
    public toBasicInfo(): starrail.PlayerBasicInfo {
        return new starrail.PlayerBasicInfo({
            nickname: this.nickname,
            level: this.level,
            exp: this.exp,
            stamina: this.stamina,
            mcoin: this.mcoin,
            hcoin: this.hcoin,
            scoin: this.scoin,
            worldLevel: this.worldLevel,
        });
    }

    // ---- persistence -------------------------------------------------------

    /** The subset of this state that is written to data-in-game.json. */
    public toSave(): Record<string, any> {
        return {
            uid: this.uid,
            nickname: this.nickname,
            signature: this.signature,
            birthday: this.birthday,
            level: this.level,
            worldLevel: this.worldLevel,
            headIcon: this.headIcon,
            phoneTheme: this.phoneTheme,
            chatBubble: this.chatBubble,
            phoneCase: this.phoneCase,
            personalCard: this.personalCard,
            displayAvatarList: this.displayAvatarList,
            mcPathId: this.mcPathId,
            march7PathId: this.march7PathId,
            gridFightArchives: this.gridFightArchives,
            gridFightSeasonExp: this.gridFightSeasonExp,
            gridFightWeeklyScore: this.gridFightWeeklyScore,
            gridFightWeeklyRewardClaimed: this.gridFightWeeklyRewardClaimed,
            gridFightPermanentTalents: this.gridFightPermanentTalents,
            gridFightSeasonTalents: this.gridFightSeasonTalents,
            gridFightEquipTrack: this.gridFightEquipTrack,
        };
    }

    /** Apply a previously saved record; missing keys keep the defaults. */
    public applySave(save: Record<string, any> | undefined | null): void {
        if (!save || typeof save !== 'object') return;
        const take = <T>(key: string, fallback: T): T => {
            const value = save[key];
            return value === undefined || value === null ? fallback : (value as T);
        };

        this.uid = take('uid', this.uid);
        this.nickname = take('nickname', this.nickname);
        this.signature = take('signature', this.signature);
        this.birthday = take('birthday', this.birthday);
        this.level = take('level', this.level);
        this.worldLevel = take('worldLevel', this.worldLevel);
        this.headIcon = take('headIcon', this.headIcon);
        this.phoneTheme = take('phoneTheme', this.phoneTheme);
        this.chatBubble = take('chatBubble', this.chatBubble);
        this.phoneCase = take('phoneCase', this.phoneCase);
        this.personalCard = take('personalCard', this.personalCard);
        this.displayAvatarList = take('displayAvatarList', this.displayAvatarList);
        this.mcPathId = take('mcPathId', this.mcPathId);
        this.march7PathId = take('march7PathId', this.march7PathId);
        if (Array.isArray(save.gridFightArchives)) {
            this.gridFightArchives = save.gridFightArchives;
        }
        this.gridFightSeasonExp = take('gridFightSeasonExp', this.gridFightSeasonExp);
        this.gridFightWeeklyScore = take('gridFightWeeklyScore', this.gridFightWeeklyScore);
        this.gridFightWeeklyRewardClaimed = take('gridFightWeeklyRewardClaimed', this.gridFightWeeklyRewardClaimed);
        this.gridFightPermanentTalents = take('gridFightPermanentTalents', this.gridFightPermanentTalents);
        this.gridFightSeasonTalents = take('gridFightSeasonTalents', this.gridFightSeasonTalents);
        this.gridFightEquipTrack = take('gridFightEquipTrack', this.gridFightEquipTrack);
    }
}
