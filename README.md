# LINE Bot (Gemini AI Integration)

這是一個整合 Google Gemini AI 的 LINE 機器人專案。具備 AI 文字聊天、語音轉文字（含自動潤飾）、影像視覺分析、**一鍵掃圖設定醫療預約提醒**、語音直接設定提醒、中翻英語音翻譯、智慧提醒事項排程，以及結合 Google Drive 的**個人專屬記憶庫**功能。本專案使用 Node.js 與 Express 框架開發，搭配 Supabase 雲端資料庫，並透過 Google OAuth2 授權整合 Google Drive 實現跨對話長期記憶，同時針對 Render 的免費方案設計了防休眠喚醒機制。

## ✨ 核心功能

1. **AI 智能對話 (Text Chat)**:
   接收使用者的文字訊息，使用 Gemini 模型產生自然生動的回覆，如同與真人對話。內建**短期記憶**（最後 10 次對話），不需重複說明背景脈絡。

2. **語音與視覺辨識 (Voice & Vision Processing)**:
   - **語音選單**：傳送語音訊息時，會彈出快速回覆選單，提供三種處理方式：
     - ✨ **幫我潤飾**：濾除口吃、語助詞，整理成通順中文逐字稿。
     - 🔤 **翻譯英文**：理解語意並翻譯成流暢自然的英文。
     - ⏰ **設定提醒**：先轉寫語音，再自動分析意圖，直接跳出提醒設定選單。
   - **影像掃描與預約提醒（單步完成）**：傳送照片給機器人，AI 會自動辨識是否為醫院預約單，若是則在描述圖片的同時，**直接彈出提醒時間選項**，無需額外輸入文字。能精確辨識診間號、預約序號、聯絡電話等細節。

3. **智慧提醒事項 (Smart Reminders)**:
   用白話文直接對機器人下達提醒指令（如「每週三晚上七點提醒我去健身」）。機器人會透過 AI 解析時間與週期，存入 Supabase 並準時推送通知。支援**互動式多重提醒選單**，可彈性選擇「前一天晚上提醒」、「提前 2 小時提醒」、「全部都要」或「都不需要」。

4. **個人專屬記憶庫 (Personal Memory via Google Drive)**:
   透過 Google OAuth2 授權後，機器人可在使用者的 Google Drive 中建立與維護 `Gemini_Memory.md` 的個人記憶檔案。Gemini 會在對話中主動識別重要資訊並摘要儲存，被問及過去細節時也會自動讀取記憶，實現跨對話長期記憶功能。

5. **靈活的動態模型切換 (Contextual Model Switching)**:
   預設對文字使用 `gemini-3.1-flash-lite-preview`，對語音與視覺使用 `gemini-3-flash-preview`。用戶可隨時輸入 `/model lite` 或 `/model flash` 切換個人偏好模型。

6. **防休眠喚醒機制 (Anti-Sleep Keep-Alive)**:
   配合外部排程服務（如 UptimeRobot），透過受 `PING_TOKEN` 保護的 `/wake-up` 端點定時喚醒 Render 伺服器。

---

## 🔧 管理員功能 (Admin Commands)

以下指令僅限 `ADMIN_LINE_USER_ID` 環境變數設定的管理員帳號使用：

| 指令 | 說明 |
| --- | --- |
| `/notify <LINE_USER_ID>` | 推播預設授權成功通知給指定用戶 |
| `/notify <LINE_USER_ID> <自訂訊息>` | 推播自訂訊息給指定用戶 |
| `/notifyall <公告內容>` | 廣播系統公告給所有已註冊用戶（版本更新/緊急通知） |

**用戶 Email 自動收集**：當未授權用戶傳送 `@gmail.com` 格式的文字時，機器人會自動將 Email 存入 Supabase `users.reported_email` 欄位，並即時推播通知管理員。

---

## 🛠️ 系統架構與技術棧

- **執行環境 (Runtime)**: Node.js
- **伺服器框架 (Framework)**: Express.js
- **資料庫 (Database)**: Supabase (`@supabase/supabase-js`)
- **串接 API**:
  - `@line/bot-sdk`: LINE Messaging API 的核心收發邏輯與 Webhook 驗證。
  - `@google/genai`: 與 Google Gemini 模型的資料傳遞，包含文字、圖片、音檔分析，以及 Function Calling（記憶讀寫）。
  - `googleapis`: Google OAuth2 授權流程與 Google Drive API 讀寫操作。
