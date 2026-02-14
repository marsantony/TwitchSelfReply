import { describe, it, expect, beforeEach, vi } from 'vitest';
import { selfReplyClass, STORAGE_USERNAME, STORAGE_PASSWORD, STORAGE_COMMANDREPLYTEMPLATE } from '../src/selfReplyClass.js';

// utils 的全域函數需要手動掛載（因為 selfReplyClass 用 /* global */ 引用）
import * as utils from '../src/utils.js';
globalThis.addLog = utils.addLog;
globalThis.formatUserName = utils.formatUserName;
globalThis.formatTimestamp = utils.formatTimestamp;
globalThis.shouldReply = utils.shouldReply;

function createMockTmiClient() {
    const handlers = {};
    return {
        connect: vi.fn(() => Promise.resolve()),
        on: vi.fn((event, handler) => {
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push(handler);
        }),
        say: vi.fn(),
        reply: vi.fn(),
        username: 'testuser',
        globaluserstate: { 'user-id': '12345', 'display-name': 'TestUser' },
        _handlers: handlers,
        _emit(event, ...args) {
            (handlers[event] || []).forEach(fn => fn(...args));
        }
    };
}

function setupDOM() {
    document.body.innerHTML = `
        <select id="channel">
            <option value="shuteye_orange">蝦愛橘子</option>
            <option value="marsantonymars">姬柊雪菜我老婆</option>
        </select>
        <input id="username" value="testuser" />
        <input id="password" value="oauth:testtoken" />
        <input id="commandReplyTemplate" value="目前遊戲：{game}" />
        <input id="gameName" value="" />
        <span id="currentSteamGameName"></span>
        <span id="currentCommandReplyGameName"></span>
        <textarea id="log"></textarea>
        <button id="autoReply">自動回覆</button>
        <button id="startReply" style="display:none">開始</button>
        <button id="stopReply" style="display:none">停止</button>
        <button id="immediatelyReplyMOD">立即回覆</button>
        <button id="autoReplyMOD">自動回覆MOD</button>
        <button id="startReplyMOD" style="display:none">開始MOD</button>
        <button id="stopReplyMOD" style="display:none">停止MOD</button>
    `;
}

