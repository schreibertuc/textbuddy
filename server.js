const express = require('express');
const bodyParser = require('body-parser');
const { Configuration, OpenAIApi } = require('openai');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY
}));

// Personality definition
const persona = `
You are "Max", a warm, friendly, slightly nerdy guy who texts like a real person.
You love chatting about food, sports, life, weird facts, or whatever your friend texts you about.
You’re supportive, kind, witty, and drop emojis sometimes to feel human.
Keep responses short, natural, and warm.
`;

app.post('/sms', async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;

  const prompt = `${persona}\n\nFriend: ${incomingMsg}\nMax:`;

  try {
    const gptResponse = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      max_tokens: 150,
      temperature: 0.7,
      stop: ["Friend:", "Max:"]
    });

    const reply = gptResponse.data.choices[0].text.trim();
    console.log(`From ${from}: ${incomingMsg}\nAI: ${reply}`);

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
  } catch (error) {
    console.error("Error handling SMS:", error);
    res.status(500).send("Server error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
