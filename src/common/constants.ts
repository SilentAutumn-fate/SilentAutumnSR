/**
 * SilentAutumnSR — shared constants.
 *
 * Protocol: HSR 4.7 beta (rebuilt from pearl-sr, see docs/UPGRADE-4.7.md).
 * Target client: CNBETAWin4.5.54 was the last one verified end to end; the
 * version chain in src/data/version.json still has no 4.7 entry.
 *
 * Everything that depends on the machine the server runs on (ports, bind
 * addresses, the address the client is told to dial, the account identity,
 * data/log directories) comes from `settings.ts` — override it with
 * `server.config.json` or the `SASR_*` environment variables, never by editing
 * this file.
 */
import { resolveDir, resolvePublicHost, settings } from './settings';

/** HTTP side: dispatch / gateway / SDK. This is what the proxy forwards to. */
export const HTTP_PORT = settings.http.port;
export const HTTP_HOST = settings.http.bindHost;
/** Address written into the dispatch answer (the client's next hop). */
export const HTTP_PUBLIC_HOST = resolvePublicHost(settings.http.publicHost, settings.http.bindHost);

/** TCP game server the client is told to connect to via query_gateway. */
export const GAME_PORT = settings.game.port;
export const GAME_HOST = settings.game.bindHost;

/** Host advertised to the client in the GateServer response. */
export const GATEWAY_HOST = resolvePublicHost(settings.game.publicHost, settings.game.bindHost);

/** Displayed in dispatch / login / lineup data. */
export const SERVER_NAME = settings.serverName;

/** Default account/player identity handed to the client by the SDK stub. */
export const DEFAULT_UID = settings.account.uid;
export const DEFAULT_TOKEN = settings.account.token;
export const DEFAULT_NICKNAME = settings.account.nickname;

/** Static design data (version.json, freesr-data.json, resources/). */
export const DATA_DIR = resolveDir(settings.paths.data);
/** Runtime logs (server.log, requests.jsonl, protocol captures). */
export const LOGS_DIR = resolveDir(settings.paths.logs);

/** In-game player level / world level defaults. */
export const DEFAULT_PLAYER_LEVEL = 70;
export const DEFAULT_WORLD_LEVEL = 6;
export const DEFAULT_STAMINA = 240;
export const MAX_STAMINA = 240;

/** Default spawn point (Herta Space Station — matches KainSR's default plane). */
export const DEFAULT_PLANE_ID = 20313;
export const DEFAULT_FLOOR_ID = 20313001;
export const DEFAULT_ENTRY_ID = 2031301;

/** Protocol framing. */
export const PACKET_HEAD_MAGIC = 0x9d74c714;
export const PACKET_TAIL_MAGIC = 0xd7a152c8;
export const PACKET_HEADER_SIZE = 12;

/** Upper bound on a single packet body, mirrors pearl-sr's 0xFFFFFF guard. */
export const MAX_PACKET_BODY = 0xffffff;

/** Trailblazer (main character) and March 7th multipath id ranges. */
export const MC_AVATAR_IDS = [8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010];
export const M7_AVATAR_IDS = [1001, 1224];

/** Player entity id offset: entityId = avatarId + PLAYER_ENTITY_OFFSET. */
export const PLAYER_ENTITY_OFFSET = 100000;
