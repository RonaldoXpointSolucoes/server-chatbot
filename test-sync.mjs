import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.VITE_EVOLUTION_API_URL;
const API_KEY = process.env.VITE_EVOLUTION_GLOBAL_API_KEY;

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function sync() {
  const instanceName = 'Ronaldo-Comercial';
  
  // 1. Fetch Chats
  const res = await fetch(`${API_URL}/chat/findChats/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: API_KEY },
    body: JSON.stringify({})
  });
  const chats = await res.json();
  console.log(`Evoluton returned ${chats.length} chats`);
  
  // 2. Insert to Supabase manually
  let idx = 0;
  for (const chat of chats) {
    const remoteJid = chat.remoteJid || chat.id;
    if(!remoteJid || (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@g.us'))) continue;
    
    const phone = remoteJid.split('@')[0];
    const name = chat.pushName || chat.name || phone;
    
    // Get tenant
    let { data: tenant } = await supabase.from('tenants').select('id').limit(1).single();
    if (!tenant) {
        console.log("Creating Tenant...");
        const { data: newT } = await supabase.from('tenants').insert({ name: 'Master' }).select('id').single();
        tenant = newT;
    }
    
    // Check if exists
    const { data: existing } = await supabase.from('contacts').select('id').eq('evolution_remote_jid', remoteJid).single();
    if (!existing) {
       console.log(`Inserting ${name} / ${phone}`);
       await supabase.from('contacts').insert({
          tenant_id: tenant.id,
          name, phone, evolution_remote_jid: remoteJid, bot_status: 'active'
       });
       idx++;
    }
  }
  console.log(`Inserted ${idx} new contacts`);
}
sync();
