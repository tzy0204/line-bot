# LINE Bot (Gemini AI Integration)

這是一個整合 Google Gemini AI 的 LINE 機器人專案。具備 AI 文字聊天、語音轉文字（含自動潤飾）、影像視覺分析、中翻英語音翻譯、智慧提醒事項排程，以及結合 Google Drive 的**個人專屬記憶庫**功能。本專案使用 Node.js 與 Express 框架開發，搭配 Supabase 雲端資料庫作為持久化儲存，並透過 Google OAuth2 授權整合 Google Drive 實現跨對話長期記憶，同時針對 Render 的免費方案設計了防休眠喚醒機制。

## ✨ 核心功能

1. **AI 智能對話 (Text Chat)**:
   接收使用者的文字訊息，使用 Gemini 模型產生自然生動的回覆，就像和真人對話一樣。
2. **語音與視覺辨識 (Voice & Vision Processing)**:
   - **語音潤飾/翻譯**：傳送語音訊息時，會彈出快速回覆選單。機器人能聽懂意思並濾除口吃及冗言贅字，整理成通順的【中文逐字稿】或流暢的【英文翻譯】。
   - **影像解析**：直接傳送圖片給機器人，AI 會運用強大的視覺理解能力詳細描述圖片內容。
3. **智慧提醒事項 (Smart Reminders)**:
   用白話文直接對機器人下達提醒指令 (如「每週三晚上七點提醒我去健身」、「查詢本週提醒」、「幫我取消喝水提醒」)。機器人會透過 AI 解析時間與週期，存入 Supabase 資料庫並透過 cron job 準時推送通知給您。
4. **個人專屬記憶庫 (Personal Memory via Google Drive)**:
   透過 Google OAuth2 授權後，機器人可在使用者的 Google Drive 中建立與維護名為 `Gemini_Memory.md` 的個人記憶檔案。Gemini 會在對話中主動識別重要資訊並摘要儲存，被問及過去細節時也會自動讀取記憶來回答，實現真正的跨對話長期記憶功能。
5. **靈活的動態模型切換 (Contextual Model Switching)**:
   為了在效能與 API Token 成本間取得完美平衡，系統預設對文字操作使用 `gemini-3.1-flash-lite-preview` 模型，對語音與視覺解析使用高智商的 `gemini-3-flash-preview`。用戶也可隨時輸入 `/model lite` 或 `/model flash` 指令來強制變更自身的專屬預設模型。
6. **防休眠喚醒機制 (Anti-Sleep Keep-Alive)**:
   Render 面臨 15 分鐘無網路請求即休眠的限制。配合外部排程服務（如 UptimeRobot），透過受 `PING_TOKEN` 保護的 `/wake-up` 端點定時喚醒伺服器。

---

## 🛠️ 系統架構與技術棧

- **執行環境 (Runtime)**: Node.js
- **伺服器框架 (Framework)**: Express.js
- **資料庫 (Database)**: Supabase (`@supabase/supabase-js`)
- **串接 API**:
  - `@line/bot-sdk`: 處理 LINE Messaging API 的核心收發邏輯與 Webhook 驗證。
  - `@google/genai`: 處理與 Google Gemini 模型的資料傳遞，包含純文字、圖片與音檔 (Base64) 分析，以及 Function Calling (記憶讀寫)。
  - `googleapis`: 處理 Google OAuth2 授權流程與 Google Drive API 的讀寫操作。
- **任務排程 (Cron)**: `node-cron` 與 `cron-parser` (處理週期性任務計算)
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
   從範本檔複製一份 `.env` 檔案，並準備填寫真實的密鑰。
   ```bash
   cp .env.example .env
   ```

### 第二步：設定環境變數 (.env)

你需要前往以下平台取得對應的金鑰，並填入 `.env` 檔案中：

