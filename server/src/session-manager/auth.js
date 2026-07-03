import { supabase, retryWithBackoff } from '../supabase.js';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

export const sessionCaches = new Map();
export const pendingWrites = new Map(); // Mantido por retrocompatibilidade

const writeQueues = new Map();

function enqueueWrite(instanceId, writeFn) {
    if (!writeQueues.has(instanceId)) {
        writeQueues.set(instanceId, Promise.resolve());
    }
    const currentQueue = writeQueues.get(instanceId);
    const nextPromise = currentQueue.then(async () => {
        try {
            await writeFn();
        } catch (err) {
            console.error(`[SessionManager] Erro na fila de escrita para instância ${instanceId}:`, err.message);
            throw err;
        }
    });
    writeQueues.set(instanceId, nextPromise);
    return nextPromise;
}

export async function flushPendingWrites(instanceId) {
    if (writeQueues.has(instanceId)) {
        console.log(`[SessionManager] Aguardando conclusão da fila de escrita para a instância ${instanceId}...`);
        try {
            await writeQueues.get(instanceId);
        } catch (e) {
            console.error(`[SessionManager] Erro durante o flush da fila de escrita para ${instanceId}:`, e.message);
        }
    }
}

export async function flushAllPendingWrites() {
    // No-op
    return;
}

export async function useSupabaseAuthState(tenantId, instanceId) {
    if (!sessionCaches.has(instanceId)) {
        sessionCaches.set(instanceId, new Map());
    }
    const memCache = sessionCaches.get(instanceId);

    const { data: credsData } = await retryWithBackoff(() =>
        supabase
            .from('wa_auth_credentials')
            .select('creds_data')
            .eq('instance_id', instanceId)
            .single()
    );
    
    let creds;
    if (credsData && credsData.creds_data) {
        creds = JSON.parse(JSON.stringify(credsData.creds_data), BufferJSON.reviver);
    } else {
        const init = initAuthCreds.default ? initAuthCreds.default : initAuthCreds;
        creds = init();

        // Anti-violação de chave estrangeira: verifica se a instância ainda existe antes do upsert
        const { data: instanceExists } = await retryWithBackoff(() =>
            supabase
                .from('whatsapp_instances')
                .select('id')
                .eq('id', instanceId)
                .single()
        );

        if (!instanceExists) {
            console.warn(`[SessionManager] Tentativa de upsert de credenciais abortada: Instância ${instanceId} não existe.`);
            throw new Error(`Instância ${instanceId} não existe no banco de dados.`);
        }

        await retryWithBackoff(() =>
            supabase.from('wa_auth_credentials').upsert({
                instance_id: instanceId,
                tenant_id: tenantId,
                creds_data: JSON.parse(JSON.stringify(creds, BufferJSON.replacer))
            }).throwOnError()
        );
    }

    // Pre-load absoluto de todas as chaves para a RAM (Evita congestionar a rede e previne o Timeout 408)
    if (memCache.size === 0) {
        let hasMore = true;
        let page = 0;
        while (hasMore) {
            const { data: allKeys, error } = await retryWithBackoff(() =>
                supabase
                    .from('wa_auth_keys')
                    .select('key_name, key_data')
                    .eq('instance_id', instanceId)
                    .range(page * 1000, (page + 1) * 1000 - 1)
            );
            
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
                        } else {
                            // Fallback para o Banco de Dados se não encontrado em memória
                            try {
                                const { data: dbKey } = await retryWithBackoff(() =>
                                    supabase
                                        .from('wa_auth_keys')
                                        .select('key_data')
                                        .eq('instance_id', instanceId)
                                        .eq('key_name', name)
                                        .maybeSingle()
                                );
                                
                                if (dbKey && dbKey.key_data) {
                                    const parsed = JSON.parse(JSON.stringify(dbKey.key_data), BufferJSON.reviver);
                                    memCache.set(name, parsed);
                                    
                                     let cv = parsed;
                                     if (type === 'app-state-sync-key' && cv && cv.target) {
                                         cv = { ...cv, target: Buffer.from(cv.target, 'base64') };
                                     }
                                    data[id] = cv;
                                    console.log(`[SessionManager] Chave recuperada via DB Fallback: ${name}`);
                                }
                            } catch (err) {
                                console.error(`[SessionManager] Erro no DB Fallback para chave ${name}:`, err.message);
                            }
                        }
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

                    // Sincronização em fila ordenada e imediata com Supabase
                    return enqueueWrite(instanceId, async () => {
                        await retryWithBackoff(async () => {
                            const promises = [];
                            if (keysToDelete.length > 0) {
                                promises.push(
                                    supabase.from('wa_auth_keys')
                                        .delete()
                                        .eq('instance_id', instanceId)
                                        .in('key_name', keysToDelete)
                                );
                            }
                            if (keysToUpsert.length > 0) {
                                const CHUNK = 500;
                                for (let i = 0; i < keysToUpsert.length; i += CHUNK) {
                                    promises.push(
                                        supabase.from('wa_auth_keys')
                                            .upsert(keysToUpsert.slice(i, i + CHUNK), { onConflict: 'instance_id, key_name' })
                                    );
                                }
                            }

                            if (promises.length > 0) {
                                const results = await Promise.all(promises);
                                for (const res of results) {
                                    if (res.error) throw res.error;
                                }
                            }
                        });
                    }).catch(error => {
                        console.error(`[${instanceId}] Erro fatal ao persistir chaves de autenticação na fila após retentativas:`, error.message);
                    });
                }
            }
        },
        saveCreds: async () => {
             return enqueueWrite(instanceId, async () => {
                 await retryWithBackoff(async () => {
                     const { error } = await supabase.from('wa_auth_credentials').upsert({
                         instance_id: instanceId,
                         tenant_id: tenantId,
                         creds_data: JSON.parse(JSON.stringify(creds, BufferJSON.replacer))
                     });
                     if (error) throw new Error(error.message);
                 });
             }).catch(error => {
                 console.error(`[${instanceId}] Erro fatal ao salvar credenciais após retentativas:`, error.message);
             });
        }
    }
}
