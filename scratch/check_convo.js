import { supabase } from '../server/src/supabase.js';

async function run() {
  try {
    // Busca a conversa relacionada ao telefone do cliente
    const { data: contacts, error: errContact } = await supabase
      .from('contacts')
      .select('*')
      .or('phone.ilike.%975960999%,phone.ilike.%973933247%');
      
    if (errContact) {
      console.error("Error fetching contacts:", errContact);
      return;
    }

    if (!contacts || contacts.length === 0) {
      console.log("No contacts found.");
      return;
    }

    console.log(`Found ${contacts.length} matching contacts:`);
    for (const contact of contacts) {
      console.log(`- Contact: ${contact.name} (ID: ${contact.id}, Phone: ${contact.phone})`);
      
      const { data: convs, error: errConv } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_id', contact.id);

      if (errConv) {
        console.error("Error fetching conversations:", errConv);
        continue;
      }

      for (const conv of convs) {
        console.log(`  - Conversation: ${conv.id}`);
        console.log(`    Status: ${conv.status}, AI Paused: ${conv.ai_paused}`);
        
        if (conv.ai_paused || conv.status !== 'bot') {
          console.log(`    [REPAIR] Reativando IA para esta conversa...`);
          const { error: errUpdate } = await supabase
            .from('conversations')
            .update({
              status: 'bot',
              ai_paused: false,
              ai_paused_manually: false
            })
            .eq('id', conv.id);

          if (errUpdate) {
            console.error("    Failed to reactivate:", errUpdate.message);
          } else {
            console.log("    IA reativada com sucesso! Status definido como 'bot'.");
          }
        } else {
          console.log("    A IA já está ativa e em modo 'bot' para este contato.");
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
}

run();
