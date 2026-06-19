import { supabase } from './supabase.js';

async function run() {
  try {
    console.log("=== BUSCANDO PAULO MARCENARIA NO BANCO ===");
    
    // Buscar no contacts
    const { data: contacts, error: contactErr } = await supabase
      .from('contacts')
      .select('id, name, custom_name, phone, instance_id')
      .or('name.ilike.%Paulo%,custom_name.ilike.%Paulo%');

    if (contactErr) {
      console.error("Erro ao buscar no contacts:", contactErr);
      return;
    }

    console.log(`Encontrados ${contacts.length} contatos com 'Paulo':`);
    for (const c of contacts) {
      console.log(`- ID: ${c.id}, Name: ${c.name}, CustomName: ${c.custom_name}, Phone: ${c.phone}, Instance: ${c.instance_id}`);
      
      // Buscar conversa correspondente
      const { data: convs, error: convErr } = await supabase
        .from('conversations')
        .select('id, status, snoozed_until, updated_at, instance_id')
        .eq('contact_id', c.id);

      if (convErr) {
        console.error(`Erro ao buscar conversas para ${c.id}:`, convErr);
      } else {
        console.log(`  Conversas vinculadas (${convs.length}):`);
        for (const conv of convs) {
          console.log(`  * ID: ${conv.id}, Status: ${conv.status}, SnoozedUntil: ${conv.snoozed_until}, UpdatedAt: ${conv.updated_at}, Instance: ${conv.instance_id}`);
        }
      }
    }

    console.log("=== FIM DA BUSCA ===");
  } catch (e) {
    console.error(e);
  }
}

run();
