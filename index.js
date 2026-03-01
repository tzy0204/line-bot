const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

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

// register a webhook handler with middleware
// about the middleware, please refer to doc
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// event handler
async function handleEvent(event) {
  console.log('Received event:', JSON.stringify(event, null, 2));

  if (event.type !== 'message' || event.message.type !== 'text') {
    // ignore non-text-message event
    return Promise.resolve(null);
  }

  try {
    // Generate AI response using Gemini 2.5 Flash
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: event.message.text,
    });

    const aiReplyText = response.text;

    // create a text message with the AI's reply
    const replyMessage = { type: 'text', text: aiReplyText };

    // use reply API
    return client.replyMessage(event.replyToken, replyMessage);
  } catch (error) {
    console.error('Error generating AI response:', error);
    // Reply with a fallback error message so the user knows something went wrong
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'Sorry, I am having trouble connecting to my AI brain right now. Please try again later.'
    });
  }
}

// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});
