import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Lê variaveis do .env hardcoded regex simple
const envFile = fs.readFileSync('.env', 'utf-8');
const VITE_SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const VITE_SUPABASE_ANON_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: {
    params: {
        eventsPerSecond: 10
    }
  }
});

console.log('Conectando...', VITE_SUPABASE_URL);

const channel = supabase.channel('realtime_chat', {
  config: {
    broadcast: { ack: true }
  }
});

channel.on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
    console.log('NOVA MENSAGEM NO BANCO!', payload);
}).subscribe((status, err) => {
    console.log('STATUS:', status, err);
    if(status === 'SUBSCRIBED') {
       console.log('>>> Escutando!');
    }
});
