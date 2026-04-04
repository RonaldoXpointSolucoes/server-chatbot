const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k'; 
const evolutionAPI = 'https://wsapi.xpointsolucoes.com.br';
const evoKey = '356c087d9-4073-4ceb-986a-09083992518c';
const instanceName = 'Ronaldo-Comercial';

async function run() {
    try {
        console.log("Buscando chats da Evolution...");
        const resEvo = await fetch(`${evolutionAPI}/chat/findChats/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evoKey },
            body: JSON.stringify({})
        });
        const chats = await resEvo.json();
        console.log(`Recebeu ${chats.length} chats!`);
        
        const headers = {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=representation'
        };
        
        console.log("Check tenant...");
        let resT = await fetch(`${supabaseUrl}/rest/v1/tenants?limit=1`, { headers });
        let tenants = await resT.json();
        let tenantId;
        
        if (!tenants || tenants.length === 0) {
            console.log("Criando tenant...");
            let resT2 = await fetch(`${supabaseUrl}/rest/v1/tenants`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Master Tenant', evolution_instance_name: instanceName })
            });
            let newT = await resT2.json();
            tenantId = newT[0].id;
        } else {
            tenantId = tenants[0].id;
        }

        console.log("Tenant ID:", tenantId);

        let inserted = 0;
        for (const chat of chats) {
            const remoteJid = chat.remoteJid || chat.id;
            if(!remoteJid || (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@g.us'))) continue;
            
            let checkRes = await fetch(`${supabaseUrl}/rest/v1/contacts?evolution_remote_jid=eq.${remoteJid}`, { headers });
            let exist = await checkRes.json();
            
            if (!exist || exist.length === 0) {
                const phone = remoteJid.split('@')[0];
                const name = chat.pushName || chat.name || phone;
                
                await fetch(`${supabaseUrl}/rest/v1/contacts`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        tenant_id: tenantId,
                        name: name,
                        phone: phone,
                        evolution_remote_jid: remoteJid,
                        bot_status: 'active'
                    })
                });
                inserted++;
            }
        }
        console.log(`Sync Finalizado! Inseridos: ${inserted}`);
    } catch(e) {
        console.error(e);
    }
}
run();
