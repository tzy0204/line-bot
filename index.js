const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY. Please set them in your .env file or Render dashboard.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

// --- Google OAuth2 Setup ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// 產生授權連結的路由，帶上 LINE 用戶 ID
app.get('/auth', (req, res) => {
  const uid = req.query.uid;
  if (!uid) {
    return res.status(400).send('Missing line user id (uid).');
  }

  // 產生授權 URL，並將 uid 包裝在 state 參數中帶過去
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // 需要 offline 才能取得 refresh_token
    prompt: 'consent',      // 強制顯示授權畫面，確保一定會核發 refresh_token
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state: uid              // 安全繼承 uid 狀態
  });

  res.redirect(authUrl);
});

// 接收 Google 授權成功後的回呼路由
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state; // 這是 LINE 用戶的 ID

  if (!code || !state) {
    return res.status(400).send('Authorization failed: code or state missing.');
  }

  try {
    // 拿 code 換取 token
    const { tokens } = await oauth2Client.getToken(code);

    // 如果有拿到 refresh_token，就存進 Supabase
    if (tokens.refresh_token) {
      const { error } = await supabase
        .from('users')
        .upsert(
          {
            line_user_id: state,
            google_refresh_token: tokens.refresh_token,
            is_auth_completed: true
          },
          { onConflict: 'line_user_id' }
        );

      if (error) {
        console.error('Failed to save refresh_token to Supabase:', error);
        return res.status(500).send('Database error during authorization.');
      }

      console.log(`✅ OAuth successful for user ${state}`);

      // 回覆一個簡單美觀的 HTML 成功頁面
      res.send(`
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f0fdf4; margin: 0; }
            .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
            h1 { color: #166534; }
            p { color: #374151; font-size: 1.1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🎉 授權成功！</h1>
            <p>您的專屬記憶庫已成功連結。</p>
            <p>請關閉此網頁，回到 LINE 繼續對話。</p>
          </div>
        </body>
        </html>
      `);
    } else {
      res.status(400).send('No refresh token received. Please try unlinking the app from your Google account and authorizing again.');
    }
  } catch (error) {
    console.error('Error in oauth2callback:', error);
    res.status(500).send('Authentication Error');
  }
});

// --- Google Drive Memory Helpers ---
async function getDriveClient(refreshToken) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth });
}

async function getMemoryFileId(drive) {
  const res = await drive.files.list({
    q: "name='Gemini_Memory.md' and trashed=false",
    spaces: 'drive',
    fields: 'files(id, name)'
  });
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Create if not exists
  console.log('Gemini_Memory.md not found, creating a new one...');
  const fileMetadata = { name: 'Gemini_Memory.md', mimeType: 'text/markdown' };
  const media = { mimeType: 'text/markdown', body: '# 專屬個人記憶庫\n\n' };
  const file = await drive.files.create({ resource: fileMetadata, media: media, fields: 'id' });
  return file.data.id;
}

