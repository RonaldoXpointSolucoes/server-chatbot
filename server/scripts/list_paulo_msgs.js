import { supabase } from '../src/supabase.js';

async function listPauloMessages() {
  const contactId = 'f9f72f60-a355-49e0-8b28-bcfda774e7e1';
  
  // Buscar todas as conversas
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, instance_id, status, last_message_preview, last_message_at, updated_at')
    .eq('contact_id', contactId);
  console.log('Conversas do Paulo:', convs);

  for (const c of convs || []) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, whatsapp_message_id, direction, sender_type, status, text_content, timestamp, instance_id')
      .eq('conversation_id', c.id)
      .order('timestamp', { ascending: false })
      .limit(5);
    console.log(`\nÚltimas 5 mensagens da conversa ${c.id} (instância ${c.instance_id}, status ${c.status}):`);
    console.log(msgs);
  }

  process.exit(0);
}

listPauloMessages();
