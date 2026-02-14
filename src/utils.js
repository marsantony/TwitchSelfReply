/**
 * 寫入 log textarea，新訊息會在最前面
 * @param {HTMLTextAreaElement} logEl
 * @param {string} text
 */
function addLog(logEl, text) {
    logEl.value = text + '\r\n' + logEl.value;
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { addLog, formatUserName, formatTimestamp, shouldReply, replaceGamePlaceholder };
}
