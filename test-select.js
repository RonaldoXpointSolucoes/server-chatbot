require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLatestMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('*, contacts (evolution_remote_jid)')
    .order('timestamp', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching messages:', error);
  } else {
    console.log('Latest messages in database:', JSON.stringify(data, null, 2));
  }
}

checkLatestMessages();
