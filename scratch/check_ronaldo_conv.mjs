import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const phone = '975960999';
  console.log(`=== Buscando contato do telefone contendo "${phone}" ===`);
  const { data: contacts, error: errC } = await supabase
    .from('contacts')
    .select('*')
    .ilike('phone', `%${phone}%`);

  if (errC) {
    console.error("Erro ao buscar contato:", errC);
    return;
  }

  console.log("Contatos encontrados:", contacts.length);
  console.log(JSON.stringify(contacts, null, 2));

  if (contacts.length > 0) {
    const contactIds = contacts.map(c => c.id);
    console.log(`=== Buscando conversas ativas para os contatos ===`);
    const { data: conversations, error: errConv } = await supabase
      .from('conversations')
      .select('*')
      .in('contact_id', contactIds);

    if (errConv) {
      console.error("Erro ao buscar conversas:", errConv);
      return;
    }

    console.log("Conversas encontradas:", conversations.length);
    console.log(JSON.stringify(conversations, null, 2));

    if (conversations.length > 0) {
      const convIds = conversations.map(c => c.id);
      console.log(`=== Buscando as últimas 5 mensagens dessas conversas ===`);
      const { data: messages, error: errMsg } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', convIds)
        .order('timestamp', { ascending: false })
        .limit(5);

      if (errMsg) {
        console.error("Erro ao buscar mensagens:", errMsg);
        return;
      }

      console.log("Mensagens recentes:");
      console.log(JSON.stringify(messages, null, 2));
    }
  }
}

run();
