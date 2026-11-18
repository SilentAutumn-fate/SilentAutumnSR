import * as fs from 'fs';
import * as path from 'path';
import { CmdID } from '../../proto/cmdId';
import type { NetSession } from '../NetSession';
import type { starrail } from '../../proto/starrail';
import type { HandlerEntry } from './types';

/**
 * Lua snippet the client executes on its first heartbeat.
 *
 * The reference server uses this channel to relabel the title screen's
 * bottom-left hint line and its version line; it ships the script as a base64
 * literal inside its binary, this port keeps it as readable text. The strings
 * below are SilentAutumnSR's own, so a player never sees the reference's name.
 */
const WELCOME_LUA = `local function setTextComponent(path, newText)
    local obj = CS.UnityEngine.GameObject.Find(path)
    if obj then
        local textComponent = obj:GetComponentInChildren(typeof(CS.RPG.Client.LocalizedText))
        if textComponent then
            textComponent.text = newText
        end
    end
end

setTextComponent("UIRoot/AboveDialog/BetaHintDialog(Clone)", "<color=#21BCEB>SilentAutumnSR - A free sever</color>")
setTextComponent("VersionText", "<color=#21BCEB>Feel free to open an issue on my GitHub！</color>")
`;

/** Version stamped on the download payload; the client ignores the value. */
const DOWNLOAD_DATA_VERSION = 52;

/**
 * Diagnostic snippet appended to the title-screen Lua when `SASR_DIAG_ACTIVITY=1`
 * is set. It records resident panel lookups and the Currency Wars guide click
 * in Player.log. The click still runs through the original client handlers.
 */
const ACTIVITY_DIAG_LUA = `
local function log(msg)
    CS.UnityEngine.Debug.LogError("[SASRDIAG] " .. tostring(msg))
end
local function probe(name, fn)
    local ok, value = pcall(fn)
    if ok then
        log(name .. "=" .. tostring(value))
    else
        log(name .. " ERR " .. tostring(value))
    end
end
local function trace_page(path, label)
    local page = require(path)
    if page._sasr_grid_fight_page_trace then return true end
    local found = {}
    for _, name in ipairs({"_on_load", "_on_enter", "_on_added", "_on_exit", "_on_unload", "_on_btn_exit"}) do
        local original = page[name]
        if type(original) == "function" then
            local method = name
            found[#found + 1] = method
            page[method] = function(self, ...)
                log(label .. " " .. method)
                if method == "_on_exit" or method == "_on_unload" or method == "_on_btn_exit" then
                    probe(label .. " caller", function() return debug.traceback("", 2) end)
                end
                return original(self, ...)
            end
        end
    end
    page._sasr_grid_fight_page_trace = true
    return table.concat(found, ",")
end
probe("grid_fight_legacy_page_trace", function()
    return trace_page("Ui.GridFight.Entrance.GridFightEntrancePage", "grid_fight_legacy_page")
end)
probe("grid_fight_s2_page_trace", function()
    return trace_page("Ui.GridFight.Entrance.S2.GridFightS2EntrancePage", "grid_fight_s2_page")
end)
local ok, err = pcall(function()
    local mm = CS.RPG.Client.GlobalVars.s_ModuleManager
    local am = mm.ActivityModule
    probe("panel_60018_0", function() return am:GetPanelData(60018, 0) end)
    probe("panel_60018_60022", function() return am:GetPanelData(60018, 60022) end)
    probe("panel_60018_60024", function() return am:GetPanelData(60018, 60024) end)
    probe("resident_count", function() return am:GetAllRogueResidentPanelData().Count end)
    probe("tourn_module", function() return mm.RogueTournModule ~= nil end)
    local tab = require("Ui.DailyMission.Rogue.GridFight.HandbookRogueGridFightTabItem")
    local behavior = require("Ui.DailyMission.Rogue.HandbookRogueGotoBtnBehaviour")
    if tab._sasr_grid_fight_trace then return end
    local original_click = tab._on_click_go
    local original_go = behavior.on_btn_go
    if type(original_click) ~= "function" or type(original_go) ~= "function" then
        log("grid_fight: guide handlers unavailable")
        return
    end
    function tab:_on_click_go(...)
        log("grid_fight: guide click")
        local modules = CS.RPG.Client.GlobalVars.s_ModuleManager
        probe("grid_fight_activity", function()
            return modules.ActivityModule:FindCurrentGridFightActivityIDForRewardCount()
        end)
        probe("grid_fight_launcher_transfer_allowed", function()
            return CS.RPG.Client.GridFightUtils.CanTransferToLauncher()
        end)
        return original_click(self, ...)
    end
    function behavior:on_btn_go(...)
        probe("guide_panel_state", function()
            return self._panel_data and self._panel_data.StateData.CurState
        end)
        probe("guide_panel_content", function()
            return self._panel_data and self._panel_data.ContentID
        end)
        return original_go(self, ...)
    end
    tab._sasr_grid_fight_trace = true
    log("grid_fight: click trace installed")
end)
if not ok then log("outer error " .. tostring(err)) end
`;