const memoryFunctions = {
  read_personal_memory: async ({ }, refreshToken) => {
    try {
      const drive = await getDriveClient(refreshToken);
      const fileId = await getMemoryFileId(drive);
      const res = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'text' });
      return { result: res.data || '目前記憶庫是空的。' };
    } catch (e) {
      console.error('Read memory error:', e.message);
      return { error: '讀取記憶失敗' };
    }
  },
  update_personal_memory: async ({ contentToAppend }, refreshToken) => {
    try {
      const drive = await getDriveClient(refreshToken);
      const fileId = await getMemoryFileId(drive);
      // Get current content first
      const res = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'text' });
      const currentContent = res.data || '';

      const timeStr = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      const newContent = currentContent + `\n- [${timeStr}] ${contentToAppend}`;

      await drive.files.update({
        fileId: fileId,
        media: { mimeType: 'text/markdown', body: newContent }
      });
      return { result: '成功追加記憶至 Google Drive!' };
    } catch (e) {
      console.error('Update memory error:', e.message);
      return { error: '更新記憶失敗' };
    }
  }
};

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

  try {
    // 1. 處理一般文字訊息 (一般 AI 聊天或設定/查詢/取消提醒)
    if (event.type === 'message' && event.message.type === 'text') {
      const userText = event.message.text.trim();

      // 處理 /model 指令
      if (userText.startsWith('/model')) {
        const args = userText.split(' ');
        const option = args[1] ? args[1].toLowerCase() : null;

        if (!option) {
          const { data: user } = await supabase
            .from('users')
            .select('selected_model')
            .eq('line_user_id', event.source.userId)
            .single();

          const currentModel = user?.selected_model || 'gemini-3.1-flash-lite-preview';
          return await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
              type: 'text',
              text: `🤖 目前使用的 AI 模型為：${currentModel}\n你可以輸入 /model lite 或 /model flash 來切換。`
            }]
          });
        }

        let newModel = '';
        if (option === 'lite') {
          newModel = 'gemini-3.1-flash-lite-preview';
        } else if (option === 'flash') {
          newModel = 'gemini-3-flash-preview'; // 使用 3 的預覽版
        } else {
          return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '⚠️ 無效的選項，請使用 /model lite 或 /model flash' }] });
        }

        // 確保 User 存在，並更新偏好模型 (Upsert)
        const { error: upsertError } = await supabase
          .from('users')
          .upsert(
            { line_user_id: event.source.userId, selected_model: newModel },
            { onConflict: 'line_user_id' }
          );

        if (upsertError) {
          console.error('Error updating user model:', upsertError);
          return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '❌ 儲存模型設定失敗，請稍後再試。' }] });
        }

        return await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: `✅ 已成功為你切換至 ${newModel} 模型！`
          }]
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

【意圖 4：CHAT (一般聊天或記憶存取)】
如果是以上皆非的日常聊天、問答，或者是對話涉及到過去的細節、需要查閱或追加入個人專屬記憶庫時，請嚴格回傳以下 JSON 格式：
{
  "intent": "CHAT"
}

