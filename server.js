const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const userTimers = new Map();

const persona = `
Your name is Shelley.
... [same persona block as before]
`;

app.post('/sms', async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;
  const to = req.body.To;

  try {
    if (userTimers.has(from)) {
      clearTimeout(userTimers.get(from).timer);
      console.log(`⏹️ Cancelled pending reply for ${from}`);
    }

    const gptResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: persona },
        { role: "user", content: incomingMsg }
      ],
      temperature: 0.7
    });

    const reply = gptResponse.choices[0].message.content.trim();
    console.log(`💬 Reply will be: "${reply}"`);

    const minMs = 15 * 60 * 1000;
    const maxMs = 3 * 60 * 60 * 1000;
    const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    const sendAt = new Date(Date.now() + delayMs);

    console.log(`📩 From ${from}: ${incomingMsg}`);
    console.log(`🕒 Will reply in ${Math.round(delayMs / 60000)} minutes`);

    const { data: numberRow, error: numberError } = await supabase
      .from('numbers')
      .select('id, user_id')
      .eq('twilio_number', to)
      .single();

    if (numberError || !numberRow) {
      console.error(`❌ Could not find Twilio number ${to} in DB`);
      res.set('Content-Type', 'text/xml');
      res.send('<Response></Response>');
      return;
    }

    // 🔸 Log inbound message
    await supabase.from('messages').insert([{
      user_id: numberRow.user_id,
      number_id: numberRow.id,
      direction: 'inbound',
      from_phone: from,
      to_phone: to,
      body: incomingMsg
    }]);

    // 🔸 Queue outbound message
    const { error: insertError } = await supabase.from('scheduled_messages').insert([{
      user_id: numberRow.user_id,
      number_id: numberRow.id,
      to_phone: from,
      from_phone: to,
      body: reply,
      send_at: sendAt
    }]);

    if (insertError) {
      console.error('❌ Failed to insert scheduled message:', insertError.message);
    } else {
      console.log(`📝 Saved message to DB for ${from} at ${sendAt.toISOString()}`);
    }

    // Temporary in-memory fallback
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
