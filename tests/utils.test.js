import { describe, it, expect } from 'vitest';
import { addLog, formatUserName, formatTimestamp, shouldReply, replaceGamePlaceholder } from '../src/utils.js';

describe('addLog', () => {
    it('新訊息插入 textarea 最前面', () => {
        const el = { value: '' };
        addLog(el, '第一條');
        expect(el.value).toBe('第一條\r\n');

        addLog(el, '第二條');
        expect(el.value).toBe('第二條\r\n第一條\r\n');
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
