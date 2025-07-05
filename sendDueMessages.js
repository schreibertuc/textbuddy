const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');
require('dotenv').config();

// Supabase setup
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Twilio setup
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

(async () => {
  console.log('⏳ Checking for scheduled messages to send...');

  const now = new Date().toISOString();

  // 1. Get all unsent, unskipped messages due now
  const { data: messages, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('sent', false)
    .eq('skipped', false)
    .lte('send_at', now);

  if (error) {
    console.error('❌ Error fetching messages:', error.message);
    process.exit(1);
  }

  if (!messages || messages.length === 0) {
    console.log('✅ No messages to send right now.');
    process.exit(0);
  }

  // 2. Group by (to_phone, from_phone) and only keep the newest
  const latestByUser = new Map();

  for (const msg of messages) {
    const key = `${msg.to_phone}_${msg.from_phone}`;
    if (!latestByUser.has(key) || new Date(msg.send_at) > new Date(latestByUser.get(key).send_at)) {
      latestByUser.set(key, msg);
    }
  }

  // 3. Loop through messages and send the newest, skip others
  for (const msg of messages) {
    const key = `${msg.to_phone}_${msg.from_phone}`;

    // Skip older message
    if (latestByUser.get(key).id !== msg.id) {
      await supabase
        .from('scheduled_messages')
        .update({ skipped: true })
        .eq('id', msg.id);
      console.log(`⏭️ Skipped older message to ${msg.to_phone}`);
      continue;
    }

    try {
      // 4. Send via Twilio
      await client.messages.create({
        body: msg.body,
        from: msg.from_phone,
        to: msg.to_phone
      });

      // 5. Mark as sent
      await supabase
        .from('scheduled_messages')
        .update({ sent: true })
        .eq('id', msg.id);

      // 6. Log it in the messages table
      await supabase.from('messages').insert([{
        user_id: msg.user_id,
        number_id: msg.number_id,
        from_phone: msg.from_phone,
        to_phone: msg.to_phone,
        body: msg.body,
        direction: 'outbound'
      }]);

      console.log(`✅ Sent message to ${msg.to_phone}`);
    } catch (err) {
      console.error(`❌ Failed to send to ${msg.to_phone}: ${err.message}`);
    }
  }

  process.exit(0);
})();


