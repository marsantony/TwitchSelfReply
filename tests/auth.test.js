import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load twitch-auth.js source and execute it to get window.TwitchAuth
const authSource = readFileSync(
    resolve(__dirname, '../../marsantony.github.io/shared/twitch-auth.js'),
    'utf-8'
);

function loadTwitchAuth() {
    delete globalThis.TwitchAuth;
    const fn = new Function(authSource);
    fn();
    return globalThis.TwitchAuth;
}

describe('TwitchAuth (Auth Code + BFF)', () => {
    let TwitchAuth;

    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
        vi.restoreAllMocks();
        TwitchAuth = loadTwitchAuth();
    });

    describe('login', () => {
        it('產生 response_type=code 的 OAuth URL', () => {
            try {
                TwitchAuth.login('testclientid', ['chat:read', 'chat:edit']);
            } catch (e) {
                // location.href assignment may throw in jsdom
            }

            expect(sessionStorage.getItem('Twitch_OAuthState')).toBeTruthy();
            expect(sessionStorage.getItem('Twitch_OAuthReturnUrl')).toBeTruthy();
        });

        it('預設 scopes 不會報錯', () => {
            try {
                TwitchAuth.login('testclientid');
            } catch (e) {
                // location.href assignment may throw in jsdom
            }

            expect(sessionStorage.getItem('Twitch_OAuthState')).toBeTruthy();
        });
    });

    describe('handleCallback', () => {
        it('解析 query code → POST Worker → 儲存 token + session_id', async () => {
            const state = 'teststatevalue';
            sessionStorage.setItem('Twitch_OAuthState', state);
            sessionStorage.setItem('Twitch_OAuthReturnUrl', 'https://example.com/app');

            // Set location.search
            const originalSearch = window.location.search;
            Object.defineProperty(window, 'location', {
                writable: true,
                value: {
                    ...window.location,
                    search: '?code=auth-code-123&state=' + state,
                    pathname: '/auth/',
                },
            });

            const mockFetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        access_token: 'new-access-token',
                        session_id: 'session-id-xyz',
                        username: 'testuser',
                        expires_in: 14400,
                    }),
                })
            );
            vi.stubGlobal('fetch', mockFetch);

            const result = await TwitchAuth.handleCallback();

            expect(result.token).toBe('new-access-token');
            expect(result.username).toBe('testuser');
            expect(result.returnUrl).toBe('https://example.com/app');

            // Check storage
            expect(sessionStorage.getItem('Twitch_OAuthToken')).toBe('new-access-token');
            expect(sessionStorage.getItem('Twitch_OAuthUsername')).toBe('testuser');
            expect(localStorage.getItem('Twitch_OAuthSessionId')).toBe('session-id-xyz');
            expect(localStorage.getItem('Twitch_OAuthUsername')).toBe('testuser');

            // State and returnUrl should be cleaned up
            expect(sessionStorage.getItem('Twitch_OAuthState')).toBeNull();
            expect(sessionStorage.getItem('Twitch_OAuthReturnUrl')).toBeNull();

            // Verify Worker was called correctly
            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [url, opts] = mockFetch.mock.calls[0];
            expect(url).toContain('/token');
            expect(JSON.parse(opts.body).code).toBe('auth-code-123');

            vi.unstubAllGlobals();
        });

        it('state mismatch 時 reject', async () => {
            sessionStorage.setItem('Twitch_OAuthState', 'correct_state');

            Object.defineProperty(window, 'location', {
                writable: true,
                value: {
                    ...window.location,
                    search: '?code=somecode&state=wrong_state',
                    pathname: '/auth/',
                },
            });

            await expect(TwitchAuth.handleCallback()).rejects.toThrow('State mismatch');
            expect(sessionStorage.getItem('Twitch_OAuthToken')).toBeNull();
        });

        it('沒有 code 時回傳 false', async () => {
            Object.defineProperty(window, 'location', {
                writable: true,
                value: { ...window.location, search: '', pathname: '/auth/' },
            });

            const result = await TwitchAuth.handleCallback();
            expect(result).toBe(false);
        });

        it('query 不含 code 時回傳 false', async () => {
            Object.defineProperty(window, 'location', {
                writable: true,
                value: { ...window.location, search: '?error=access_denied', pathname: '/auth/' },
            });

            const result = await TwitchAuth.handleCallback();
            expect(result).toBe(false);
        });
    });

    describe('refreshToken', () => {
        it('有效 session_id 刷新成功', async () => {
            localStorage.setItem('Twitch_OAuthSessionId', 'my-session');
            localStorage.setItem('Twitch_OAuthUsername', 'testuser');

            const mockFetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        access_token: 'refreshed-token',
                        expires_in: 14400,
                    }),
                })
            );
            vi.stubGlobal('fetch', mockFetch);

            const result = await TwitchAuth.refreshToken();

            expect(result.token).toBe('refreshed-token');
            expect(result.username).toBe('testuser');
            expect(sessionStorage.getItem('Twitch_OAuthToken')).toBe('refreshed-token');

            // Verify Worker was called
            const [url, opts] = mockFetch.mock.calls[0];
            expect(url).toContain('/refresh');
            expect(JSON.parse(opts.body).session_id).toBe('my-session');

            vi.unstubAllGlobals();
        });

        it('沒有 session_id 時 reject', async () => {
            await expect(TwitchAuth.refreshToken()).rejects.toThrow('No session');
        });

        it('Worker 回 401 時清除 session_id', async () => {
            localStorage.setItem('Twitch_OAuthSessionId', 'expired-session');

            const mockFetch = vi.fn(() =>
                Promise.resolve({
                    ok: false,
                    status: 401,
                    json: () => Promise.resolve({ error: 'Invalid session' }),
                })
            );
            vi.stubGlobal('fetch', mockFetch);

            await expect(TwitchAuth.refreshToken()).rejects.toThrow('Invalid session');
            expect(localStorage.getItem('Twitch_OAuthSessionId')).toBeNull();

            vi.unstubAllGlobals();
        });
    });

    describe('tryRestore', () => {
        it('已有 token 時直接回傳', async () => {
            sessionStorage.setItem('Twitch_OAuthToken', 'existing-token');
            sessionStorage.setItem('Twitch_OAuthUsername', 'user');

            const result = await TwitchAuth.tryRestore();

            expect(result.token).toBe('existing-token');
            expect(result.username).toBe('user');
        });

        it('有 session_id 但沒 token 時自動 refresh', async () => {
            localStorage.setItem('Twitch_OAuthSessionId', 'my-session');
            localStorage.setItem('Twitch_OAuthUsername', 'saveduser');

            const mockFetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        access_token: 'restored-token',
                        expires_in: 14400,
                    }),
                })
            );
            vi.stubGlobal('fetch', mockFetch);

            const result = await TwitchAuth.tryRestore();

            expect(result.token).toBe('restored-token');
            expect(result.username).toBe('saveduser');
            expect(sessionStorage.getItem('Twitch_OAuthToken')).toBe('restored-token');

            vi.unstubAllGlobals();
        });

        it('沒有 session_id 也沒 token 時回傳 false', async () => {
            const result = await TwitchAuth.tryRestore();
            expect(result).toBe(false);
        });
    });

    describe('getToken / getUsername', () => {
        it('沒登入時回傳空字串', () => {
            expect(TwitchAuth.getToken()).toBe('');
            expect(TwitchAuth.getUsername()).toBe('');
        });

        it('回傳 sessionStorage 的值', () => {
            sessionStorage.setItem('Twitch_OAuthToken', 'abc123');
            sessionStorage.setItem('Twitch_OAuthUsername', 'myuser');
            expect(TwitchAuth.getToken()).toBe('abc123');
            expect(TwitchAuth.getUsername()).toBe('myuser');
        });

        it('getUsername 優先 sessionStorage，fallback localStorage', () => {
            localStorage.setItem('Twitch_OAuthUsername', 'localuser');
            expect(TwitchAuth.getUsername()).toBe('localuser');

            sessionStorage.setItem('Twitch_OAuthUsername', 'sessionuser');
            expect(TwitchAuth.getUsername()).toBe('sessionuser');
        });
    });

    describe('isLoggedIn', () => {
        it('沒 token 也沒 session_id 時回傳 false', () => {
            expect(TwitchAuth.isLoggedIn()).toBe(false);
        });

        it('有 token 時回傳 true', () => {
            sessionStorage.setItem('Twitch_OAuthToken', 'token123');
            expect(TwitchAuth.isLoggedIn()).toBe(true);
        });

        it('只有 session_id（token 過期但可 refresh）時回傳 true', () => {
            localStorage.setItem('Twitch_OAuthSessionId', 'session123');
            expect(TwitchAuth.isLoggedIn()).toBe(true);
        });
    });

    describe('logout', () => {
        it('清除所有 storage 並通知 Worker', async () => {
            sessionStorage.setItem('Twitch_OAuthToken', 'token');
            sessionStorage.setItem('Twitch_OAuthUsername', 'user');
            localStorage.setItem('Twitch_OAuthSessionId', 'session');
            localStorage.setItem('Twitch_OAuthUsername', 'user');

            const mockFetch = vi.fn(() =>
                Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
            );
            vi.stubGlobal('fetch', mockFetch);

            await TwitchAuth.logout();

            expect(sessionStorage.getItem('Twitch_OAuthToken')).toBeNull();
            expect(sessionStorage.getItem('Twitch_OAuthUsername')).toBeNull();
            expect(localStorage.getItem('Twitch_OAuthSessionId')).toBeNull();
            expect(localStorage.getItem('Twitch_OAuthUsername')).toBeNull();

            // Verify Worker was called
            const [url, opts] = mockFetch.mock.calls[0];
            expect(url).toContain('/logout');
            expect(JSON.parse(opts.body).session_id).toBe('session');

            vi.unstubAllGlobals();
        });

        it('沒有 session_id 時不呼叫 Worker', async () => {
            sessionStorage.setItem('Twitch_OAuthToken', 'token');

            const mockFetch = vi.fn();
            vi.stubGlobal('fetch', mockFetch);

            await TwitchAuth.logout();

            expect(mockFetch).not.toHaveBeenCalled();

            vi.unstubAllGlobals();
        });
    });

    describe('constants', () => {
        it('匯出正確的 storage keys', () => {
            expect(TwitchAuth.KEY_TOKEN).toBe('Twitch_OAuthToken');
            expect(TwitchAuth.KEY_USERNAME).toBe('Twitch_OAuthUsername');
            expect(TwitchAuth.KEY_STATE).toBe('Twitch_OAuthState');
            expect(TwitchAuth.KEY_RETURN_URL).toBe('Twitch_OAuthReturnUrl');
            expect(TwitchAuth.KEY_SESSION_ID).toBe('Twitch_OAuthSessionId');
            expect(TwitchAuth.REDIRECT_URI).toBe('https://marsantony.github.io/auth/');
        });

        it('匯出新方法', () => {
            expect(typeof TwitchAuth.refreshToken).toBe('function');
            expect(typeof TwitchAuth.tryRestore).toBe('function');
        });
    });
});
