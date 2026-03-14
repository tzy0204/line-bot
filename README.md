# LINE Bot (Gemini AI Integration)

這是一個整合 Google Gemini AI 的 LINE 機器人專案。具備 AI 文字聊天、語音轉文字（含自動潤飾）、影像視覺分析、中翻英語音翻譯，以及進階的「智慧提醒事項排程」功能。本專案使用 Node.js 與 Express 框架開發，並搭配 MongoDB Atlas 雲端資料庫作為持久化儲存，同時針對 Render 的免費方案設計了防休眠喚醒機制。

## ✨ 核心功能

1. **AI 智能對話 (Text Chat)**: 
   接收使用者的文字訊息，使用 Gemini 模型產生自然生動的回覆，就像和真人對話一樣。
2. **語音與視覺辨識 (Voice & Vision Processing)**: 
   - **語音潤飾/翻譯**：傳送語音訊息時，會彈出選單。機器人能聽懂意思並濾除口吃及冗言贅字，整理成通順的【中文逐字稿】或流暢的【英文翻譯】。
   - **影像解析**：直接傳送圖片給機器人，AI 會運用強大的視覺理解能力詳細描述圖片內容。
3. **智慧提醒事項 (Smart Reminders)**: 
   用白話文直接對機器人下達提醒指令 (如「每週三晚上七點提醒我去健身」、「查詢本週提醒」、「幫我取消喝水提醒」)。機器人會透過 AI 解析時間與週期，存入資料庫並透過 cron job 準時推送通知給您。
4. **靈活的動態模型切換 (Contextual Model Switching)**: 
   為了在效能與 API Token 成本間取得完美平衡，系統預設對文字操作使用 `gemini-3.1-flash-lite-preview` 模型，對語音與視覺解析使用高智商的 `gemini-3-flash-preview`。用戶也可隨時輸入 `/model lite` 或 `/model flash` 指令來強制變更自身的專屬預設模型。
5. **防休眠喚醒機制 (Anti-Sleep Keep-Alive)**: 
   Render 面臨 15 分鐘無網路請求即休眠的限制。配合外部排程服務（如 UptimeRobot），透過受 `PING_TOKEN` 保護的 `/wake-up` 端點定時喚醒伺服器。

---

## 🛠️ 系統架構與技術棧

- **執行環境 (Runtime)**: Node.js
- **伺服器框架 (Framework)**: Express.js
- **資料庫 (Database)**: MongoDB Atlas (`mongoose`)
- **串接 API**: 
  - `@line/bot-sdk`: 處理 LINE Messaging API 的核心收發邏輯與 Webhook 驗證。
  - `@google/genai`: 處理與 Google Gemini 模型的資料傳遞，包含純文字、圖片與音檔 (Base64) 分析。
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

你需要前往 [LINE Developers Console](https://developers.line.biz/console/)、[Google AI Studio](https://aistudio.google.com/) 以及 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) 取得對應的金鑰，並填入 `.env` 檔案中：

- `CHANNEL_ACCESS_TOKEN`: LINE 官方帳號的 Channel Access Token。
- `CHANNEL_SECRET`: LINE 官方帳號的 Channel Secret。
- `GEMINI_API_KEY`: Google Gemini 的 API 密鑰。
- `MONGODB_URI`: MongoDB Atlas 的連線字串 (Connection String)。
- `PORT`: (選擇性) 指定 Express 伺服器運行的 Port，預設為 `3000`。
- **`PING_TOKEN`**: **這是防休眠機制的專屬安全認證碼。** 請使用高強度的隨機字串（建議使用如 `openssl rand -hex 16` 產生的 32 碼亂數）。

### 第三步：Render 部署設定 (Deployment)

1. 將本機的程式碼 Commit 並 Push 到你的 GitHub 儲存庫。
2. 進入 Render 的 Dashboard，建立一個新的 **Web Service**，並連結你的 GitHub 儲存庫。
3. 在 Render 的設定中確認以下參數：
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
4. **設定環境變數 (Environment Variables)**：
   **【非常重要】** 請在 Render 的 Environment 區塊，把你在第二步設定的 6 個變數（包含新增的 `MONGODB_URI`）完整新增上去。
5. 等待部署成功後，你會獲得一個 `https://<你的專案名稱>.onrender.com` 的網址。
6. 回到 LINE Developers Console 的 **Messaging API 頁籤**，將 **Webhook URL** 設定為：
   `https://<你的專案名稱>.onrender.com/webhook`
   並開啟「使用 Webhook (Use webhook)」選項。

### 第四步：設定 UptimeRobot 防休眠機制

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
5. 這樣 UptimeRobot 就會每 5 分鐘自動帶密碼喚醒服務，確保使用者發送訊息時不會遇到讀秒/無回應的冷啟動現象。

---

## 📁 主要檔案結構說明

- `index.js`: 機器人的核心主程式。包含 Express 伺服器的啟動宣告、LINE Webhook 的收發邏輯、Gemini 意圖辨識處理、排程任務 (`cron.schedule`)，以及防休眠路由。
- `models/`: MongoDB 的資料表結構定義目錄。
  - `Reminder.js`: 定義提醒事項的儲存結構（任務名稱、觸發時間、是否週期等）。
  - `UserSetting.js`: 定義使用者的個人偏好設定（像是存放 `/model` 選定的 AI 模型）。
- `package.json`: 記錄專案資訊與所需依賴的 npm 套件。
- `.env.example`: 環境變數的範本檔，上傳到 GitHub 交換配置使用，不包含真實金鑰。

---

## 📝 維護與修改紀錄 (Changelog)

- **[2026-03]**: 
  - 【核心改版】導入 MongoDB Atlas，新增了具有推播與單次/週期擴展能力的「提醒事項」系統。
  - 【多模態更新】新增了圖片讀取分析 (`base64` vision) 功能。
  - 【效能優化】新增動態模型決策：依據圖片/語音與文字複雜度的差異，智慧 fallback 切換 `gemini-3-flash-preview` 及 `gemini-3.1-flash-lite-preview` 模型，並開放 `/model` 手動覆寫設定功能以節省成本。
  - 新增 `/wake-up` 防休眠路由。
  - 【棄用】移除了不再需要的 `test-handler.js`，避免混淆。
