const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();
const mongoose = require('mongoose');
const Reminder = require('./models/Reminder');
const UserSetting = require('./models/UserSetting');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Import Google Gen AI SDK
const { GoogleGenAI } = require('@google/genai');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// create LINE SDK client
const client = new line.Client(config);

// Initialize Gemini API client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// create Express app
// about Express itself: https://expressjs.com/
const app = express();

// 設計一個受保護的喚醒端點
app.get('/wake-up', (req, res) => {
  // 檢查請求中是否帶有正確的 token (?token=...)
  const token = req.query.token;

  // 如果沒有 token，或是 token 不正確，就回傳 403 Forbidden 裝死
  if (token !== process.env.PING_TOKEN) {
    return res.status(403).send('Forbidden');
  }

  // Token 正確，印出 Log 並回傳 200 讓 UptimeRobot 知道伺服器活著
  console.log('⏰ [UptimeRobot] Ping received. Server is awake!');
  res.status(200).send('Awake');
});

// register a webhook handler with middleware
// about the middleware, please refer to doc
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      if (err.response) {
        console.error('LINE API Error:', JSON.stringify(err.response.data, null, 2));
      } else {
        console.error('Webhook Error:', err.message || err);
      }
      res.status(500).end();
    });
});

// event handler
async function handleEvent(event) {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {  // 1. 處理一般文字訊息 (一般 AI 聊天或設定/查詢/取消提醒)
    if (event.type === 'message' && event.message.type === 'text') {
      const userText = event.message.text.trim();

      // 處理 /model 指令
      if (userText.startsWith('/model')) {
        const args = userText.split(' ');
        const option = args[1] ? args[1].toLowerCase() : null;

        if (!option) {
          const setting = await UserSetting.findOne({ userId: event.source.userId });
          const currentModel = setting ? setting.preferredModel : 'gemini-3.1-flash-lite-preview';
          return await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `🤖 目前使用的 AI 模型為：${currentModel}\n你可以輸入 /model lite 或 /model flash 來切換。`
          });
        }

        let newModel = '';
        if (option === 'lite') {
          newModel = 'gemini-3.1-flash-lite-preview';
        } else if (option === 'flash') {
          newModel = 'gemini-3.1-flash';
        } else {
          return await client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 無效的選項，請使用 /model lite 或 /model flash' });
        }

        // 更新或建立設定
        await UserSetting.findOneAndUpdate(
          { userId: event.source.userId },
          { preferredModel: newModel },
          { upsert: true, new: true }
        );

        return await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `✅ 已成功為你切換至 ${newModel} 模型！`
        });
      }

      const now = new Date();
      // 使用 Asia/Taipei 時區的字串，讓 Gemini 知道現在的台灣時間
      const nowStr = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });

      const prompt = `使用者說了一句話：「${userText}」

請分析這句話的意圖，判斷屬於以下哪一種操作。現在的台灣時間是：${nowStr}

【意圖 1：CREATE (建立提醒)】
如果使用者要求「設定提醒事項」或「定時叫我做某事」，請進一步判斷這是一個「單次提醒」還是「週期性提醒（例如：每週三晚上七點、每天早上八點）」。
推算邏輯請以台灣時間為準，並回傳以下嚴格的 JSON 格式：
{
  "intent": "CREATE",
  "task": "提醒的具體事情（例如：回診打疫苗、去健身）",
  "triggerTime": "ISO 8601 格式的 UTC 時間字串，代表『下一次』要觸發的時間（例如：2024-05-15T12:00:00.000Z，需轉成 UTC）",
  "isRecurring": true 或 false,
  "cronExpression": "如果是週期性提醒，提供標準的 cron 表示式字串(分 時 日 月 星期)，時區以 UTC 計算。若非週期性請填 null"
}

【意圖 2：QUERY (查詢提醒)】
如果使用者詢問接下來有哪些提醒（例如：「本週有哪些提醒」、「我有設定什麼提醒嗎」），請回傳以下 JSON 格式：
{
  "intent": "QUERY"
}

【意圖 3：CANCEL (取消提醒)】
如果使用者要求取消某個現有的提醒（例如：「取消下週三的健身」、「幫我把喝水提醒關掉」），請萃取出他想要取消的目標關鍵字，並回傳以下 JSON 格式：
{
  "intent": "CANCEL",
  "cancelTarget": "使用者想取消的任務關鍵字（例如：健身、喝水）"
}

【意圖 4：CHAT (一般聊天)】
如果是以上皆非的一般聊天或問問題，請嚴格回傳以下 JSON 格式：
{
  "intent": "CHAT",
  "replyText": "你作為 AI 助理的平易近人繁體中文回覆內容"
}

請務必只回傳合法的 JSON 字串，不要有其他任何前後文、Markdown 語法或解釋。`;

      // 查詢用戶設定，決定要使用的模型
      const userSetting = await UserSetting.findOne({ userId: event.source.userId });
      const targetModel = userSetting ? userSetting.preferredModel : 'gemini-3.1-flash-lite-preview';

      const response = await ai.models.generateContent({
        model: targetModel,
        contents: prompt,
      });

      let responseText = response.text.trim();
      let parsedData = null;

      // 嘗試解析 JSON
      try {
        const jsonStr = responseText.replace(/^\`\`\`json/m, '').replace(/\`\`\`$/m, '').trim();
        if (jsonStr.startsWith('{')) {
          parsedData = JSON.parse(jsonStr);
        }
      } catch (e) {
        // 解析失敗，當作一般回覆
        return await client.replyMessage(event.replyToken, { type: 'text', text: responseText });
      }

      if (parsedData) {
        if (parsedData.intent === 'CREATE') {
          // 寫入 MongoDB
          const newReminder = new Reminder({
            userId: event.source.userId,
            task: parsedData.task,
            triggerTime: new Date(parsedData.triggerTime),
            isRecurring: parsedData.isRecurring || false,
            cronExpression: parsedData.cronExpression || undefined
          });
          await newReminder.save();

          const localTime = new Date(parsedData.triggerTime).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, dateStyle: 'short', timeStyle: 'short' });
          return await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `✅ 幫您記下來了！\n\n我會在 ${localTime} 提醒您：\n👉 ${parsedData.task}`
          });
        }
        else if (parsedData.intent === 'QUERY') {
          // 查詢本週提醒 (未來 7 天內)
          const start = new Date();
          const end = new Date();
          end.setDate(end.getDate() + 7);

          const reminders = await Reminder.find({
            userId: event.source.userId,
            isNotified: false,
            triggerTime: { $gte: start, $lte: end }
          }).sort({ triggerTime: 1 });

          if (reminders.length === 0) {
            return await client.replyMessage(event.replyToken, { type: 'text', text: '📅 未來七天內，您目前沒有任何已設定的提醒事項喔！' });
          }

          let replyStr = '📅 【未來七天提醒事項】\n\n';
          reminders.forEach((r, index) => {
            const timeStr = new Date(r.triggerTime).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, dateStyle: 'short', timeStyle: 'short' });
            const recurStr = r.isRecurring ? ' (🔄週期)' : '';
            replyStr += `${index + 1}. ${timeStr}\n👉 ${r.task}${recurStr}\n\n`;
          });

          return await client.replyMessage(event.replyToken, { type: 'text', text: replyStr.trim() });
        }
        else if (parsedData.intent === 'CANCEL' && parsedData.cancelTarget) {
          // 取消提醒 (尋找 task 包含關鍵字的)
          const targetRegex = new RegExp(parsedData.cancelTarget, 'i');
          const deletedResult = await Reminder.deleteMany({
            userId: event.source.userId,
            isNotified: false,
            task: { $regex: targetRegex }
          });

          if (deletedResult.deletedCount > 0) {
            return await client.replyMessage(event.replyToken, { type: 'text', text: `🗑️ 已經為您取消了 ${deletedResult.deletedCount} 筆與「${parsedData.cancelTarget}」相關的提醒。` });
          } else {
            return await client.replyMessage(event.replyToken, { type: 'text', text: `👀 找不到與「${parsedData.cancelTarget}」相關的有效提醒喔！您可以先查詢目前的提醒清單再試試看。` });
          }
        }
        else if (parsedData.intent === 'CHAT' && parsedData.replyText) {
          // 一般聊天回覆
          return await client.replyMessage(event.replyToken, { type: 'text', text: parsedData.replyText });
        }
      }

      // Fallback
      return await client.replyMessage(event.replyToken, { type: 'text', text: '抱歉，我不太懂您的意思，請再說一次。' });
    }

    // 2. 處理語音訊息 (彈出快速回覆選單)
    if (event.type === 'message' && event.message.type === 'audio') {
      return await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '收到語音！請選擇您希望我幫忙處理的方式：',
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'postback',
                label: '✨ 幫我潤飾',
                data: `action=polish&msgId=${event.message.id}`,
                displayText: '請幫我潤飾這段語音'
              }
            },
            {
              type: 'action',
              action: {
                type: 'postback',
                label: '🔤 翻譯英文',
                data: `action=translate&msgId=${event.message.id}`,
                displayText: '請幫我將這段語音翻譯成英文'
              }
            }
          ]
        }
      });
    }

    // 3. 處理使用者點擊快速回覆的事件 (進行語音處理)
    if (event.type === 'postback' && event.postback.data) {
      const data = new URLSearchParams(event.postback.data);
      const action = data.get('action');
      const msgId = data.get('msgId');

      if ((action === 'polish' || action === 'translate') && msgId) {
        // 從 LINE 伺服器下載語音檔案
        const stream = await client.getMessageContent(msgId);
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);
        const base64Audio = audioBuffer.toString('base64');

        // 準備 Gemini Prompt
        const prompt = action === 'polish'
          ? `請仔細聆聽這段語音並將其轉寫成文字。說話者可能會有口吃、停頓、無意義的語助詞（嗯、啊等），或者在說話過程中進行「自我修正」（例如：「禮拜二想吃橘子...不對，禮拜二我想吃香蕉」）。
          請你：
          1. 準確理解說話者「最終想表達的真正意思」，自動套用他語氣中的修正內容。
          2. 去除所有的口吃、冗言贅字與停頓。
          3. 將零碎的語句重新理順，組合成通順、邏輯連貫的中文句子。
          4. 直接輸出最終潤飾好的文字即可，不要包含任何解釋或多餘的回覆。`
          : `請仔細聆聽這段語音。說話者可能會有口吃、停頓、無意義的語助詞，或者在說話過程中進行「自我修正」（例如：「禮拜三去開會...喔不是，是禮拜四」）。
          請你：
          1. 準確理解說話者「最終想表達的真正意思」，自動套用他語氣中的修正內容，忽略口誤的部分。
          2. 去除所有的口語贅詞、猶豫與停頓。
          3. 將零碎的語句重新調整，組成通順且邏輯連貫的英文句子。
          4. 最後再精煉並潤飾文字，使其讀起來非常自然流暢，直接輸出最終的英文翻譯結果即可，不要包含任何解釋或多餘的回覆。`;

        // 查詢用戶設定的偏好模型
        const userSetting = await UserSetting.findOne({ userId: event.source.userId });
        const targetModel = userSetting ? userSetting.preferredModel : 'gemini-3.1-flash-lite-preview';

        // 傳送給 Gemini 處理
        const response = await ai.models.generateContent({
          model: targetModel,
          contents: [
            prompt,
            {
              inlineData: {
                data: base64Audio,
                mimeType: 'audio/mp4' // LINE 語音多為 m4a/mp4
              }
            }
          ]
        });

        return await client.replyMessage(event.replyToken, { type: 'text', text: response.text });
      }
    }

    // 忽略其他事件
    return Promise.resolve(null);
  } catch (error) {
    if (error.response) {
      console.error('LINE/Gemini API Error:', JSON.stringify(error.response.data || error.response, null, 2));
    } else {
      console.error('Error handling event:', error.message || error);
    }

    if (event.replyToken) {
      try {
        return await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '抱歉，處理過程中發生了一點錯誤，請稍後再試。'
        });
      } catch (fallbackError) {
        console.error('Fallback error:', fallbackError.message);
      }
    }
    return Promise.resolve(null);
  }
}

const cron = require('node-cron');
const cronParser = require('cron-parser');

// 設定排程：每分鐘檢查一次過期且尚未通知的提醒
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    // 找出所有觸發時間小於等於現在，且尚未通知的提醒事項
    const dueReminders = await Reminder.find({
      triggerTime: { $lte: now },
      isNotified: false
    });

    if (dueReminders.length > 0) {
      console.log(`⏰ 找到 ${dueReminders.length} 筆需要發送的提醒`);

      for (const reminder of dueReminders) {
        // 主動推播訊息
        await client.pushMessage(reminder.userId, {
          type: 'text',
          text: `⏰ 溫馨提醒：\n時間到囉！\n\n👉 ${reminder.task}`
        });

        if (reminder.isRecurring && reminder.cronExpression) {
          // 如果是週期性提醒，算出下一次的時間，並更新 triggerTime
          try {
            const interval = cronParser.parseExpression(reminder.cronExpression, {
              currentDate: new Date(), // 以現在時間為基準算下一次
              tz: 'UTC' // 確保內部運算用 UTC 與資料庫一致
            });
            reminder.triggerTime = interval.next().toDate();
            console.log(`🔄 週期性提醒已重新排程於：${reminder.triggerTime}`);
          } catch (err) {
            console.error('❌ 解析 cronExpression 失敗，改為單次提醒:', err);
            reminder.isNotified = true;
          }
        } else {
          // 單次提醒，標記為已發送
          reminder.isNotified = true;
        }

        await reminder.save();
      }
    }
  } catch (err) {
    console.error('❌ 執行排程提醒發生錯誤:', err);
  }
});

// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});