/**
 * Diagnostic snippet on disk, loaded on every heartbeat.
 *
 * Editing `SASR_DIAG_LUA` (or `runtime/client/activity-diag.lua`) is enough to reach a running client: the file
 * content is hashed into the payload version and the snippet carries the hash as
 * `SASR_DIAG_TAG`, so a changed file re-executes on the next heartbeat instead of
 * being skipped as cached. The compiled-in ACTIVITY_DIAG_LUA stays as fallback.
 */
const DIAG_LUA_FILE =
    process.env.SASR_DIAG_LUA ??
    // Resolved from this file, not from the working directory: the server is
    // started from the repository root by run.bat, but tests and external
    // launchers may start it from anywhere.
    path.join(path.resolve(__dirname, '..', '..', '..'), 'runtime', 'client', 'activity-diag.lua');

const CHAT_ENTRY_LUA_FILE = path.resolve('runtime/client/chat-entry.lua');

function chatEntryPayload(): string {
    try {
        const script = fs.readFileSync(CHAT_ENTRY_LUA_FILE, 'utf8').replace(/^\uFEFF/, '');
        // Keep an idempotence return local to this feature, not the whole heartbeat chunk.
        return `\ndo\nlocal function applyChatEntryFix()\n${script}\nend\napplyChatEntryFix()\nend\n`;
    } catch {
        return '';
    }
}

function tagOf(text: string): number {
    let hash = 5381;
    for (let index = 0; index < text.length; index += 1) {
        hash = (((hash * 33) >>> 0) ^ text.charCodeAt(index)) >>> 0;
    }
    return hash;
}

function diagPayload(): { lua: string; version: number } {
    try {
        // The script is appended to an existing Lua chunk. A Windows editor's
        // UTF-8 BOM would appear mid-chunk and fail to parse.
        const text = fs.readFileSync(DIAG_LUA_FILE, 'utf8').replace(/^\uFEFF/, '');
        const tag = tagOf(text);
        return {
            lua: `local SASR_DIAG_TAG = ${tag}\n${text}\n`,
            version: DOWNLOAD_DATA_VERSION + 3 + (tag % 1000),
        };
    } catch {
        return { lua: ACTIVITY_DIAG_LUA, version: DOWNLOAD_DATA_VERSION + 3 };
    }
}

/** Heartbeat. Also the vehicle for the title-screen text above. */
export async function onPlayerHeartBeatCsReq(
    req: starrail.PlayerHeartBeatCsReq,
    session: NetSession,
): Promise<void> {
    const now = Date.now();
    session.state.lastHeartbeat = now;
    const diag =
        process.env.SASR_DIAG_ACTIVITY === '1' && fs.existsSync(DIAG_LUA_FILE);
    const payload = diag ? diagPayload() : null;
    const chatEntry = chatEntryPayload();
    const lua = `${WELCOME_LUA}\n${chatEntry}\n${payload?.lua ?? ''}`;

    await session.sendRsp(CmdID.CmdPlayerHeartBeatScRsp, {
        retcode: 0,
        clientTimeMs: req?.clientTimeMs ?? 0,
        serverTimeMs: now,
        downloadData: {
            // A different version makes the client re-run the script instead of
            // skipping it as cached.
            version: DOWNLOAD_DATA_VERSION + 1000 + (tagOf(lua) % 1000000),
            time: now,
            data: Buffer.from(lua, 'utf-8'),
        },
    });
}

export const handlers: HandlerEntry[] = [
    { cmdId: CmdID.CmdPlayerHeartBeatCsReq, action: onPlayerHeartBeatCsReq },
];
