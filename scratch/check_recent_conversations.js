import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  try {
    // 1. Mensagens recentes
    const { data: messages, error: errMsgs } = await supabase
      .from('messages')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (errMsgs) {
      console.error("Erro ao buscar mensagens recentes:", errMsgs);
      return;
    }

    console.log("--- MENSAGENS RECENTES ---");
    console.log(messages.map(m => ({
      id: m.id,
      tenant_id: m.tenant_id,
      conversation_id: m.conversation_id,
      direction: m.direction,
      body: m.body ? m.body.substring(0, 100) : null,
      created_at: m.created_at
    })));

    // 2. Conversas recentes
    const { data: convs, error: errConvs } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (errConvs) {
      console.error("Erro ao buscar conversas recentes:", errConvs);
      return;
    }

    console.log("\n--- CONVERSAS RECENTES ---");
    console.log(convs.map(c => ({
      id: c.id,
      tenant_id: c.tenant_id,
      status: c.status,
      updated_at: c.updated_at
    })));

  } catch (err) {
    console.error(err);
  }
}

run();
