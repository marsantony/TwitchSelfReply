/* global addLog, formatUserName, formatTimestamp, shouldReply, tmi, TwitchAuth */

const STORAGE_COMMANDREPLYTEMPLATE = 'TwitchAutoReply_CommandReplyTemplate';

class selfReplyClass {
    #isEnable = false;
    #currentGameName = '';
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

    #handleSteamReply(channel, tags, otherMessage) {
        this.#fetchFn('https://asia-east1-steamwebapi-394409.cloudfunctions.net/GetSteamStatus?steamid=' + encodeURIComponent(this.#steamId))
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
                    const replyMessage = this.getMessage(this.#currentGameName, otherMessage);
                    const logEl = document.getElementById('log');
                    this.#client.reply(channel, replyMessage, tags);
                    const name = formatUserName(tags);
                    const timeStamp = formatTimestamp(tags['tmi-sent-ts']);
                    addLog(logEl, `${timeStamp} ${name} !${this.commandName}，回覆：${replyMessage}`);
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
        var channelEl = document.getElementById('channel');
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

            if (command === this.commandName) {
                this.#handleSteamReply(channel, tags, otherMessage);
            }
        });
    }

    stop() {
        if (!this.#isEnable) return;
        this.#isEnable = false;
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
            this.#connect();
            this.#bindMessageHandler();

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
