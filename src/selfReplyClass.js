/* global addLog, formatUserName, formatTimestamp, shouldReply, tmi */

const STORAGE_COMMANDREPLYTEMPLATE = 'TwitchAutoReply_CommandReplyTemplate';

class selfReplyClass {
    #isEnable = false;
    #currentGameName = '';
    #replyGameName = '';
    #currentNightBotCommandTag = {};
    #currentNightBotCommandOtherMessage = '';
    #channel = '';
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

        this.immediatelyButtonName = options.immediatelyButtonName;
        this.commandName = options.commandName || '遊戲';
        this.commandNameInNightBot = 'game';

        this.#tmiClientFactory = (deps && deps.tmiClientFactory) || ((opts) => new tmi.Client(opts));
        this.#fetchFn = (deps && deps.fetchFn) || fetch.bind(typeof window !== 'undefined' ? window : globalThis);
    }

    #logTalkingAboutMe(tags, message) {
        if (!this.#client) return;
        const myUserId = this.#client.globaluserstate['user-id'];
        const myNames = [this.#client.username, this.#client.globaluserstate['display-name']];

        const args = message.split(' ');
        if (tags['reply-parent-user-id'] == myUserId ||
            tags['reply-thread-parent-user-id'] == myUserId ||
            myNames.find((name) => args.indexOf(`@${name}`) > -1)) {
            const name = formatUserName(tags);
            const timeStamp = formatTimestamp(tags['tmi-sent-ts']);
            const logEl = document.getElementById('log');
            addLog(logEl, `${timeStamp} ${name}：${message}`);
        }
    }

    #handleSteamReply(channel, tags, otherMessage, isImmediate) {
        this.#fetchFn('https://asia-east1-steamwebapi-394409.cloudfunctions.net/GetOrangeSteamStatus')
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Steam API 回應錯誤: ${response.status}`);
                }
                return response.json();
            })
            .then((json) => {
                document.getElementById('currentSteamGameName').textContent = json['GameName'];
                this.#currentGameName = document.getElementById('gameName').value || json['GameName'];

                if (shouldReply(this.#currentGameName, this.#replyGameName)) {
                    let currentTag = tags;
                    let currentOtherMessage = otherMessage;

                    if (!isImmediate && tags && tags.username &&
                        tags.username.toLowerCase() === 'nightbot' &&
                        this.#currentNightBotCommandTag['id']) {
                        currentTag = this.#currentNightBotCommandTag;
                        currentOtherMessage = this.#currentNightBotCommandOtherMessage;
                        this.#currentNightBotCommandTag = {};
                        this.#currentNightBotCommandOtherMessage = '';
                    }

                    const replyMessage = this.getMessage(this.#currentGameName);
                    const logEl = document.getElementById('log');

                    if (isImmediate) {
                        this.#client.say(this.#channel, replyMessage);
                        const timeStamp = new Date().toLocaleString('sv-SE');
                        addLog(logEl, `${timeStamp} 點擊立即回覆並更新(MOD) ，回覆：${replyMessage}`);
                    } else {
                        this.#client.reply(channel, replyMessage, currentTag);
                        const name = formatUserName(currentTag);
                        const timeStamp = formatTimestamp(currentTag['tmi-sent-ts']);
                        addLog(logEl, `${timeStamp} ${name} !${this.commandName}，回覆：${replyMessage}`);
                    }
                }
            })
            .catch((err) => {
                const logEl = document.getElementById('log');
                addLog(logEl, `[錯誤] Steam API 請求失敗: ${err.message}`);
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
        this.#channel = document.getElementById('channel').value;
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
                username: sessionStorage.getItem('Twitch_OAuthUsername') || '',
                password: sessionStorage.getItem('Twitch_OAuthToken') || ''
            },
            channels: [this.#channel]
        });

        this.#client.connect().catch(console.error);

        this.#client.on('message', (channel, tags, message, self) => {
            if (tags.username.toLowerCase() === 'streamelements' && message.includes('遊戲名稱')) {
                this.#replyGameName = message;
                document.getElementById('currentCommandReplyGameName').textContent = this.#replyGameName;
            }
        });
    }

    #bindMessageHandler() {
        this.#client.on('message', (channel, tags, message, self) => {
            this.#logTalkingAboutMe(tags, message);
            if (!this.#isEnable) return;
            if (self || !message.startsWith('!')) return;

            const args = message.slice(1).split(' ');
            const command = args.shift().toLowerCase();
            const otherMessage = args.join(' ');

            if (command === this.commandNameInNightBot) {
                this.#currentNightBotCommandTag = tags;
                this.#currentNightBotCommandOtherMessage = otherMessage;
            } else if (command === this.commandName) {
                this.#handleSteamReply(channel, tags, otherMessage, false);
            }
        });
    }

    init() {
        if (this._invalid) return;

        if (this.immediatelyButtonName) {
            document.getElementById(this.immediatelyButtonName).addEventListener('click', () => {
                if (!this.#client) this.#connect();
                this.#handleSteamReply(null, null, null, true);
            });
        }

        document.getElementById(this.startButtonName).addEventListener('click', () => {
            this.#connect();
            this.#bindMessageHandler();

            this.#isEnable = true;
            document.getElementById('channel').disabled = true;
            localStorage.setItem(STORAGE_COMMANDREPLYTEMPLATE, document.getElementById('commandReplyTemplate').value);

            document.getElementById(this.startButtonName).style.display = 'none';
            document.getElementById(this.stopButtonName).style.display = '';
        });

        document.getElementById(this.stopButtonName).addEventListener('click', () => {
            this.#isEnable = false;
            this.#disconnect();
            document.getElementById('channel').disabled = false;

            document.getElementById(this.startButtonName).style.display = '';
            document.getElementById(this.stopButtonName).style.display = 'none';
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { selfReplyClass, STORAGE_COMMANDREPLYTEMPLATE };
}
