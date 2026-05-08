import { describe, it, expect, beforeEach } from 'vitest';
import {
    addLog, formatUserName, formatTimestamp, shouldReply, replaceGamePlaceholder,
    getOverrideWarningText, getTemplateWarningText, translateIrcError
} from '../src/utils.js';

function setupDOM() {
    document.body.innerHTML = `<textarea id="log"></textarea>`;
}

describe('addLog', () => {
    beforeEach(setupDOM);

    it('新訊息插入 textarea 最前面', () => {
        // jsdom 把 \r\n 正規化成 \n（符合 HTML spec）
        addLog('第一條');
        expect(document.getElementById('log').value).toBe('第一條\n');

        addLog('第二條');
        expect(document.getElementById('log').value).toBe('第二條\n第一條\n');
    });

    it('沒 textarea 時不會炸', () => {
        document.body.innerHTML = '';
        expect(() => addLog('安全')).not.toThrow();
    });
});

describe('formatUserName', () => {
    it('有 display-name 時顯示 display-name(username)', () => {
        const tags = { 'display-name': '橘子', username: 'orange' };
        expect(formatUserName(tags)).toBe('橘子(orange)');
    });

    it('沒有 display-name 時只顯示 username', () => {
        const tags = { 'display-name': '', username: 'orange' };
        expect(formatUserName(tags)).toBe('orange');
    });

    it('display-name 為 undefined 時只顯示 username', () => {
        const tags = { username: 'orange' };
        expect(formatUserName(tags)).toBe('orange');
    });
});

describe('formatTimestamp', () => {
    it('將 tmi 時間戳轉為 sv-SE 格式', () => {
        const ts = '1700000000000';
        const result = formatTimestamp(ts);
        // sv-SE 格式為 YYYY-MM-DD HH:MM:SS
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('接受數字型別', () => {
        const result = formatTimestamp(1700000000000);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
});

describe('shouldReply', () => {
    it('有遊戲名稱且 replyGameName 不包含時回傳 true', () => {
        expect(shouldReply('Elden Ring', '目前沒有遊戲')).toBe(true);
    });

    it('replyGameName 已包含遊戲名稱時回傳 false', () => {
        expect(shouldReply('Elden Ring', '遊戲名稱：Elden Ring')).toBe(false);
    });

    it('currentGameName 為空字串時回傳 false', () => {
        expect(shouldReply('', '任何內容')).toBe(false);
    });

    it('currentGameName 為 null/undefined 時回傳 false', () => {
        expect(shouldReply(null, '')).toBe(false);
        expect(shouldReply(undefined, '')).toBe(false);
    });
});

describe('replaceGamePlaceholder', () => {
    it('替換 {game} 為遊戲名稱', () => {
        expect(replaceGamePlaceholder('目前遊戲：{game}', 'Elden Ring'))
            .toBe('目前遊戲：Elden Ring');
    });

    it('沒有 {game} 時原樣回傳', () => {
        expect(replaceGamePlaceholder('沒有佔位符', 'Elden Ring'))
            .toBe('沒有佔位符');
    });

    it('只替換第一個 {game}', () => {
        expect(replaceGamePlaceholder('{game} and {game}', 'X'))
            .toBe('X and {game}');
    });
});

describe('getOverrideWarningText', () => {
    it('customName 有值時回傳警告字串', () => {
        expect(getOverrideWarningText('Sura Demo')).toContain('已覆寫 Steam 結果');
        expect(getOverrideWarningText('Sura Demo')).toContain('「Sura Demo」');
    });

    it('customName 為空時回傳空字串', () => {
        expect(getOverrideWarningText('')).toBe('');
    });
});

describe('getTemplateWarningText', () => {
    it('template 不含 {game} 時回傳警告', () => {
        expect(getTemplateWarningText('硬寫不用佔位符')).toContain('Template 缺少 {game}');
    });

    it('template 含 {game} 時回傳空字串', () => {
        expect(getTemplateWarningText('遊戲：{game}')).toBe('');
    });

    it('template 為空時回傳空字串（empty 不算 will-break）', () => {
        expect(getTemplateWarningText('')).toBe('');
    });
});

describe('translateIrcError', () => {
    it('msg_duplicate 翻譯成重複訊息', () => {
        expect(translateIrcError('msg_duplicate')).toContain('重複訊息');
    });

    it('msg_ratelimit 翻譯成送話過快', () => {
        expect(translateIrcError('msg_ratelimit')).toContain('送話過快');
    });

    it('包含子字串也會匹配', () => {
        expect(translateIrcError('Error: msg_timedout occurred')).toContain('timeout');
    });

    it('未知錯誤回傳空字串', () => {
        expect(translateIrcError('something else')).toBe('');
    });

    it('Error 物件也能轉', () => {
        expect(translateIrcError(new Error('msg_banned'))).toContain('封鎖');
    });

    it('No response from Twitch 翻譯成 IRC 沒回應', () => {
        expect(translateIrcError('No response from Twitch')).toContain('IRC 沒回應');
    });
});
