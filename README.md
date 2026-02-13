# TwitchSelfReply

Twitch 聊天室自動回覆工具 ── 使用自己的帳號，自動回覆 `!遊戲` 指令並更新遊戲狀態。

## 線上使用

**https://marsantony.github.io/TwitchSelfReply/**

## 功能

- **自動回覆** ── 偵測 `!遊戲` 指令，自動回覆目前遊戲名稱
- **MOD 指令更新** ── 透過 `!command edit` 更新 NightBot/StreamElements 的遊戲指令
- **Steam 遊戲偵測** ── 串接 Steam API，自動抓取目前正在玩的遊戲
- **自訂遊戲名稱** ── 可手動輸入遊戲名稱，優先於 Steam 偵測結果
- **對話紀錄** ── 即時記錄所有回覆與被 @TAG 的訊息

## 使用方式

1. 輸入 Twitch 帳號與 [OAuth 密碼](https://twitchapps.com/tmi/)
2. 設定 `!遊戲指令 Template`，使用 `{game}` 作為遊戲名稱佔位符
3. 選擇功能：
   - **開始自動回覆** ── 偵測到 `!遊戲` 時自動回覆
   - **開始自動回覆並更新(MOD)** ── 回覆 + 更新 NightBot 指令
   - **立即回覆並更新(MOD)** ── 不等指令，立即執行一次

## 技術

- [tmi.js](https://github.com/tmijs/tmi.js) ── Twitch IRC 連線
- Steam Cloud Function ── 取得 Steam 遊戲狀態
- Bootstrap 5 ── UI 介面
- LocalStorage ── 記住帳號密碼設定
