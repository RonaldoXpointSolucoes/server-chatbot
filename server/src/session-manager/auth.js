import { supabase } from '../supabase.js';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

export async function useSupabaseAuthState(tenantId, instanceId) {
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
        });
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    const keysToFetch = ids.map(id => `${type}-${id}`);
                    
                    if (keysToFetch.length === 0) return data;
                    
                    const { data: keysFromDb, error } = await supabase
                        .from('wa_auth_keys')
                        .select('key_name, key_data')
                        .eq('instance_id', instanceId)
                        .in('key_name', keysToFetch);

                    if (error) {
                        console.error(`[${instanceId}] Erro GET keys:`, error);
                        return data;
                    }

                    for (const dbKey of (keysFromDb || [])) {
                        const [, id] = dbKey.key_name.split('-');
                        const parsedData = JSON.parse(JSON.stringify(dbKey.key_data), BufferJSON.reviver);
                        
                        if (type === 'app-state-sync-key' && parsedData) {
                            if (parsedData.target) {
                                data[id] = {
                                    ...parsedData,
                                    target: Buffer.from(parsedData.target, 'base64')
                                };
                                continue;
                            }
                        }
                        
                        data[id] = parsedData;
                    }

                    return data;
                },
                set: async (data) => {
                    const keysToUpsert = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const val = data[category][id];
                            const name = `${category}-${id}`;
                            const isNull = !val;
                            if (isNull) {
                                await supabase
                                  .from('wa_auth_keys')
                                  .delete()
                                  .eq('instance_id', instanceId)
                                  .eq('key_name', name);
                            } else {
                                keysToUpsert.push({
                                    instance_id: instanceId,
                                    tenant_id: tenantId,
                                    key_name: name,
                                    key_data: JSON.parse(JSON.stringify(val, BufferJSON.replacer))
                                });
                            }
                        }
                    }

                    if (keysToUpsert.length > 0) {
                        const { error } = await supabase
                            .from('wa_auth_keys')
                            .upsert(keysToUpsert, { onConflict: 'instance_id, key_name' });
                        if(error) {
                            console.error(`[${instanceId}] Erro ao gravar WA_AUTH_KEYS:`, error);
                        }
                    }
                }
            }
        },
        saveCreds: async () => {
             await supabase.from('wa_auth_credentials').upsert({
                 instance_id: instanceId,
                 tenant_id: tenantId,
                 creds_data: JSON.parse(JSON.stringify(creds, BufferJSON.replacer))
             });
        }
    }
}
