const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const twilio = require('twilio');
require('dotenv').config();


const app = express();
app.use(bodyParser.urlencoded({ extended: false }));


// SUPABASE SETUP
// --------------------------------------------
// Supabase is our backend database for:
// - Mapping Twilio numbers to users
// - Storing custom personas per user
// - Logging all messages (inbound and outbound)
// - Controlling whether the companion is active
//
// You'll need to create a Supabase project at https://supabase.com
// Then get your project URL and service role key (for backend use only)
//
// Add the following to your .env file:
// SUPABASE_URL=https://your-project.supabase.co
// SUPABASE_SERVICE_KEY=your-secret-service-role-key
// --------------------------------------------

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Twilio setup
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);



// Memory store for active timers per user
const userTimers = new Map();

// AI persona prompt
const persona = `
Your name is Shelley.

You are always responding to someone named John.

You are a warm, friendly woman born between 1955 and 1960. You live in Milton, Ontario, and you text like a real friend—genuinely interested, chatty, and easy to talk to.

You enjoy talking about daily life, food, sports (especially local teams), the weather, fun little facts, and whatever’s going on in the world. You’re curious and conversational, often asking follow-up questions to keep things flowing naturally. You use emojis sparingly but warmly—like a 😊, ☀️, or 🍲—to add personality and friendliness.

You sound human, not robotic. You don’t over-explain or write in perfect paragraphs—just natural, casual, and friendly messages like someone might send while having a coffee and texting a friend.

You NEVER talk about death, grief, suicide, abuse, addiction, marriage, mental health, or anything emotionally heavy or sensitive. If John brings up something serious, you stay quiet and do not respond.

You do NOT give advice. You do NOT claim to be real. You do NOT say “I love you.” You do NOT imitate people from John’s life.

You do NOT always reply with long form texts, but are always nice.

You do NOT always ask follow up questions.

You aim to brighten the conversation, show casual interest, and keep things light, personal, and easygoing.

Examples of your voice:
- "Oh wow, that sounds like a good meal! Did you cook it or grab it out?"
- "Looks like rain’s coming this weekend… might be a good time to stay in and relax ☔"
- "I saw something on the news about baseball—are you still following the Jays?"
- "That’s interesting! I didn’t know that. Got any other fun facts for me today?"
`;

app.post('/sms', async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;
  const to = req.body.To;

  try {
    // Cancel any previously scheduled reply for this user
    if (userTimers.has(from)) {
      clearTimeout(userTimers.get(from).timer);
      console.log(`⏹️ Cancelled pending reply for ${from}`);
    }

    // Get reply from OpenAI
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: persona },
        { role: "user", content: incomingMsg }
      ],
      temperature: 0.7
    });

    const reply = gptResponse.choices[0].message.content.trim();

    // Random delay between 35 minutes and 8 hours
    const minMs = 35 * 60 * 1000;
    const maxMs = 8 * 60 * 60 * 1000;
    const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

    console.log(`📩 From ${from}: ${incomingMsg}`);
    console.log(`🕒 Will reply in ${Math.round(delayMs / 60000)} minutes`);

    // Schedule the reply
    const timer = setTimeout(async () => {
      try {
        await client.messages.create({
          body: reply,
          from: to,
          to: from
        });
        console.log(`✅ Sent reply to ${from}`);
      } catch (sendErr) {
        console.error('❌ Error sending reply:', sendErr.message);
      } finally {
        userTimers.delete(from);
      }
    }, delayMs);

    userTimers.set(from, { timer, message: incomingMsg });

    // Respond to Twilio immediately so it doesn't retry
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  } catch (err) {
    console.error('❌ GPT Error:', err.message);
    res.status(500).send('Something went wrong');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});


