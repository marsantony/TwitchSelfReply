/**
 * 寫入 log textarea，新訊息會在最前面。
 * 不自動加時間戳——chat-style 訊息會自帶 tmi-sent-ts，
 * 其他事件由呼叫端決定要不要加 marker。
 * @param {string} message
 */
function addLog(message) {
    const logEl = document.getElementById('log');
    if (!logEl) return;
    logEl.value = message + '\r\n' + logEl.value;
}

/**
 * 組使用者名稱顯示
 * @param {{ 'display-name'?: string, username: string }} tags
 * @returns {string}
 */
function formatUserName(tags) {
    return tags['display-name']
        ? `${tags['display-name']}(${tags['username']})`
        : tags['username'];
}

/**
 * 時間戳格式化
 * @param {string|number} tmiSentTs
 * @returns {string}
 */
function formatTimestamp(tmiSentTs) {
    return new Date(Number(tmiSentTs)).toLocaleString('sv-SE');
}

/**
 * 判斷是否需要回覆（目前遊戲名稱存在，且 replyGameName 不包含該名稱）
 * @param {string} currentGameName
 * @param {string} replyGameName
 * @returns {boolean}
 */
function shouldReply(currentGameName, replyGameName) {
    return !!currentGameName && !replyGameName.includes(currentGameName);
}

/**
 * 將 template 中的 {game} 替換為遊戲名稱
 * @param {string} template
 * @param {string} gameName
 * @returns {string}
 */
function replaceGamePlaceholder(template, gameName) {
    return template.replace(/{game}/, gameName);
}

/**
 * 警告文字 single source of truth：自訂遊戲名稱覆寫提示
 * @param {string} customName
 * @returns {string}
 */
function getOverrideWarningText(customName) {
    return customName
        ? '已覆寫 Steam 結果，自動回覆會固定使用「' + customName + '」'
        : '';
}

/**
 * 警告文字 single source of truth：Template 缺 {game} 提示
 * @param {string} template
 * @returns {string}
 */
function getTemplateWarningText(template) {
    return (template && !template.includes('{game}'))
        ? 'Template 缺少 {game} 佔位符，遊戲名稱不會被替換'
        : '';
}

/**
 * 將 Twitch IRC msg-id 錯誤碼翻譯為可動作中文 hint
 * @param {unknown} err
 * @returns {string} 對應 hint，找不到則回空字串
 */
function translateIrcError(err) {
    const code = String(err).toLowerCase();
    if (code.includes('msg_duplicate'))         return '（重複訊息：Twitch 30 秒內偵測到相同內容會擋）';
    if (code.includes('msg_ratelimit'))         return '（送話過快：達到 20 訊息/30 秒上限）';
    if (code.includes('msg_slowmode'))          return '（slow mode：頻道限制每隔 N 秒才能發一次）';
    if (code.includes('msg_followersonly'))     return '（只開放追隨者發言，需追隨頻道並達指定時間）';
    if (code.includes('msg_subsonly'))          return '（只開放訂閱者發言）';
    if (code.includes('msg_emoteonly'))         return '（只能發 emote）';
    if (code.includes('msg_r9k'))               return '（r9k 模式：每則訊息必須不同）';
    if (code.includes('msg_timedout'))          return '（你被該頻道 timeout）';
    if (code.includes('msg_banned'))            return '（你被該頻道封鎖）';
    if (code.includes('msg_channel_suspended')) return '（頻道被 Twitch 停權）';
    if (code.includes('msg_suspended'))         return '（你的帳號被 Twitch 停權）';
    if (code.includes('msg_rejected'))          return '（被 AutoMod 擋下）';
    if (code.includes('msg_verified_email'))    return '（必須先驗證 email）';
    if (code.includes('no response'))           return '（IRC 沒回應，可能斷線或 timeout）';
    return '';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        addLog, formatUserName, formatTimestamp, shouldReply, replaceGamePlaceholder,
        getOverrideWarningText, getTemplateWarningText, translateIrcError
    };
}
