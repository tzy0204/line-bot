const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: "MOCK_TOKEN",
  channelSecret: "MOCK_SECRET"
};
const client = new line.Client(config);

const event = {
  replyToken: "00000000000000000000000000000000",
  type: "message",
  message: {
    type: "audio",
    id: "603203757920485837"
  }
};

client.replyMessage(event.replyToken, {
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
      }
    ]
  }
}).then(r => console.log("Success:", r)).catch(e => console.error("Error:", e.response ? e.response.data : e.message));