- **任務排程 (Cron)**: `node-cron` 與 `cron-parser`
- **部署平台 (Hosting)**: Render (Web Service - 免費層)
- **外部監控服務 (Monitoring)**: UptimeRobot

---

## 🚀 專案建置與執行步驟

### 第一步：本機環境準備 (Local Setup)

1. 克隆 (Clone) 此專案到你的本機環境：
   ```bash
   git clone <你的_GitHub_Repo_網址>
   cd line-bot
   ```
2. 安裝必要的套件 (Dependencies)：
   ```bash
   npm install
   ```
3. 建立環境變數設定檔：
   ```bash
   cp .env.example .env
   ```

### 第二步：設定環境變數 (.env)

| 變數名稱                 | 說明                                                                  | 取得來源                                                           |
| ----------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `CHANNEL_ACCESS_TOKEN`  | LINE 官方帳號的 Channel Access Token                                    | [LINE Developers Console](https://developers.line.biz/console/)  |
| `CHANNEL_SECRET`        | LINE 官方帳號的 Channel Secret                                          | [LINE Developers Console](https://developers.line.biz/console/)  |
| `GEMINI_API_KEY`        | Google Gemini 的 API 密鑰                                              | [Google AI Studio](https://aistudio.google.com/)                 |
| `SUPABASE_URL`          | Supabase 專案的 Project URL                                            | [Supabase Dashboard](https://supabase.com/dashboard)             |
| `SUPABASE_KEY`          | Supabase 專案的 `anon` (public) key                                    | [Supabase Dashboard](https://supabase.com/dashboard)             |
| `GOOGLE_CLIENT_ID`      | Google Cloud OAuth2 用戶端 ID                                          | [Google Cloud Console](https://console.cloud.google.com/)        |
| `GOOGLE_CLIENT_SECRET`  | Google Cloud OAuth2 用戶端密碼                                          | [Google Cloud Console](https://console.cloud.google.com/)        |
| `GOOGLE_REDIRECT_URI`   | OAuth2 授權回呼網址：`https://<你的Render網址>.onrender.com/oauth2callback` | 自行設定                                                           |
| `PING_TOKEN`            | 防休眠機制安全認證碼（建議 `openssl rand -hex 16` 產生）                    | 自行產生                                                           |
| `ADMIN_LINE_USER_ID`    | 管理員的 LINE User ID，用於接收系統通知與使用管理員指令                        | 從 Supabase `users` 表的 `line_user_id` 欄位取得                    |
| `PORT`                  | (選擇性) Express 伺服器 Port，預設 `3000`                               | 自行設定                                                           |

### 第三步：Supabase 資料庫設定

在 Supabase Dashboard 的 **SQL Editor** 中執行以下初始化腳本：

**`users` 表：**
| Column                  | Type      | Notes                          |
| ----------------------- | --------- | ------------------------------ |
| `line_user_id`          | `text`    | Primary Key                    |
| `selected_model`        | `text`    | 使用者偏好的 AI 模型              |
| `google_refresh_token`  | `text`    | Google OAuth 的 Refresh Token   |
| `is_auth_completed`     | `boolean` | 是否完成 Google 授權              |
| `message_count`         | `int4`    | 訊息總量計數（推算 API 成本用）      |
| `chat_history`          | `jsonb`   | 最後 10 次對話上下文短期記憶         |
| `reported_email`        | `text`    | 未授權用戶提供的 Gmail（管理員審核用）|

新增 `reported_email` 欄位的 SQL：
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS reported_email TEXT DEFAULT NULL;
```

**`reminders` 表：**
| Column            | Type          | Notes                        |
| ----------------- | ------------- | ---------------------------- |
| `id`              | `int8`        | Primary Key, auto-increment  |
| `line_user_id`    | `text`        | 關聯 `users.line_user_id`     |
| `task`            | `text`        | 提醒事項描述                   |
| `trigger_time`    | `timestamptz` | 觸發時間 (UTC)                |
| `is_recurring`    | `boolean`     | 是否為週期性提醒                |
| `cron_expression` | `text`        | 週期性 cron 表示式 (可為 null) |
| `is_notified`     | `boolean`     | 是否已發送通知（預設 `false`）  |

### 第四步：Google Cloud OAuth2 設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) 建立專案，並啟用 **Google Drive API**。
2. 在「OAuth 同意畫面」設定完成後，建立 **OAuth 2.0 用戶端 ID**（類型選「Web 應用程式」）。
3. 在「已授權的重新導向 URI」中新增：`https://<你的Render網址>.onrender.com/oauth2callback`。
4. 在測試階段，前往「測試使用者」區塊加入測試帳號（Gmail）。
5. 將取得的 Client ID 與 Client Secret 填入 `.env` 中。

> ⚠️ **測試人員注意事項**：授權時請勿使用 LINE 內建瀏覽器，請複製連結並使用 Chrome 或 Safari 開啟，以確保 Google OAuth2 流程能正常完成。

### 第五步：Render 部署設定 (Deployment)

1. 將本機的程式碼 Commit 並 Push 到你的 GitHub 儲存庫。
2. 進入 Render Dashboard，建立新的 **Web Service** 並連結 GitHub 儲存庫。
3. 確認以下參數：
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
4. 在 **Environment** 區塊設定所有環境變數（包含 `ADMIN_LINE_USER_ID`）。
5. 部署成功後，將 LINE Developers Console 的 Webhook URL 設定為：
   `https://<你的專案名稱>.onrender.com/webhook`

### 第六步：設定 UptimeRobot 防休眠機制

1. 登入 [UptimeRobot](https://uptimerobot.com/)，點擊 **"Add New Monitor"**。
2. 設定：
   - **Monitor Type**: `HTTP(s)`
   - **URL**: `https://<你的Render網址>.onrender.com/wake-up?token=<你的_PING_TOKEN>`
   - **Monitoring Interval**: `Every 5 minutes`

---

## 📁 主要檔案結構說明

- `index.js`: 機器人核心主程式。包含 Express 伺服器、LINE Webhook 收發、Google OAuth2 授權流程、Google Drive 記憶庫讀寫、Gemini 意圖辨識（含 Function Calling）、排程任務，以及防休眠路由。
- `package.json`: 專案資訊與 npm 套件依賴。
- `.env.example`: 環境變數範本檔（不含真實金鑰）。

---

## 🔗 API 路由總覽

| 路由                | 方法   | 說明                                                |
| ------------------- | ------ | --------------------------------------------------- |
| `/webhook`          | POST   | LINE Messaging API 的 Webhook 接收端點               |
| `/wake-up`          | GET    | 防休眠喚醒端點，需帶 `?token=<PING_TOKEN>` 驗證       |
| `/auth`             | GET    | Google OAuth2 授權起始頁，需帶 `?uid=<LINE_USER_ID>` |
| `/oauth2callback`   | GET    | Google OAuth2 授權成功後的回呼端點                    |
| `/dashboard`        | GET    | Bot 管理儀表板介面 (Tailwind UI)                     |

---

## 📝 維護與修改紀錄 (Changelog)

- **[2026-03 v4]**:
  - 【重大新功能】**單步掃圖預約提醒**：傳送醫院預約單照片，AI 自動辨識並直接彈出提醒設定選單，無需再次輸入文字。
  - 【新功能】**語音設定提醒**：語音訊息新增「⏰ 設定提醒」選項，說一句話即可完成提醒設定。
  - 【優化】**智慧草稿清除**：每次產生新提醒選單前，自動清除同用戶的過期草稿，確保選單始終為最新版本。
  - 【新功能】**中文授權引導**：為未授權用戶提供五步驟繁體中文授權說明，並提示切換外部瀏覽器避免 LINE 相容性問題。
  - 【新功能】**測試人員 Email 自動收集**：偵測未授權用戶傳送的 Gmail，自動存入資料庫並即時推播通知管理員。
  - 【新功能】**管理員廣播指令** `/notifyall`：支援向所有用戶發送版本更新或緊急系統公告。
  - 【新功能】**管理員推播指令** `/notify`：可直接從 LINE 推播授權成功通知給特定測試人員。
- **[2026-03 v3]**:
  - 【核心改版】將資料庫從 MongoDB Atlas 全面遷移至 **Supabase**。
  - 【重大新功能】新增 **Google Drive 個人記憶庫**功能，透過 Gemini Function Calling 讓 AI 主動管理記憶。
  - 新增 `/auth` 與 `/oauth2callback` OAuth2 授權路由。
- **[2026-03 v2]**:
  - 【核心改版】導入 MongoDB Atlas，新增提醒事項系統（單次/週期推播）。
  - 【多模態更新】新增圖片讀取分析（base64 vision）功能。
  - 【效能優化】新增動態模型決策與 `/model` 手動覆寫指令。
  - 新增 `/wake-up` 防休眠路由。
