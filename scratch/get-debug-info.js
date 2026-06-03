import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debug() {
  console.log("=== DEBUG CONVERSA E INSTÂNCIA ===");
  
  // Buscar contato Ronaldo Clemente
  const { data: contacts } = await supabase.from('contacts')
    .select('*')
    .ilike('name', '%Ronaldo Clemente%');
  
  console.log("Contatos encontrados:", contacts);
  
  if (contacts && contacts.length > 0) {
    const contactId = contacts[0].id;
    
    // Buscar conversa ativa
    const { data: conversations } = await supabase.from('conversations')
      .select('*')
      .eq('contact_id', contactId);
      
    console.log("Conversas do contato:", conversations);
  }
  
  // Buscar instâncias do WhatsApp e configurações
  const { data: instances } = await supabase.from('whatsapp_instances')
    .select('id, display_name, phone_number, settings');
  
  console.log("Instâncias cadastradas:", JSON.stringify(instances, null, 2));
}

debug().catch(console.error);
