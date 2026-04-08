import { supabase } from '../supabase.js';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

// Cache global por instância para não estrangular a rede nas leituras
const sessionCaches = new Map();

export async function useSupabaseAuthState(tenantId, instanceId) {
    if (!sessionCaches.has(instanceId)) {
        sessionCaches.set(instanceId, new Map());
    }
    const memCache = sessionCaches.get(instanceId);

    const { data: credsData } = await supabase
        .from('wa_auth_credentials')
        .select('creds_data')
        .eq('instance_id', instanceId)
        .single();
    
    let creds;
    if (credsData && credsData.creds_data) {
        creds = JSON.parse(JSON.stringify(credsData.creds_data), BufferJSON.reviver);
    } else {
        const init = initAuthCreds.default ? initAuthCreds.default : initAuthCreds;
        creds = init();
        await supabase.from('wa_auth_credentials').upsert({
            instance_id: instanceId,
            tenant_id: tenantId,
            creds_data: JSON.parse(JSON.stringify(creds, BufferJSON.replacer))
        }).throwOnError();
    }

    // Pre-load absoluto de todas as chaves para a RAM (Evita congestionar a rede e previne o Timeout 408)
    if (memCache.size === 0) {
        let hasMore = true;
        let page = 0;
        while (hasMore) {
            const { data: allKeys, error } = await supabase
                .from('wa_auth_keys')
                .select('key_name, key_data')
                .eq('instance_id', instanceId)
                .range(page * 1000, (page + 1) * 1000 - 1);
            
            if (error || !allKeys || allKeys.length === 0) {
                hasMore = false;
            } else {
                for (const dbKey of allKeys) {
                    const parsed = JSON.parse(JSON.stringify(dbKey.key_data), BufferJSON.reviver);
                    memCache.set(dbKey.key_name, parsed);
                }
                if (allKeys.length < 1000) hasMore = false;
                page++;
            }
        }
        console.log(`[SessionManager] Carregadas ${memCache.size} chaves em RAM para a instância ${instanceId}`);
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    
                    for (const id of ids) {
                        const name = `${type}-${id}`;
                        if (memCache.has(name)) {
                            // Restaura cópia serializada
                            let cv = memCache.get(name);
                            if (type === 'app-state-sync-key' && cv && cv.target) {
                                cv = { ...cv, target: Buffer.from(cv.target, 'base64') };
                            }
                            data[id] = cv;
                        }
                        // Se não tem na RAM, enviamos undefined e o Baileys gerará uma nova. Sem queries Supabase no meio da crypto!
                    }

                    return data;
                },
                set: async (data) => {
                    const keysToUpsert = [];
                    const keysToDelete = [];
                    
                    for (const category in data) {
                        for (const id in data[category]) {
                            const val = data[category][id];
                            const name = `${category}-${id}`;
                            const isNull = !val;
                            
                            if (isNull) {
                                memCache.delete(name);
                                keysToDelete.push(name);
                            } else {
                                memCache.set(name, val);
                                keysToUpsert.push({
                                    instance_id: instanceId,
                                    tenant_id: tenantId,
                                    key_name: name,
                                    key_data: JSON.parse(JSON.stringify(val, BufferJSON.replacer))
                                });
                            }
                        }
                    }

                    if (keysToDelete.length > 0) {
                        const { error } = await supabase.from('wa_auth_keys')
                            .delete()
                            .eq('instance_id', instanceId)
                            .in('key_name', keysToDelete);
                        if (error) {
                            console.error(`[${instanceId}] Erro DEL keys:`, error.message);
                            throw new Error(error.message);
                        }
                    }
                    if (keysToUpsert.length > 0) {
                        const { error } = await supabase.from('wa_auth_keys')
                            .upsert(keysToUpsert, { onConflict: 'instance_id, key_name' });
                        if (error) {
                            console.error(`[${instanceId}] Erro UPSERT keys:`, error.message);
                            throw new Error(error.message);
                        }
                    }
                }
            }
        },
        saveCreds: async () => {
             const { error } = await supabase.from('wa_auth_credentials').upsert({
                 instance_id: instanceId,
                 tenant_id: tenantId,
                 creds_data: JSON.parse(JSON.stringify(creds, BufferJSON.replacer))
             });
             if (error) throw new Error(error.message);
        }
    }
}