describe('selfReplyClass', () => {
    beforeEach(() => {
        setupDOM();
        localStorage.clear();
        sessionStorage.clear();
    });

    describe('constructor', () => {
        it('缺少必要參數時標記為 invalid', () => {
            const instance = new selfReplyClass({});
            expect(instance._invalid).toBe(true);
        });

        it('缺少 getMessage 時標記為 invalid', () => {
            const instance = new selfReplyClass({
                firstButtonName: 'autoReply',
                startButtonName: 'startReply',
                stopButtonName: 'stopReply',
            });
            expect(instance._invalid).toBe(true);
        });

        it('完整參數時正常建立', () => {
            const instance = new selfReplyClass({
                firstButtonName: 'autoReply',
                startButtonName: 'startReply',
                stopButtonName: 'stopReply',
                getMessage: () => 'test',
            });
            expect(instance._invalid).toBeUndefined();
            expect(instance.commandName).toBe('遊戲');
        });

        it('可自訂 commandName', () => {
            const instance = new selfReplyClass({
                firstButtonName: 'autoReply',
                startButtonName: 'startReply',
                stopButtonName: 'stopReply',
                getMessage: () => 'test',
                commandName: '更新遊戲',
            });
            expect(instance.commandName).toBe('更新遊戲');
        });

        it('null 參數標記為 invalid', () => {
            const instance = new selfReplyClass(null);
            expect(instance._invalid).toBe(true);
        });
    });

    describe('init', () => {
        it('invalid 實例呼叫 init 不會報錯', () => {
            const instance = new selfReplyClass({});
            expect(() => instance.init()).not.toThrow();
        });

        it('init 後點擊按鈕會儲存設定到 localStorage', () => {
            const mockClient = createMockTmiClient();
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: (game) => `遊戲：${game}`,
                },
                { tmiClientFactory: () => mockClient }
            );
            instance.init();

            document.getElementById('autoReply').click();

            expect(localStorage.getItem(STORAGE_USERNAME)).toBe('testuser');
            expect(sessionStorage.getItem(STORAGE_PASSWORD)).toBe('oauth:testtoken');
        });

        it('點擊開始後按鈕狀態切換正確', () => {
            const mockClient = createMockTmiClient();
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: () => 'test',
                },
                { tmiClientFactory: () => mockClient }
            );
            instance.init();

            document.getElementById('autoReply').click();

            // 開始後：autoReply 和 startReply 隱藏，stopReply 顯示
            expect(document.getElementById('autoReply').style.display).toBe('none');
            expect(document.getElementById('startReply').style.display).toBe('none');
            expect(document.getElementById('stopReply').style.display).toBe('');
        });

        it('點擊停止後按鈕狀態切換正確', () => {
            const mockClient = createMockTmiClient();
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: () => 'test',
                },
                { tmiClientFactory: () => mockClient }
            );
            instance.init();
            document.getElementById('autoReply').click();

            document.getElementById('stopReply').click();

            // 停止後：autoReply 隱藏，startReply 顯示，stopReply 隱藏
            expect(document.getElementById('autoReply').style.display).toBe('none');
            expect(document.getElementById('startReply').style.display).toBe('');
            expect(document.getElementById('stopReply').style.display).toBe('none');
        });
    });

    describe('connect 與訊息處理', () => {
        it('點擊 autoReply 時建立 tmi 連線', () => {
            const mockClient = createMockTmiClient();
            const factory = vi.fn(() => mockClient);
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: () => 'test',
                },
                { tmiClientFactory: factory }
            );
            instance.init();

            document.getElementById('autoReply').click();

            expect(factory).toHaveBeenCalledTimes(1);
            expect(mockClient.connect).toHaveBeenCalled();
        });

        it('StreamElements 訊息更新 replyGameName', () => {
            const mockClient = createMockTmiClient();
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: () => 'test',
                },
                { tmiClientFactory: () => mockClient }
            );
            instance.init();
            document.getElementById('autoReply').click();

            // connect 內部註冊的第一個 message handler 處理 StreamElements
            mockClient._emit('message', '#channel', { username: 'streamelements' }, '目前遊戲名稱：Elden Ring', false);

            expect(document.getElementById('currentCommandReplyGameName').textContent)
                .toBe('目前遊戲名稱：Elden Ring');
        });
    });

    describe('Steam API 整合', () => {
        it('收到 !遊戲 指令時呼叫 Steam API 並回覆', async () => {
            const mockClient = createMockTmiClient();
            const mockFetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ GameName: 'Elden Ring' }),
                })
            );
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: (game) => `目前遊戲：${game}`,
                    commandName: '遊戲',
                },
                { tmiClientFactory: () => mockClient, fetchFn: mockFetch }
            );
            instance.init();
            document.getElementById('autoReply').click();

            // 模擬收到 !遊戲 指令（第二個 message handler）
            const tags = { username: 'viewer1', 'display-name': '觀眾', 'tmi-sent-ts': '1700000000000' };
            mockClient._emit('message', '#channel', tags, '!遊戲', false);

            await vi.waitFor(() => {
                expect(mockFetch).toHaveBeenCalled();
            });

            await vi.waitFor(() => {
                expect(mockClient.reply).toHaveBeenCalledWith(
                    '#channel',
                    '目前遊戲：Elden Ring',
                    tags
                );
            });
        });

        it('Steam API 失敗時記錄錯誤', async () => {
            const mockClient = createMockTmiClient();
            const mockFetch = vi.fn(() =>
                Promise.resolve({ ok: false, status: 500 })
            );
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: () => 'test',
                },
                { tmiClientFactory: () => mockClient, fetchFn: mockFetch }
            );
            instance.init();
            document.getElementById('autoReply').click();

            const tags = { username: 'viewer1', 'display-name': '觀眾', 'tmi-sent-ts': '1700000000000' };
            mockClient._emit('message', '#channel', tags, '!遊戲', false);

            await vi.waitFor(() => {
                expect(document.getElementById('log').value).toContain('Steam API');
            });
        });
    });

    describe('頻道選擇', () => {
        it('啟動後頻道下拉選單被鎖定', () => {
            const mockClient = createMockTmiClient();
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: () => 'test',
                },
                { tmiClientFactory: () => mockClient }
            );
            instance.init();

            document.getElementById('autoReply').click();

            expect(document.getElementById('channel').disabled).toBe(true);
        });

        it('停止後頻道下拉選單恢復可選', () => {
            const mockClient = createMockTmiClient();
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: () => 'test',
                },
                { tmiClientFactory: () => mockClient }
            );
            instance.init();
            document.getElementById('autoReply').click();

            document.getElementById('stopReply').click();

            expect(document.getElementById('channel').disabled).toBe(false);
        });

        it('連線時使用選中的頻道', () => {
            const mockClient = createMockTmiClient();
            const factory = vi.fn(() => mockClient);
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: () => 'test',
                },
                { tmiClientFactory: factory }
            );
            instance.init();

            document.getElementById('autoReply').click();

            expect(factory).toHaveBeenCalledWith(
                expect.objectContaining({
                    channels: ['shuteye_orange']
                })
            );
        });

        it('選擇第二個頻道後連線使用該頻道', () => {
            const mockClient = createMockTmiClient();
            const factory = vi.fn(() => mockClient);
            const instance = new selfReplyClass(
                {
                    firstButtonName: 'autoReply',
                    startButtonName: 'startReply',
                    stopButtonName: 'stopReply',
                    getMessage: () => 'test',
                },
                { tmiClientFactory: factory }
            );
            instance.init();

            document.getElementById('channel').value = 'marsantonymars';
            document.getElementById('autoReply').click();

            expect(factory).toHaveBeenCalledWith(
                expect.objectContaining({
                    channels: ['marsantonymars']
                })
            );
        });
    });

    describe('常數匯出', () => {
        it('匯出正確的 localStorage key', () => {
            expect(STORAGE_USERNAME).toBe('TwitchAutoReply_UserName');
            expect(STORAGE_PASSWORD).toBe('TwitchAutoReply_Password');
            expect(STORAGE_COMMANDREPLYTEMPLATE).toBe('TwitchAutoReply_CommandReplyTemplate');
        });
    });
});
