import { describe, it, expect, beforeEach, vi } from 'vitest';
import { selfReplyClass, STORAGE_COMMANDREPLYTEMPLATE } from '../src/selfReplyClass.js';

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
        disconnect: vi.fn(() => Promise.resolve()),
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
        <input id="commandReplyTemplate" value="目前遊戲：{game}" />
        <input id="gameName" value="" />
        <span id="currentSteamGameName"></span>
        <span id="currentCommandReplyGameName"></span>
        <textarea id="log"></textarea>
        <button id="startReply">開始自動回覆</button>
        <button id="stopReply" style="display:none">停止回覆</button>
        <button id="immediatelyReplyMOD">立即回覆並更新(MOD)</button>
        <button id="startReplyMOD">開始自動回覆並更新(MOD)</button>
        <button id="stopReplyMOD" style="display:none">停止回覆(MOD)</button>
    `;
}

function createInstance(overrides, deps) {
    return new selfReplyClass(
        {
            startButtonName: 'startReply',
            stopButtonName: 'stopReply',
            getMessage: () => 'test',
            ...overrides,
        },
        deps
    );
}

describe('selfReplyClass', () => {
    beforeEach(() => {
        setupDOM();
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('Twitch_OAuthToken', 'testtoken');
        sessionStorage.setItem('Twitch_OAuthUsername', 'testuser');
    });

    describe('constructor', () => {
        it('缺少必要參數時標記為 invalid', () => {
            const instance = new selfReplyClass({});
            expect(instance._invalid).toBe(true);
        });

        it('缺少 getMessage 時標記為 invalid', () => {
            const instance = new selfReplyClass({
                startButtonName: 'startReply',
                stopButtonName: 'stopReply',
            });
            expect(instance._invalid).toBe(true);
        });

        it('完整參數時正常建立', () => {
            const instance = createInstance();
            expect(instance._invalid).toBeUndefined();
            expect(instance.commandName).toBe('遊戲');
        });

        it('可自訂 commandName', () => {
            const instance = createInstance({ commandName: '更新遊戲' });
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

        it('點擊開始後儲存 commandReplyTemplate 到 localStorage', () => {
            const mockClient = createMockTmiClient();
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();

            document.getElementById('startReply').click();

            expect(localStorage.getItem(STORAGE_COMMANDREPLYTEMPLATE)).toBe('目前遊戲：{game}');
        });

        it('點擊開始後按鈕狀態切換正確', () => {
            const mockClient = createMockTmiClient();
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();

            document.getElementById('startReply').click();

            expect(document.getElementById('startReply').style.display).toBe('none');
            expect(document.getElementById('stopReply').style.display).toBe('');
        });

        it('點擊停止後按鈕狀態切換正確', () => {
            const mockClient = createMockTmiClient();
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();
            document.getElementById('startReply').click();

            document.getElementById('stopReply').click();

            expect(document.getElementById('startReply').style.display).toBe('');
            expect(document.getElementById('stopReply').style.display).toBe('none');
        });

        it('點擊停止後會斷開連線', () => {
            const mockClient = createMockTmiClient();
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();
            document.getElementById('startReply').click();

            document.getElementById('stopReply').click();

            expect(mockClient.disconnect).toHaveBeenCalled();
        });
    });

    describe('connect 與訊息處理', () => {
        it('點擊 startReply 時建立 tmi 連線', () => {
            const mockClient = createMockTmiClient();
            const factory = vi.fn(() => mockClient);
            const instance = createInstance({}, { tmiClientFactory: factory });
            instance.init();

            document.getElementById('startReply').click();

            expect(factory).toHaveBeenCalledTimes(1);
            expect(mockClient.connect).toHaveBeenCalled();
        });

        it('StreamElements 訊息更新 replyGameName', () => {
            const mockClient = createMockTmiClient();
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();
            document.getElementById('startReply').click();

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
            const instance = createInstance(
                { getMessage: (game) => `目前遊戲：${game}`, commandName: '遊戲' },
                { tmiClientFactory: () => mockClient, fetchFn: mockFetch }
            );
            instance.init();
            document.getElementById('startReply').click();

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
            const instance = createInstance({}, { tmiClientFactory: () => mockClient, fetchFn: mockFetch });
            instance.init();
            document.getElementById('startReply').click();

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
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();

            document.getElementById('startReply').click();

            expect(document.getElementById('channel').disabled).toBe(true);
        });

        it('停止後頻道下拉選單恢復可選', () => {
            const mockClient = createMockTmiClient();
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();
            document.getElementById('startReply').click();

            document.getElementById('stopReply').click();

            expect(document.getElementById('channel').disabled).toBe(false);
        });

        it('連線時使用選中的頻道', () => {
            const mockClient = createMockTmiClient();
            const factory = vi.fn(() => mockClient);
            const instance = createInstance({}, { tmiClientFactory: factory });
            instance.init();

            document.getElementById('startReply').click();

            expect(factory).toHaveBeenCalledWith(
                expect.objectContaining({
                    channels: ['shuteye_orange']
                })
            );
        });

        it('選擇第二個頻道後連線使用該頻道', () => {
            const mockClient = createMockTmiClient();
            const factory = vi.fn(() => mockClient);
            const instance = createInstance({}, { tmiClientFactory: factory });
            instance.init();

            document.getElementById('channel').value = 'marsantonymars';
            document.getElementById('startReply').click();

            expect(factory).toHaveBeenCalledWith(
                expect.objectContaining({
                    channels: ['marsantonymars']
                })
            );
        });

        it('停止後切換頻道再開始，使用新頻道建立連線', () => {
            const mockClient1 = createMockTmiClient();
            const mockClient2 = createMockTmiClient();
            let callCount = 0;
            const factory = vi.fn(() => {
                callCount++;
                return callCount === 1 ? mockClient1 : mockClient2;
            });
            const instance = createInstance({}, { tmiClientFactory: factory });
            instance.init();

            // 第一次：連到 shuteye_orange
            document.getElementById('startReply').click();
            expect(factory).toHaveBeenCalledTimes(1);
            expect(factory).toHaveBeenLastCalledWith(
                expect.objectContaining({ channels: ['shuteye_orange'] })
            );

            // 停止
            document.getElementById('stopReply').click();
            expect(mockClient1.disconnect).toHaveBeenCalled();

            // 切換頻道，重新開始
            document.getElementById('channel').value = 'marsantonymars';
            document.getElementById('startReply').click();

            expect(factory).toHaveBeenCalledTimes(2);
            expect(factory).toHaveBeenLastCalledWith(
                expect.objectContaining({ channels: ['marsantonymars'] })
            );
        });
    });

    describe('logTalkingAboutMe（@TAG 記錄）', () => {
        it('被 reply 時記錄到 log', () => {
            const mockClient = createMockTmiClient();
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();
            document.getElementById('startReply').click();

            const tags = {
                username: 'viewer1',
                'display-name': '觀眾',
                'tmi-sent-ts': '1700000000000',
                'reply-parent-user-id': '12345',
            };
            mockClient._emit('message', '#channel', tags, '你好啊', false);

            expect(document.getElementById('log').value).toContain('觀眾(viewer1)');
            expect(document.getElementById('log').value).toContain('你好啊');
        });

        it('被 @TAG 名稱時記錄到 log', () => {
            const mockClient = createMockTmiClient();
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();
            document.getElementById('startReply').click();

            const tags = {
                username: 'viewer1',
                'display-name': '觀眾',
                'tmi-sent-ts': '1700000000000',
            };
            mockClient._emit('message', '#channel', tags, '嗨 @testuser 你好', false);

            expect(document.getElementById('log').value).toContain('嗨 @testuser 你好');
        });

        it('被 reply-thread 時記錄到 log', () => {
            const mockClient = createMockTmiClient();
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();
            document.getElementById('startReply').click();

            const tags = {
                username: 'viewer1',
                'display-name': '觀眾',
                'tmi-sent-ts': '1700000000000',
                'reply-thread-parent-user-id': '12345',
            };
            mockClient._emit('message', '#channel', tags, '串回覆', false);

            expect(document.getElementById('log').value).toContain('串回覆');
        });

        it('無關訊息不記錄', () => {
            const mockClient = createMockTmiClient();
            const instance = createInstance({}, { tmiClientFactory: () => mockClient });
            instance.init();
            document.getElementById('startReply').click();

            const tags = {
                username: 'viewer1',
                'display-name': '觀眾',
                'tmi-sent-ts': '1700000000000',
            };
            mockClient._emit('message', '#channel', tags, '路人訊息', false);

            expect(document.getElementById('log').value).toBe('');
        });
    });

    describe('立即回覆（immediatelyButton）', () => {
        it('點擊立即回覆按鈕觸發 Steam API 並用 say 發送', async () => {
            const mockClient = createMockTmiClient();
            const mockFetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ GameName: 'Elden Ring' }),
                })
            );
            const instance = createInstance(
                {
                    startButtonName: 'startReplyMOD',
                    stopButtonName: 'stopReplyMOD',
                    getMessage: (game) => `!command edit !遊戲 ${game}`,
                    immediatelyButtonName: 'immediatelyReplyMOD',
                    commandName: '更新遊戲',
                },
                { tmiClientFactory: () => mockClient, fetchFn: mockFetch }
            );
            instance.init();

            document.getElementById('immediatelyReplyMOD').click();

            await vi.waitFor(() => {
                expect(mockFetch).toHaveBeenCalled();
            });

            await vi.waitFor(() => {
                expect(mockClient.say).toHaveBeenCalledWith(
                    'shuteye_orange',
                    '!command edit !遊戲 Elden Ring'
                );
            });

            expect(document.getElementById('log').value).toContain('立即回覆並更新');
        });
    });

    describe('NightBot 指令處理', () => {
        it('收到 !game 指令時暫存 NightBot tag', async () => {
            const mockClient = createMockTmiClient();
            const nightbotTags = {
                username: 'viewer1',
                'display-name': '觀眾',
                'tmi-sent-ts': '1700000000000',
                id: 'msg-123',
            };
            const mockFetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ GameName: 'Elden Ring' }),
                })
            );
            const instance = createInstance(
                { getMessage: (game) => `目前遊戲：${game}`, commandName: '遊戲' },
                { tmiClientFactory: () => mockClient, fetchFn: mockFetch }
            );
            instance.init();
            document.getElementById('startReply').click();

            // 先發 !game（NightBot 指令名稱）
            mockClient._emit('message', '#channel', nightbotTags, '!game 額外訊息', false);

            // 再由 nightbot 發 !遊戲，觸發回覆時應使用暫存的 viewer tag
            const nightbotReplyTags = {
                username: 'nightbot',
                'display-name': 'Nightbot',
                'tmi-sent-ts': '1700000001000',
                id: 'nightbot-msg',
            };
            mockClient._emit('message', '#channel', nightbotReplyTags, '!遊戲', false);

            await vi.waitFor(() => {
                expect(mockClient.reply).toHaveBeenCalledWith(
                    '#channel',
                    '目前遊戲：Elden Ring',
                    nightbotTags
                );
            });
        });
    });

    describe('常數匯出', () => {
        it('匯出正確的 localStorage key', () => {
            expect(STORAGE_COMMANDREPLYTEMPLATE).toBe('TwitchAutoReply_CommandReplyTemplate');
        });
    });

    describe('OAuth 認證', () => {
        it('連線時使用 sessionStorage 中的 token 和 username', () => {
            const mockClient = createMockTmiClient();
            const factory = vi.fn(() => mockClient);
            const instance = createInstance({}, { tmiClientFactory: factory });
            instance.init();

            document.getElementById('startReply').click();

            expect(factory).toHaveBeenCalledWith(
                expect.objectContaining({
                    identity: {
                        username: 'testuser',
                        password: 'testtoken'
                    }
                })
            );
        });
    });
});
