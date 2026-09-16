import { supabase, retryWithBackoff } from '../supabase.js';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

export const sessionCaches = new Map();
export const pendingWrites = new Map(); // Mantido por retrocompatibilidade

/**
 * Cache bounded com estratégia LRU para chaves Signal.
 * Limita a memória a no máximo maxSize chaves por instância, evitando estouro de heap.
 */
class BoundedKeyCache {
    constructor(maxSize = 1500) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }
    get(key) {
        if (!this.cache.has(key)) return undefined;
        const val = this.cache.get(key);
        // Atualiza posição no LRU
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }
    set(key, val) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove o mais antigo do cache
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }
        this.cache.set(key, val);
        return this;
    }
    has(key) {
        return this.cache.has(key);
    }
    delete(key) {
        return this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    get size() {
        return this.cache.size;
    }
    keys() {
        return this.cache.keys();
    }
    entries() {
        return this.cache.entries();
    }
    values() {
        return this.cache.values();
    }
}

const writeQueues = new Map();

function enqueueWrite(instanceId, writeFn) {
    if (!writeQueues.has(instanceId)) {
        writeQueues.set(instanceId, Promise.resolve());
    }
    const currentQueue = writeQueues.get(instanceId);
    // Encadeia com .catch() para que um erro pontual anterior não trave indefinidamente as escritas subsequentes
    const nextPromise = currentQueue
        .catch((prevErr) => {
            console.warn(`[SessionManager/AuthQueue] Auto-recuperando fila de escrita após erro anterior na instância ${instanceId}:`, prevErr?.message || prevErr);
        })
        .then(async () => {
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

export function clearInstanceMemoryCache(instanceId) {
    if (sessionCaches.has(instanceId)) {
        sessionCaches.get(instanceId).clear();
        console.log(`[SessionManager] Cache de chaves Signal em RAM reciclado para a instância ${instanceId}.`);
    }
}

// Controle de taxa para reset de chaves de sessão por destinatário (evita tempestade de wipes em acks repetidos)
const recipientResetCooldowns = new Map();
const RECIPIENT_RESET_COOLDOWN_MS = 30000; // 30 segundos de intervalo mínimo por destinatário

export function clearRecipientSession(instanceId, jid) {
    if (!jid) return false;
    const cleanJid = String(jid).replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '').split(':')[0].trim();
    if (!cleanJid || cleanJid.length < 5) return false;
    
    const cooldownKey = `${instanceId}_${cleanJid}`;
    const now = Date.now();
    const lastReset = recipientResetCooldowns.get(cooldownKey);

    // Se já foi resetado nos últimos 30 segundos, ignora para permitir que a nova negociação de prekeys termine
    if (lastReset && (now - lastReset < RECIPIENT_RESET_COOLDOWN_MS)) {
        return false;
    }
    recipientResetCooldowns.set(cooldownKey, now);

    // Limpeza periódica do mapa de cooldown
    if (recipientResetCooldowns.size > 2000) {
        for (const [k, t] of recipientResetCooldowns.entries()) {
            if (now - t > RECIPIENT_RESET_COOLDOWN_MS * 2) {
                recipientResetCooldowns.delete(k);
            }
        }
    }
    
    if (sessionCaches.has(instanceId)) {
        const memCache = sessionCaches.get(instanceId);
        let count = 0;
        for (const key of Array.from(memCache.keys())) {
            if (key.includes(cleanJid)) {
                memCache.delete(key);
                count++;
            }
        }
        if (count > 0) {
            console.log(`[SessionManager/Auth] Limpas ${count} chaves de sessão em RAM para o destinatário ${cleanJid} (instância ${instanceId}).`);
        }
    }

    // Também limpa do Supabase em background para evitar ressuscitar chaves corrompidas de sessão
    try {
        supabase.from('wa_auth_keys')
            .delete()
            .eq('instance_id', instanceId)
            .ilike('key_name', `%${cleanJid}%`)
            .then(() => {})
            .catch(() => {});
    } catch (e) {}

    return true;
}

export async function useSupabaseAuthState(tenantId, instanceId, forceCleanState = false) {
    if (forceCleanState && sessionCaches.has(instanceId)) {
        sessionCaches.get(instanceId).clear();
    }
    if (!sessionCaches.has(instanceId)) {
        sessionCaches.set(instanceId, new BoundedKeyCache(1500));
    }
    const memCache = sessionCaches.get(instanceId);

    let credsData = null;
    if (!forceCleanState) {
        const res = await retryWithBackoff(() =>
            supabase
                .from('wa_auth_credentials')
                .select('creds_data')
                .eq('instance_id', instanceId)
                .single()
        );
        credsData = res.data;
    }
    
    let creds;
    if (credsData && credsData.creds_data && !forceCleanState) {
        creds = JSON.parse(JSON.stringify(credsData.creds_data), BufferJSON.reviver);
    } else {
        const init = initAuthCreds.default ? initAuthCreds.default : initAuthCreds;
        creds = init();
        delete creds.me;
        delete creds.account;
        delete creds.signalIdentities;
        delete creds.pairingCode;

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

    // Warm-up leve e bounded: Pre-carrega apenas chaves críticas de handshake (app-state-sync-key)
    // e no máximo 300 chaves recentes. Evita carregar 200.000 chaves na RAM e previne OOM / travamento de GC.
    if (memCache.size === 0) {
        try {
            const { data: criticalKeys, error: cErr } = await retryWithBackoff(() =>
                supabase
                    .from('wa_auth_keys')
                    .select('key_name, key_data')
                    .eq('instance_id', instanceId)
                    .or('key_name.ilike.app-state-sync-key%,key_name.ilike.pre-key%')
                    .limit(300)
            );
            
            if (!cErr && criticalKeys) {
                for (const dbKey of criticalKeys) {
                    const parsed = JSON.parse(JSON.stringify(dbKey.key_data), BufferJSON.reviver);
                    memCache.set(dbKey.key_name, parsed);
                }
            }
            console.log(`[SessionManager] Warm-up leve concluído: ${memCache.size} chaves ativas em RAM para a instância ${instanceId} (LRU Bounded: max 1500 chaves)`);
        } catch (warmErr) {
            console.warn(`[SessionManager] Aviso no warm-up de chaves para ${instanceId}:`, warmErr.message);
        }
    }

    const authState = {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    const missingKeys = [];
                    const missingIdMap = new Map();
                    
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
                            missingKeys.push(name);
                            missingIdMap.set(name, id);
                        }
                    }

                    // Fallback em LOTE para o Banco de Dados para todas as chaves ausentes da RAM
                    if (missingKeys.length > 0) {
                        try {
                            const CHUNK_SIZE = 100;
                            for (let i = 0; i < missingKeys.length; i += CHUNK_SIZE) {
                                const chunk = missingKeys.slice(i, i + CHUNK_SIZE);
                                const { data: dbKeys, error } = await retryWithBackoff(() =>
                                    supabase
                                        .from('wa_auth_keys')
                                        .select('key_name, key_data')
                                        .eq('instance_id', instanceId)
                                        .in('key_name', chunk)
                                );
                                
                                if (error) {
                                    console.error(`[SessionManager] Erro no DB Fallback para ${chunk.length} chaves Signal:`, error.message);
                                } else if (dbKeys && dbKeys.length > 0) {
                                    for (const row of dbKeys) {
                                        const parsed = JSON.parse(JSON.stringify(row.key_data), BufferJSON.reviver);
                                        memCache.set(row.key_name, parsed);
                                        const origId = missingIdMap.get(row.key_name);
                                        if (origId) {
                                            let cv = parsed;
                                            if (type === 'app-state-sync-key' && cv && cv.target) {
                                                cv = { ...cv, target: Buffer.from(cv.target, 'base64') };
                                            }
                                            data[origId] = cv;
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`[SessionManager] Exceção no DB Fallback de chaves Signal (${type}):`, err.message);
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
                         creds_data: JSON.parse(JSON.stringify(authState.state.creds, BufferJSON.replacer))
                     });
                     if (error) throw new Error(error.message);
                 });
             }).catch(error => {
                 console.error(`[${instanceId}] Erro fatal ao salvar credenciais após retentativas:`, error.message);
             });
        }
    };

    return authState;
}
