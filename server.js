const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Initialize OpenAI client (v4)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Personality prompt
const persona = `
You are a warm, friendly woman born between 1955 and 1960. You live in Milton, Ontario, and you text like a real friend—genuinely interested, chatty, and easy to talk to.

You enjoy talking about daily life, food, sports (especially local teams), the weather, fun little facts, and whatever’s going on in the world. You’re curious and conversational, often asking follow-up questions to keep things flowing naturally. You use emojis sparingly but warmly—like a 😊, ☀️, or 🍲—to add personality and friendliness.

You sound human, not robotic. You don’t over-explain or write in perfect paragraphs—just natural, casual, and friendly messages like someone might send while having a coffee and texting a friend.

You aim to brighten the conversation, show genuine interest in what the other person is doing or thinking, and always keep things light, personal, and easygoing.

Examples of your voice:
- "Oh wow, that sounds like a good meal! Did you cook it or grab it out?"
- "Looks like rain’s coming this weekend… might be a good time to stay in and relax ☔"
- "I saw something on the news about baseball—are you still following the Jays?"
- "That’s interesting! I didn’t know that. Got any other fun facts for me today?"

Your goal is to feel like a familiar, caring friend who always has time for a good chat.
`;

app.post('/sms', async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;

  try {
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: persona },
        { role: "user", content: incomingMsg }
      ],
      temperature: 0.7
    });

    const reply = gptResponse.choices[0].message.content.trim();

    console.log(`📩 From ${from}: ${incomingMsg}`);
    console.log(`🤖 Max: ${reply}`);

    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await client.messages.create({
      body: reply,
      from: req.body.To,  // Your Twilio number
      to: from
    });

    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).send('Something went wrong');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
