-- Prefer the server's private chat when the normal chat entry is opened.
-- Both the friend and Pam tabs remain available for manual selection.
local fixVersion = 2
if _G.__sasr_chat_entry_fix == fixVersion then return end
local ok, err = pcall(function()
    local modules = CS.RPG.Client.GlobalVars.s_ModuleManager
    local function hasCommandContact()
        if not modules.FriendModule:IsFriend(2000) then return false end
        local contacts = modules.ChatModule:GetAllContacts()
        for i = 0, contacts.Count - 1 do
            local contact = contacts[i]
            if contact.IsPlayer and contact.Identity.ID == 2000 then
                -- Earlier server history omitted the mandatory sender identity.
                -- Remove only those invalid entries in the synthetic server contact.
                local history = contact:GetHistoryMessage()
                for index = history.Count - 1, 0, -1 do
                    if not history[index].SenderIdentity then contact:RemoveMessage(index) end
                end
                return true
            end
        end
        return false
    end
    local pageClass = require('Ui.Friend.FriendChat.FriendChatPage')
    local initTabs = pageClass._init_tab_uid
    if type(initTabs) ~= 'function' then error('Chat tab initializer unavailable') end
    pageClass._init_tab_uid = function(self, ...)
        local result = initTabs(self, ...)
        if hasCommandContact() and self._friend_tab_uid then
            self._default_selected_tab = self._friend_tab_uid
        end
        return result
    end
    _G.__sasr_chat_entry_fix = fixVersion
    -- Apply once to a page already open when the update is received.
    local controller = CS.RPG.Client.GlobalVars.s_UIManager:GetPageByRootName('FriendChatPage(Clone)')
    if controller and hasCommandContact() then
        local page = controller.LuaTable
        if page and page._friend_tab_uid and page._tab_control then
            page._default_selected_tab = page._friend_tab_uid
            page._tab_control:click_item_by_uid(page._friend_tab_uid)
        end
    end
    CS.UnityEngine.Debug.Log('[SASRCHATFIX] private chat default installed')
end)
if not ok then CS.UnityEngine.Debug.Log('[SASRCHATFIX] '..tostring(err)) end
