/* global addLog, formatUserName, formatTimestamp, shouldReply,
          getOverrideWarningText, getTemplateWarningText, translateIrcError,
          tmi, TwitchAuth */

const STORAGE_COMMANDREPLYTEMPLATE = 'TwitchAutoReply_CommandReplyTemplate';

class selfReplyClass {
    #isEnable = false;
    #replyGameName = '';
    #channel = '';
    #steamId = '';
    #client;
    #tmiClientFactory;
    #fetchFn;

    constructor(options, deps) {
        if (!options || !options.startButtonName || !options.stopButtonName ||
            !options.getMessage || typeof options.getMessage !== 'function') {
            this._invalid = true;
            return;
        }

        this.startButtonName = options.startButtonName;
        this.stopButtonName = options.stopButtonName;
        this.getMessage = options.getMessage;
        this.commandName = options.commandName || '遊戲';

        this.#tmiClientFactory = (deps && deps.tmiClientFactory) || ((opts) => new tmi.Client(opts));
        this.#fetchFn = (deps && deps.fetchFn) || fetch.bind(typeof window !== 'undefined' ? window : globalThis);
    }

    #logTalkingAboutMe(tags, message) {
        if (!this.#client) return;
        const myUserId = this.#client.globaluserstate['user-id'];
        const myNames = [this.#client.username, this.#client.globaluserstate['display-name']];

        if (tags['reply-parent-user-id'] == myUserId ||
            tags['reply-thread-parent-user-id'] == myUserId ||
            message.split(' ').some((word) => word.startsWith('@') && myNames.includes(word.slice(1)))) {
            const name = formatUserName(tags);
            const timeStamp = formatTimestamp(tags['tmi-sent-ts']);
            addLog(`${timeStamp} ${name}：${message}`);
        }
    }

    #handleSteamReply(tags, otherMessage) {
        // 進入點偵測 customName / template 異常（chat-flow 單行警告）
        const customName = document.getElementById('gameName').value;
        const overrideMsg = getOverrideWarningText(customName);
        if (overrideMsg) addLog('⚠ ' + overrideMsg);

        const template = document.getElementById('commandReplyTemplate').value;
        const templateMsg = getTemplateWarningText(template);
        if (templateMsg) addLog('⚠ ' + templateMsg);

        this.#fetchFn('https://asia-east1-steamwebapi-394409.cloudfunctions.net/GetSteamStatus?steamid=' + encodeURIComponent(this.#steamId))
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Steam API 回應錯誤: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then((json) => {
                const gameName = json['GameName'] || '';
                document.getElementById('currentSteamGameName').textContent = gameName;
                const currentGameName = customName || gameName;
                const name = formatUserName(tags);
                const timeStamp = formatTimestamp(tags['tmi-sent-ts']);

                if (shouldReply(currentGameName, this.#replyGameName)) {
                    const replyMessage = this.getMessage(currentGameName, otherMessage);
                    // tmi.js client.reply 回傳 Promise，等實際送出 / 失敗才 log
                    this.#client.reply(this.#channel, replyMessage, tags)
                        .then(() => {
                            addLog(`${timeStamp} ${name} !${this.commandName} → ✓ 已回覆：${replyMessage}`);
                        })
                        .catch((err) => {
                            const hint = translateIrcError(err);
                            addLog(`${timeStamp} ${name} !${this.commandName} → ✗ 送出失敗：${replyMessage}｜原因：${String(err)}${hint ? ' ' + hint : ''}`);
                        });
                } else {
                    addLog(`${timeStamp} ${name} !${this.commandName} → ↪ 跳過（SE 上 reply 已含「${currentGameName}」）`);
                }
            })
            .catch((err) => {
                addLog(`✗ Steam API 請求失敗：${err.message}`);
            });
    }

    #disconnect() {
        if (this.#client) {
            this.#client.disconnect().catch(() => {});
            this.#client = null;
        }
    }

    #connect() {
        this.#disconnect();
        const channelEl = document.getElementById('channel');
        if (channelEl.value === '__custom__') {
            this.#channel = (document.getElementById('customChannel')?.value || '').trim();
            this.#steamId = (document.getElementById('customSteamId')?.value || '').trim();
        } else {
            this.#channel = channelEl.value;
            this.#steamId = channelEl.selectedOptions[0]?.dataset.steamid || '';
        }
        this.#client = this.#tmiClientFactory({
            options: {
                debug: false,
                skipMembership: true,
                skipUpdatingEmotesets: true,
            },
            connection: {
                reconnect: true,
                secure: true
            },
            identity: {
                username: TwitchAuth.getUsername(),
                password: TwitchAuth.getToken()
            },
            channels: [this.#channel]
        });

        this.#client.connect()
            .then(() => addLog('▶ 已連線到頻道：' + this.#channel))
            .catch((err) => {
                addLog('✗ Twitch IRC 連線失敗：' + String(err) + '（可能 token 過期，請登出再重新登入）');
            });

        this.#client.on('message', (channel, tags, message, self) => {
            if (tags.username.toLowerCase() === 'streamelements' && message.includes('遊戲名稱')) {
                this.#replyGameName = message;
                document.getElementById('currentCommandReplyGameName').textContent = this.#replyGameName;
            }

            this.#logTalkingAboutMe(tags, message);
            if (!this.#isEnable) return;
            if (self || !message.startsWith('!')) return;

            const args = message.slice(1).split(' ');
            const command = args.shift().toLowerCase();
            const otherMessage = args.join(' ');

            if (command === this.commandName) {
                this.#handleSteamReply(tags, otherMessage);
            }
        });
    }

    stop() {
        if (!this.#isEnable) return;
        this.#isEnable = false;
        addLog('■ 停止自動回覆');
        this.#disconnect();
        document.getElementById('channel').disabled = false;

        document.getElementById(this.startButtonName).style.display = '';
        document.getElementById(this.stopButtonName).style.display = 'none';
    }

    get isActive() {
        return this.#isEnable;
    }

    init() {
        if (this._invalid) return;

        document.getElementById(this.startButtonName).addEventListener('click', () => {
            addLog('▶ 開始自動回覆');
            this.#connect();

            this.#isEnable = true;
            document.getElementById('channel').disabled = true;
            localStorage.setItem(STORAGE_COMMANDREPLYTEMPLATE, document.getElementById('commandReplyTemplate').value);

            document.getElementById(this.startButtonName).style.display = 'none';
            document.getElementById(this.stopButtonName).style.display = '';
        });

        document.getElementById(this.stopButtonName).addEventListener('click', () => {
            this.stop();
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { selfReplyClass, STORAGE_COMMANDREPLYTEMPLATE };
}
