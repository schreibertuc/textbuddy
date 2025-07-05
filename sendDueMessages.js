const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

(async () => {
  console.log('⏳ Checking for scheduled messages to send...');
  const now = new Date().toISOString();

  const { data: messages, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('sent', false)
    .lte('send_at', now);

  if (error) {
    console.error('❌ Error fetching messages:', error.message);
    process.exit(1);
  }

  if (!messages || messages.length === 0) {
    console.log('✅ No messages to send right now.');
    process.exit(0);
  }

  for (const msg of messages) {
    try {
      await client.messages.create({
        body: msg.body,
        from: msg.from_phone,
        to: msg.to_phone
      });

      // ✅ Mark as sent
      await supabase
        .from('scheduled_messages')
        .update({ sent: true })
        .eq('id', msg.id);

      // ✅ Log outbound message
      await supabase.from('messages').insert([{
        user_id: msg.user_id,
        number_id: msg.number_id,
        direction: 'outbound',
        from_phone: msg.from_phone,
        to_phone: msg.to_phone,
        body: msg.body
      }]);

      console.log(`✅ Sent message to ${msg.to_phone}`);
    } catch (err) {
      console.error(`❌ Failed to send to ${msg.to_phone}: ${err.message}`);
    }
  }

  process.exit(0);
})();

