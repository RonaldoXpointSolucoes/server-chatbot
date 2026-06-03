import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debug() {
  console.log("=== DEBUG CONVERSA DE RONALDO NO COMERCIAL ===");
  
  const contactId = '42ef41c2-01fd-4e9d-8301-d8ca306ebf0c';
  
  // Buscar conversas
  const { data: conversations } = await supabase.from('conversations')
    .select('*')
    .eq('contact_id', contactId);
    
  console.log("Conversas encontradas:", conversations);
  
  // Buscar últimas 5 mensagens
  if (conversations && conversations.length > 0) {
    const { data: messages } = await supabase.from('messages')
      .select('id, direction, text_content, status, sender_type, timestamp')
      .eq('conversation_id', conversations[0].id)
      .order('timestamp', { ascending: false })
      .limit(5);
      
    console.log("Mensagens recentes da conversa:", messages);
  }
}

debug().catch(console.error);
