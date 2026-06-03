import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debug() {
  console.log("=== DEBUG MENSAGENS COMERCIAL ===");
  
  const conversationId = '5512f7d9-c619-4497-8dde-6e2869a841e9';
  
  // Buscar últimas 10 mensagens
  const { data: messages, error } = await supabase.from('messages')
    .select('id, direction, text_content, status, sender_type, timestamp')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error("Erro ao buscar mensagens:", error);
    return;
  }
  
  console.log("Últimas mensagens do Comercial:", messages);
}

debug().catch(console.error);
