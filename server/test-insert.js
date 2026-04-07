import { supabase } from './src/supabase.js';

async function run() {
    const { data: contacts } = await supabase.from('contacts').select('*').ilike('name', '%Ronaldo%').limit(1);
    
    if (!contacts || contacts.length === 0) {
        console.log("Contato nao encontrado"); return;
    }
    
    const c = contacts[0];
    console.log("Contact found:", c.id, "Tenant:", c.tenant_id);
    
    const { data, error } = await supabase.from('conversations').insert({
                 tenant_id: c.tenant_id,
                 contact_id: c.id,
                 unread_count: 0,
                 status: 'open',
                 last_message_at: new Date().toISOString()
             }).select('id');
             
    console.log("INSERT RESULT:", { data, error });
}
run();
