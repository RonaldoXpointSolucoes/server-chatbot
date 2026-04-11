import { supabase } from './src/supabase.js';

async function clear() {
    console.log("Deletando credenciais...");
    await supabase.from('wa_auth_credentials').delete().gt('created_at', '2000-01-01T00:00:00Z');
    
    let hasMore = true;
    while(hasMore) {
        console.log("Deletando chaves (loop)...");
        const { data, error } = await supabase.from('wa_auth_keys').select('id').limit(1000);
        if(!data || data.length === 0) {
            hasMore = false;
        } else {
            const ids = data.map(d => d.id);
            await supabase.from('wa_auth_keys').delete().in('id', ids);
        }
    }

    console.log("Deletando instâncias no banco de dados...");
    await supabase.from('whatsapp_instances').delete().gt('created_at', '2000-01-01T00:00:00Z');
    console.log("Concluído!");
    process.exit(0);
}
clear();