請務必只回傳合法的 JSON 字串，不要有其他任何前後文、Markdown 語法或解釋。`;

      // 查詢用戶設定，決定要使用的模型 (如果沒設定，一般文字意圖預設使用最省資源的 lite-preview)
      const { data: userSetting } = await supabase
        .from('users')
        .select('selected_model')
        .eq('line_user_id', event.source.userId)
        .single();

      const targetModel = userSetting?.selected_model || 'gemini-3.1-flash-lite-preview';

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
        return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: responseText }] });
      }

      if (parsedData) {
        if (parsedData.intent === 'CREATE') {
          // 因為提醒關聯 user，所以先確保使用者存在
          await supabase.from('users').upsert(
            { line_user_id: event.source.userId },
            { onConflict: 'line_user_id', ignoreDuplicates: true }
          );

          // 寫入 Supabase reminders table
          const { error: insertError } = await supabase.from('reminders').insert([{
            line_user_id: event.source.userId,
            task: parsedData.task,
            trigger_time: new Date(parsedData.triggerTime).toISOString(),
            is_recurring: parsedData.isRecurring || false,
            cron_expression: parsedData.cronExpression || null
          }]);

          if (insertError) {
            console.error('Insert reminder error:', insertError);
            return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '😭 儲存提醒發生錯誤，請稍後再試。' }] });
          }

          const localTime = new Date(parsedData.triggerTime).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, dateStyle: 'short', timeStyle: 'short' });
          return await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
              type: 'text',
              text: `✅ 幫您記下來了！\n\n我會在 ${localTime} 提醒您：\n👉 ${parsedData.task}`
            }]
          });
        }
        else if (parsedData.intent === 'QUERY') {
          // 查詢本週提醒 (未來 7 天內)
          const start = new Date();
          const end = new Date();
          end.setDate(end.getDate() + 7);

          const { data: reminders, error: queryError } = await supabase
            .from('reminders')
            .select('*')
            .eq('line_user_id', event.source.userId)
            .eq('is_notified', false)
            .gte('trigger_time', start.toISOString())
            .lte('trigger_time', end.toISOString())
            .order('trigger_time', { ascending: true });

          if (queryError || !reminders || reminders.length === 0) {
            return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '📅 未來七天內，您目前沒有任何已設定的提醒事項喔！' }] });
          }

          let replyStr = '📅 【未來七天提醒事項】\n\n';
          reminders.forEach((r, index) => {
            const timeStr = new Date(r.trigger_time).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, dateStyle: 'short', timeStyle: 'short' });
            const recurStr = r.is_recurring ? ' (🔄週期)' : '';
            replyStr += `${index + 1}. ${timeStr}\n👉 ${r.task}${recurStr}\n\n`;
          });

          return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: replyStr.trim() }] });
        }
        else if (parsedData.intent === 'CANCEL' && parsedData.cancelTarget) {
          // 取消提醒 (Supabase text search: ilike '%' || keyword || '%')
          const { data: deletedResult, error: deleteError } = await supabase
            .from('reminders')
            .delete()
            .eq('line_user_id', event.source.userId)
            .eq('is_notified', false)
            .ilike('task', `%${parsedData.cancelTarget}%`)
            .select(); // 取得被刪除的筆數

          if (!deleteError && deletedResult && deletedResult.length > 0) {
            return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `🗑️ 已經為您取消了 ${deletedResult.length} 筆與「${parsedData.cancelTarget}」相關的提醒。` }] });
          } else {
            return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `👀 找不到與「${parsedData.cancelTarget}」相關的有效提醒喔！您可以先查詢目前的提醒清單再試試看。` }] });
          }
        }
        else if (parsedData.intent === 'CHAT') {
          // 一般聊天回覆與個人記憶庫功能 (Function Calling)

          // 確認授權狀態
          const { data: user } = await supabase
            .from('users')
            .select('google_refresh_token, is_auth_completed')
            .eq('line_user_id', event.source.userId)
            .single();

          let systemInstruction = '';
          let tools = undefined;

          if (!user || !user.is_auth_completed || !user.google_refresh_token) {
            const authUrl = `${process.env.GOOGLE_REDIRECT_URI.replace('/oauth2callback', '')}/auth?uid=${event.source.userId}`;
            systemInstruction = `此用戶尚未授權 Google Drive。無法存取個人記憶。若對話中用戶有記憶需求，請主動且溫和地提供此授權連結請他點擊：${authUrl}`;
          } else {
            systemInstruction = `你可以使用功能呼叫 \`read_personal_memory\` 與 \`update_personal_memory\` 來管理使用者的專屬中長期記憶。遇到重要資訊時應主動摘要並儲存；被問及過去細節時主動讀取記憶。回答時如同朋友般親切自然。`;
            tools = [{
              functionDeclarations: [
                {
                  name: 'read_personal_memory',
                  description: '讀取使用者的長期記憶檔案內容'
                },
                {
                  name: 'update_personal_memory',
                  description: '將對話中出現的全新或重要的資訊摘要並追加紀錄到使用者的長期記憶中',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      contentToAppend: {
                        type: 'STRING',
                        description: '要追加儲存的記憶摘要內容（以條列重點的風格為主）'
                      }
                    },
                    required: ['contentToAppend']
                  }
                }
              ]
            }];
          }

          const chatConfig = { systemInstruction };
          if (tools) chatConfig.tools = tools;

          const chat = ai.chats.create({
            model: targetModel,
            config: chatConfig
          });

          let chatResponse = await chat.sendMessage({ message: userText });

          // 如果模型決定要呼叫 Function
          if (chatResponse.functionCalls && chatResponse.functionCalls.length > 0) {
            const call = chatResponse.functionCalls[0];
            const functionName = call.name;
            const functionArgs = call.args;

            console.log(`Executing tool: ${functionName}`, functionArgs);

            let apiResponse;
            if (memoryFunctions[functionName] && user.google_refresh_token) {
              apiResponse = await memoryFunctions[functionName](functionArgs, user.google_refresh_token);
            } else {
              apiResponse = { error: '未知的函數或尚未授權 Google' };
            }

            // 將函數執行結果送回給模型，讓模型產出最終的文字回覆
            chatResponse = await chat.sendMessage({
              message: {
                functionResponse: { name: functionName, response: apiResponse }
              }
            });
          }

          const replyText = chatResponse.text || '好的，我記下來了！';
          return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: replyText }] });
        }
      }

      // Fallback
      return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '抱歉，我不太懂您的意思，請再說一次。' }] });
    }

    // 2. 處理圖片訊息 (請 Gemini 分析圖片)
    if (event.type === 'message' && event.message.type === 'image') {
      try {
        // 從 LINE 伺服器下載圖片檔案
        const stream = await client.getMessageContent(event.message.id);
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const imageBuffer = Buffer.concat(chunks);
        const base64Image = imageBuffer.toString('base64');

        // 準備送給 Gemini 的 Prompt
        const prompt = '請發揮你身為頂尖 AI 的觀察力，詳細地用繁體中文描述這張圖片裡有什麼？請用自然、友善的語氣。';

        // 查詢用戶設定的偏好模型 (圖片分析偏向複雜理解，預設使用 3-flash-preview)
        const { data: userSetting } = await supabase
          .from('users')
          .select('selected_model')
          .eq('line_user_id', event.source.userId)
          .single();
        const targetModel = userSetting?.selected_model || 'gemini-3-flash-preview';

        // 傳送給 Gemini 處理
        const response = await ai.models.generateContent({
          model: targetModel,
          contents: [
            prompt,
            {
              inlineData: {
                data: base64Image,
                mimeType: 'image/jpeg' // LINE 回傳的圖片大部分為 jpeg
              }
            }
          ]
        });

        return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: response.text }] });
      } catch (err) {
        console.error('處理圖片失敗:', err);
        return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '抱歉，我在「看」這張圖片時睜不開眼睛，處理發生了一點錯誤。' }] });
      }
    }

    // 3. 處理語音訊息 (彈出快速回覆選單)
    if (event.type === 'message' && event.message.type === 'audio') {
      return await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
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
        }]
      });
    }

    // 4. 處理使用者點擊快速回覆的事件 (進行語音處理)
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

        // 查詢用戶設定的偏好模型 (如果沒設定，語音潤飾預設使用更聰明的 3-flash-preview)
        const { data: userSetting } = await supabase
          .from('users')
          .select('selected_model')
          .eq('line_user_id', event.source.userId)
          .single();
        const targetModel = userSetting?.selected_model || 'gemini-3-flash-preview';

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

        return await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: response.text }] });
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
        return await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: '抱歉，處理過程中發生了一點錯誤，請稍後再試。'
          }]
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
    const { data: dueReminders, error: fetchError } = await supabase
      .from('reminders')
      .select('*')
      .lte('trigger_time', now.toISOString())
      .eq('is_notified', false);

    if (fetchError) {
      console.error('Cron fetch reminders error:', fetchError);
      return;
    }

    if (dueReminders && dueReminders.length > 0) {
      console.log(`⏰ 找到 ${dueReminders.length} 筆需要發送的提醒`);

      for (const reminder of dueReminders) {
        // 主動推播訊息
        await client.pushMessage({
          to: reminder.line_user_id,
          messages: [{
            type: 'text',
            text: `⏰ 溫馨提醒：\n時間到囉！\n\n👉 ${reminder.task}`
          }]
        });

        let updatePayload = {};

        if (reminder.is_recurring && reminder.cron_expression) {
          // 如果是週期性提醒，算出下一次的時間，並更新 triggerTime
          try {
            const interval = cronParser.parseExpression(reminder.cron_expression, {
              currentDate: new Date(), // 以現在時間為基準算下一次
              tz: 'UTC' // 確保內部運算用 UTC 與資料庫一致
            });
            updatePayload.trigger_time = interval.next().toDate().toISOString();
            console.log(`🔄 週期性提醒已重新排程於：${updatePayload.trigger_time}`);
          } catch (err) {
            console.error('❌ 解析 cronExpression 失敗，改為單次提醒:', err);
            updatePayload.is_notified = true;
          }
        } else {
          // 單次提醒，標記為已發送
          updatePayload.is_notified = true;
        }

        // 寫入回資料庫
        const { error: updateError } = await supabase
          .from('reminders')
          .update(updatePayload)
          .eq('id', reminder.id);

        if (updateError) {
          console.error(`Failed to update reminder ${reminder.id}:`, updateError);
        }
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
