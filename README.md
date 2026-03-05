# LINE Bot (Gemini AI Integration)

這是一個整合 Google Gemini AI 的 LINE 機器人專案。具備 AI 文字聊天、語音轉文字（含自動潤飾）以及中翻英語音翻譯功能。本專案使用 Node.js 與 Express 框架開發，並針對 Render 的免費方案（Free Tier）實作了安全的自動喚醒機制（Keep-Alive），以防止伺服器休眠。

## ✨ 核心功能

1. **AI 智能對話 (Text Chat)**: 
   接收使用者的文字訊息，串接 Gemini 2.5 Flash 模型產生自然生動的回覆，就像和真人對話一樣。
2. **語音轉寫與智能潤飾 (Voice Transcription & Refinement)**: 
   當使用者傳送語音訊息時，會彈出快速回覆選單。選擇「幫我潤飾」後，機器人會下載語音、精準辨識內容，並透過 AI 自動消除口吃、贅詞與自我修正的片段，最後輸出通順、邏輯連貫的中文句子。
3. **語音即時翻譯 (Voice Translation)**: 
   在選單中選擇「翻譯英文」後，機器人會辨識語音內容，忽略口誤片段並精煉語句，直接回覆流暢自然的英文翻譯。
4. **防休眠喚醒機制 (Anti-Sleep / Keep-Alive)**: 
   Render 面臨 15 分鐘無網路請求即休眠的限制。為了解決此問題，本專案提供了一個受保護的 `/wake-up` 端點。配合外部排程服務（如 UptimeRobot），能定時喚醒伺服器，同時透過專屬的 Token 認證，防止受到惡意掃描與網頁爬蟲攻擊，確保資源與免費額度安全。

---

## 🛠️ 系統架構與技術棧

- **執行環境 (Runtime)**: Node.js
- **伺服器框架 (Framework)**: Express.js
- **串接 API**: 
  - `@line/bot-sdk`: 處理 LINE Messaging API 的核心收發邏輯與 Webhook 驗證。
  - `@google/genai`: 處理與 Google Gemini 模型的資料傳遞，包含純文字與音檔 (Base64) 分析。
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

你需要前往 [LINE Developers Console](https://developers.line.biz/console/) 以及 [Google AI Studio](https://aistudio.google.com/) 取得對應的金鑰，並填入 `.env` 檔案中：

- `CHANNEL_ACCESS_TOKEN`: LINE 官方帳號的 Channel Access Token (需發行)。
- `CHANNEL_SECRET`: LINE 官方帳號的 Channel Secret。
- `GEMINI_API_KEY`: Google Gemini 的 API 密鑰。
- `PORT`: (選擇性) 指定 Express 伺服器運行的 Port，預設為 `3000`。
- **`PING_TOKEN`**: **這是防休眠機制的專屬安全認證碼。** 請使用高強度的隨機字串（建議使用如 `openssl rand -hex 16` 產生的 32 碼亂數）。**千萬不要使用容易被猜到的單字。**

### 第三步：Render 部署設定 (Deployment)

1. 將本機的程式碼 Commit 並 Push 到你的 GitHub 儲存庫。
2. 進入 Render 的 Dashboard，建立一個新的 **Web Service**，並連結你的 GitHub 儲存庫。
3. 在 Render 的設定中確認以下參數：
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
4. **設定環境變數 (Environment Variables)**：
   **【非常重要】** 請在 Render 的 Environment 區塊，把你在第二步設定的 5 個變數（特別是 `PING_TOKEN`）完整新增上去。
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

- `index.js`: 機器人的核心主程式。包含 Express 伺服器的啟動宣告、`/webhook` 的訊息處理邏輯（文字與音檔）、Gemini 的 Prompt 設定，以及安全的 `/wake-up` 防休眠路由。
- `package.json`: 記錄專案資訊與所需依賴的 npm 套件。
- `test-handler.js`: 用於本機快速模擬與測試 LINE 事件邏輯的腳本（不會正式上線處理資料）。
- `.env.example`: 環境變數的範本檔，上傳到 GitHub 交換配置使用，不包含真實金鑰。

---

## 📝 維護與修改紀錄 (Changelog)

- **[2026-03]**: 
  - 導入 Google Gemini 2.5 Flash SDK 取代舊版寫法，新增 Voice 轉 Text (潤飾/翻譯) 功能。
  - 新增 `/wake-up` 防休眠路由。
  - 為了防止被掃描攻擊 `/wake-up` 端點，引入 `PING_TOKEN` 環境變數作為身分驗證，並廢棄了不安全的明文範例密碼。
  - 建立詳細的 `README.md` 部署計畫書。
