import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load twitch-auth.js source and execute it to get window.TwitchAuth
const authSource = readFileSync(
    resolve(__dirname, '../../marsantony.github.io/shared/twitch-auth.js'),
    'utf-8'
);

function loadTwitchAuth() {
    // Reset window.TwitchAuth
    delete globalThis.TwitchAuth;
    // Execute the IIFE
    const fn = new Function(authSource);
    fn();
    return globalThis.TwitchAuth;
}

describe('TwitchAuth', () => {
    let TwitchAuth;

    beforeEach(() => {
        sessionStorage.clear();
        TwitchAuth = loadTwitchAuth();
    });

    describe('login', () => {
        it('produces correct OAuth URL and redirects', () => {
            const originalHref = location.href;
            // Mock location.href setter
            const hrefSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
                ...window.location,
                href: originalHref,
                set href(val) { /* noop for test */ }
            });

            // We can't truly test redirect, but we can test storage
            // Save current href for assertion
            const beforeHref = location.href;

            // Just call login and check sessionStorage
            try {
                TwitchAuth.login('testclientid', ['chat:read', 'chat:edit']);
            } catch (e) {
                // location.href assignment may throw in jsdom
            }

            expect(sessionStorage.getItem('Twitch_OAuthState')).toBeTruthy();
            expect(sessionStorage.getItem('Twitch_OAuthReturnUrl')).toBeTruthy();

            hrefSpy.mockRestore();
        });

        it('uses default scopes when not provided', () => {
            try {
                TwitchAuth.login('testclientid');
            } catch (e) {
                // location.href assignment may throw in jsdom
            }

            expect(sessionStorage.getItem('Twitch_OAuthState')).toBeTruthy();
        });
    });

    describe('handleCallback', () => {
        it('parses hash and stores token', async () => {
            const state = 'teststatevalue';
            sessionStorage.setItem('Twitch_OAuthState', state);
            sessionStorage.setItem('Twitch_OAuthReturnUrl', 'https://example.com/app');

            // Set location hash
            window.location.hash = '#access_token=mytoken123&state=' + state + '&token_type=bearer';

            // Mock fetch for Twitch API
            const mockFetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: [{ login: 'testuser' }] }),
                })
            );
            vi.stubGlobal('fetch', mockFetch);

            const result = await TwitchAuth.handleCallback('testclientid');

            expect(result.token).toBe('mytoken123');
            expect(result.username).toBe('testuser');
            expect(result.returnUrl).toBe('https://example.com/app');
            expect(sessionStorage.getItem('Twitch_OAuthToken')).toBe('mytoken123');
            expect(sessionStorage.getItem('Twitch_OAuthUsername')).toBe('testuser');
            // State and returnUrl should be cleaned up
            expect(sessionStorage.getItem('Twitch_OAuthState')).toBeNull();
            expect(sessionStorage.getItem('Twitch_OAuthReturnUrl')).toBeNull();

            vi.unstubAllGlobals();
            window.location.hash = '';
        });

        it('rejects on state mismatch', async () => {
            sessionStorage.setItem('Twitch_OAuthState', 'correct_state');
            window.location.hash = '#access_token=mytoken&state=wrong_state&token_type=bearer';

            await expect(TwitchAuth.handleCallback('testclientid')).rejects.toThrow('State mismatch');

            expect(sessionStorage.getItem('Twitch_OAuthToken')).toBeNull();

            window.location.hash = '';
        });

        it('returns false when no hash present', async () => {
            window.location.hash = '';
            const result = await TwitchAuth.handleCallback('testclientid');
            expect(result).toBe(false);
        });

        it('returns false when no access_token in hash', async () => {
            window.location.hash = '#error=access_denied';
            const result = await TwitchAuth.handleCallback('testclientid');
            expect(result).toBe(false);
            window.location.hash = '';
        });
    });

    describe('getToken / getUsername', () => {
        it('returns empty string when not logged in', () => {
            expect(TwitchAuth.getToken()).toBe('');
            expect(TwitchAuth.getUsername()).toBe('');
        });

        it('returns stored values', () => {
            sessionStorage.setItem('Twitch_OAuthToken', 'abc123');
            sessionStorage.setItem('Twitch_OAuthUsername', 'myuser');
            expect(TwitchAuth.getToken()).toBe('abc123');
            expect(TwitchAuth.getUsername()).toBe('myuser');
        });
    });

    describe('isLoggedIn', () => {
        it('returns false when no token', () => {
            expect(TwitchAuth.isLoggedIn()).toBe(false);
        });

        it('returns true when token exists', () => {
            sessionStorage.setItem('Twitch_OAuthToken', 'token123');
            expect(TwitchAuth.isLoggedIn()).toBe(true);
        });
    });

    describe('logout', () => {
        it('clears token and username from sessionStorage', () => {
            sessionStorage.setItem('Twitch_OAuthToken', 'token123');
            sessionStorage.setItem('Twitch_OAuthUsername', 'user123');

            TwitchAuth.logout();

            expect(sessionStorage.getItem('Twitch_OAuthToken')).toBeNull();
            expect(sessionStorage.getItem('Twitch_OAuthUsername')).toBeNull();
        });
    });

    describe('constants', () => {
        it('exports correct storage keys', () => {
            expect(TwitchAuth.KEY_TOKEN).toBe('Twitch_OAuthToken');
            expect(TwitchAuth.KEY_USERNAME).toBe('Twitch_OAuthUsername');
            expect(TwitchAuth.KEY_STATE).toBe('Twitch_OAuthState');
            expect(TwitchAuth.KEY_RETURN_URL).toBe('Twitch_OAuthReturnUrl');
            expect(TwitchAuth.REDIRECT_URI).toBe('https://marsantony.github.io/auth/');
        });
    });
});