| 變數名稱                 | 說明                                                                                                   | 取得來源                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `CHANNEL_ACCESS_TOKEN`  | LINE 官方帳號的 Channel Access Token                                                                     | [LINE Developers Console](https://developers.line.biz/console/)  |
| `CHANNEL_SECRET`        | LINE 官方帳號的 Channel Secret                                                                           | [LINE Developers Console](https://developers.line.biz/console/)  |
| `GEMINI_API_KEY`        | Google Gemini 的 API 密鑰                                                                               | [Google AI Studio](https://aistudio.google.com/)                 |
| `SUPABASE_URL`          | Supabase 專案的 Project URL                                                                             | [Supabase Dashboard](https://supabase.com/dashboard)             |
| `SUPABASE_KEY`          | Supabase 專案的 `anon` (public) key                                                                     | [Supabase Dashboard](https://supabase.com/dashboard)             |
| `GOOGLE_CLIENT_ID`      | Google Cloud OAuth2 用戶端 ID                                                                            | [Google Cloud Console](https://console.cloud.google.com/)        |
| `GOOGLE_CLIENT_SECRET`  | Google Cloud OAuth2 用戶端密碼                                                                            | [Google Cloud Console](https://console.cloud.google.com/)        |
| `GOOGLE_REDIRECT_URI`   | OAuth2 授權回呼網址，格式：`https://<你的Render網址>.onrender.com/oauth2callback`                              | 自行設定                                                           |
| `PING_TOKEN`            | 防休眠機制的安全認證碼（建議使用 `openssl rand -hex 16` 產生的 32 碼亂數）                                       | 自行產生                                                           |
| `PORT`                  | (選擇性) Express 伺服器運行的 Port，預設為 `3000`                                                            | 自行設定                                                           |

### 第三步：Supabase 資料庫設定

在 Supabase Dashboard 中建立以下兩張資料表：

**`users` 表：**
| Column                  | Type      | Notes                        |
| ----------------------- | --------- | ---------------------------- |
| `line_user_id`          | `text`    | Primary Key                  |
| `selected_model`        | `text`    | 使用者偏好的 AI 模型            |
| `google_refresh_token`  | `text`    | Google OAuth 的 Refresh Token |
| `is_auth_completed`     | `boolean` | 是否完成 Google 授權            |
| `message_count`         | `int4`    | 推算 API 成本用的訊息總量計數     |
| `chat_history`          | `jsonb`   | 儲存最後 10 次的對話上下文記憶     |

**`reminders` 表：**
| Column            | Type          | Notes                        |
| ----------------- | ------------- | ---------------------------- |
| `id`              | `int8`        | Primary Key, auto-increment  |
| `line_user_id`    | `text`        | 關聯 `users.line_user_id`     |
| `task`            | `text`        | 提醒事項描述                    |
| `trigger_time`    | `timestamptz` | 觸發時間 (UTC)                 |
| `is_recurring`    | `boolean`     | 是否為週期性提醒                 |
| `cron_expression` | `text`        | 週期性 cron 表示式 (可為 null)   |
| `is_notified`     | `boolean`     | 是否已發送通知 (預設 `false`)    |

### 第四步：Google Cloud OAuth2 設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) 建立專案，並啟用 **Google Drive API**。
2. 在「OAuth 同意畫面」設定完成後，建立 **OAuth 2.0 用戶端 ID**（類型選「Web 應用程式」）。
3. 在「已授權的重新導向 URI」中新增：`https://<你的Render網址>.onrender.com/oauth2callback`。
4. 將取得的 Client ID 與 Client Secret 填入 `.env` 中。

### 第五步：Render 部署設定 (Deployment)

1. 將本機的程式碼 Commit 並 Push 到你的 GitHub 儲存庫。
2. 進入 Render 的 Dashboard，建立一個新的 **Web Service**，並連結你的 GitHub 儲存庫。
3. 在 Render 的設定中確認以下參數：
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
4. **設定環境變數 (Environment Variables)**：
   **【非常重要】** 請在 Render 的 Environment 區塊，把第二步中所有的環境變數完整新增上去。
5. 等待部署成功後，你會獲得一個 `https://<你的專案名稱>.onrender.com` 的網址。
6. 回到 LINE Developers Console 的 **Messaging API 頁籤**，將 **Webhook URL** 設定為：
   `https://<你的專案名稱>.onrender.com/webhook`
   並開啟「使用 Webhook (Use webhook)」選項。

### 第六步：設定 UptimeRobot 防休眠機制

為了讓免費版的 Render 伺服器保持 24 小時清醒：

1. 註冊並登入 [UptimeRobot](https://uptimerobot.com/)。
2. 點擊 **"Add New Monitor"** 建立監控。
3. 設定參數如下：
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: 隨意設定，例如 `LINE Bot Keep Alive`
   - **URL (or IP)**: 輸入你專屬的喚醒網址，格式如下（請替換尖括號內容）：
     `https://<你的Render網址>.onrender.com/wake-up?token=<你的_PING_TOKEN>`
   - **Monitoring Interval**: 保持預設的 `Every 5 minutes`。
4. 設定聯絡信箱後點擊 Create Monitor。
5. 這樣 UptimeRobot 就會每 5 分鐘自動帶密碼喚醒服務，確保使用者發送訊息時不會遇到冷啟動現象。

---

## 📁 主要檔案結構說明

- `index.js`: 機器人的核心主程式。包含 Express 伺服器啟動、LINE Webhook 收發邏輯、Google OAuth2 授權流程、Google Drive 記憶庫讀寫、Gemini 意圖辨識（含 Function Calling）、排程任務 (`cron.schedule`)，以及防休眠路由。
- `package.json`: 記錄專案資訊與所需依賴的 npm 套件。
- `.env.example`: 環境變數的範本檔，上傳到 GitHub 交換配置使用，不包含真實金鑰。

---

## 🔗 API 路由總覽

| 路由                | 方法   | 說明                                                |
| ------------------- | ------ | --------------------------------------------------- |
| `/webhook`          | POST   | LINE Messaging API 的 Webhook 接收端點                |
| `/wake-up`          | GET    | 防休眠喚醒端點，需帶 `?token=<PING_TOKEN>` 驗證        |
| `/auth`             | GET    | Google OAuth2 授權起始頁，需帶 `?uid=<LINE_USER_ID>`  |
| `/oauth2callback`   | GET    | Google OAuth2 授權成功後的回呼端點                      |
| `/dashboard`        | GET    | Bot 管理儀表板介面 (Tailwind UI)                       |

---

## 📝 維護與修改紀錄 (Changelog)

- **[2026-03 v3]**:
  - 【核心改版】將資料庫從 MongoDB Atlas 全面遷移至 **Supabase**，簡化部署並獲得更優的 PostgreSQL 支援。
  - 【重大新功能】新增 **Google Drive 個人記憶庫**功能：透過 OAuth2 授權連結使用者的 Google Drive，以 `Gemini_Memory.md` 檔案實現跨對話的長期記憶讀寫，並運用 Gemini Function Calling 讓 AI 主動管理記憶。
  - 新增 `/auth` 與 `/oauth2callback` OAuth2 授權路由。
- **[2026-03 v2]**:
  - 【核心改版】導入 MongoDB Atlas，新增了具有推播與單次/週期擴展能力的「提醒事項」系統。
  - 【多模態更新】新增了圖片讀取分析 (`base64` vision) 功能。
  - 【效能優化】新增動態模型決策：依據圖片/語音與文字複雜度的差異，智慧切換 `gemini-3-flash-preview` 及 `gemini-3.1-flash-lite-preview` 模型，並開放 `/model` 手動覆寫設定功能以節省成本。
  - 新增 `/wake-up` 防休眠路由。
