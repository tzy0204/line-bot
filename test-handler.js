const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const config = { channelAccessToken: 'test', channelSecret: 'test' };
const client = new line.Client(config);
client.replyMessage = async (token, message) => {
    console.log('[MOCK client.replyMessage API CALLED]', { token, message });
    return { success: true };
};

const ai = new GoogleGenAI({ apiKey: 'test' });
ai.models.generateContent = async (params) => {
    console.log('[MOCK ai.models.generateContent CALLED]', params);
    return { text: 'gemini mock reply' };
};

// ... copy handleEvent logic ...
async function handleEvent(event) {
    console.log('Received event:', JSON.stringify(event, null, 2));
    try {
        if (event.type === 'message' && event.message.type === 'text') {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: event.message.text,
            });
            return client.replyMessage(event.replyToken, { type: 'text', text: response.text });
        }
        if (event.type === 'message' && event.message.type === 'audio') {
            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: '收到語音！請選擇您希望我幫忙處理的方式：',
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '✨ 幫我潤飾', data: `action=polish&msgId=${event.message.id}`, displayText: '請幫我潤飾這段語音' } },
                        { type: 'action', action: { type: 'postback', label: '🔤 翻譯英文', data: `action=translate&msgId=${event.message.id}`, displayText: '請幫我將這段語音翻譯成英文' } }
                    ]
                }
            });
        }
        return Promise.resolve(null);
    } catch (error) {
        console.error('Error handling event:', error);
    }
}

async function test() {
    console.log('--- TEST TEXT ---');
    await handleEvent({ type: 'message', replyToken: 'rep1', message: { type: 'text', text: 'hello' } });
    console.log('\n--- TEST AUDIO ---');
    await handleEvent({ type: 'message', replyToken: 'rep2', message: { type: 'audio', id: 'audio1' } });
}
test();
