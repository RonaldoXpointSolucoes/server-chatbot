import { supabase, retryWithBackoff, nodeSupabaseCircuitBreaker } from '../supabase.js';
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
const pendingKeyBuffers = new Map();
const pendingCredTimers = new Map();

async function waitForCircuitRecoveryIfNeeded() {
    if (nodeSupabaseCircuitBreaker && nodeSupabaseCircuitBreaker.isCircuitOpen()) {
        const elapsed = Date.now() - (nodeSupabaseCircuitBreaker.lastStateChange || 0);
        const remaining = Math.max(500, Math.min((nodeSupabaseCircuitBreaker.cooldownMs || 5000) - elapsed + 250, 6000));
        await new Promise(r => setTimeout(r, remaining));
    }
}

function enqueueWrite(instanceId, writeFn) {
    if (!writeQueues.has(instanceId)) {
        writeQueues.set(instanceId, Promise.resolve());
    }
    const currentQueue = writeQueues.get(instanceId);

    const taskPromise = currentQueue
        .catch(() => {})
        .then(async () => {
            let timer;
            try {
                await waitForCircuitRecoveryIfNeeded();
                await Promise.race([
                    writeFn(),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Auth writeQueue operation timed out after 25000ms')), 25000);
                    })
                ]);
            } catch (err) {
                const msg = err?.message || String(err);
                if (!msg.includes('CircuitBreaker')) {
                    console.warn(`[SessionManager/AuthQueue] Oscilação transitória na fila de escrita (${instanceId}):`, msg);
                }
            } finally {
                if (timer) clearTimeout(timer);
            }
        });

    // Mantém sempre uma Promise resolvida na cauda da fila para nunca envenenar chamadas futuras ou o flushPendingWrites
    const safeTail = taskPromise.catch(() => {});
    writeQueues.set(instanceId, safeTail);
    return safeTail;
}

function scheduleKeyFlush(instanceId, tenantId, immediate = false) {
    const buf = pendingKeyBuffers.get(instanceId);
    if (!buf) return Promise.resolve();

    if (buf.timer) {
        clearTimeout(buf.timer);
        buf.timer = null;
    }

    const executeFlush = () => {
        const currentBuf = pendingKeyBuffers.get(instanceId);
        if (!currentBuf) return Promise.resolve();
        currentBuf.timer = null;

        const upsertsMap = currentBuf.upserts;
        const deletesSet = currentBuf.deletes;
        if (upsertsMap.size === 0 && deletesSet.size === 0) {
            return Promise.resolve();
        }

        const keysToUpsert = Array.from(upsertsMap.values());
        const keysToDelete = Array.from(deletesSet.values());
        upsertsMap.clear();
        deletesSet.clear();

        return enqueueWrite(instanceId, async () => {
            await retryWithBackoff(async () => {
                await waitForCircuitRecoveryIfNeeded();
                const promises = [];
                if (keysToDelete.length > 0) {
                    const DEL_CHUNK = 200;
                    for (let i = 0; i < keysToDelete.length; i += DEL_CHUNK) {
                        promises.push(
                            supabase.from('wa_auth_keys')
                                .delete()
                                .eq('instance_id', instanceId)
                                .in('key_name', keysToDelete.slice(i, i + DEL_CHUNK))
                        );
                    }
                }
                if (keysToUpsert.length > 0) {
                    const CHUNK = 400;
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
            }, 2, 800);
        });
    };

    if (immediate) {
        return executeFlush();
    }

    return new Promise((resolve) => {
        buf.timer = setTimeout(() => {
            executeFlush().finally(resolve);
        }, 250);
    });
}

export async function flushPendingWrites(instanceId) {
    if (pendingKeyBuffers.has(instanceId)) {
        const buf = pendingKeyBuffers.get(instanceId);
        if (buf && (buf.upserts.size > 0 || buf.deletes.size > 0)) {
            await scheduleKeyFlush(instanceId, buf.tenantId, true);
        }
    }
    if (pendingCredTimers.has(instanceId)) {
        const credEntry = pendingCredTimers.get(instanceId);
        if (credEntry?.flushNow) {
            await credEntry.flushNow();
        }
    }
    if (writeQueues.has(instanceId)) {
        let timer;
        try {
            await Promise.race([
                writeQueues.get(instanceId),
                new Promise((resolve) => {
                    timer = setTimeout(() => {
                        resolve();
                    }, 8000);
                })
            ]);
        } catch (e) {
            // Silencioso: safeTail já trata erros internamente
        } finally {
            if (timer) clearTimeout(timer);
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

/**
 * Deserializa recursivamente estruturas BufferJSON sem o custo bloqueante de JSON.stringify + JSON.parse na thread principal.
 */
export function reviveAuthData(val) {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') {
        try {
            return JSON.parse(val, BufferJSON.reviver);
        } catch {
            return val;
        }
    }
    return reviveBufferNode(val);
}

function reviveBufferNode(val) {
    if (val === null || typeof val !== 'object') return val;
    if (Buffer.isBuffer(val)) return Buffer.from(val);
    if (val instanceof Uint8Array) return Buffer.from(val);
    if (Array.isArray(val)) {
        const len = val.length;
        const arr = new Array(len);
        for (let i = 0; i < len; i++) {
            arr[i] = reviveBufferNode(val[i]);
        }
        return arr;
    }
    if (val.type === 'Buffer' && (typeof val.data === 'string' || Array.isArray(val.data))) {
        return typeof val.data === 'string' ? Buffer.from(val.data, 'base64') : Buffer.from(val.data);
    }
    const keys = Object.keys(val);
    if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
        const values = keys.map(k => val[k]);
        if (values.every(v => typeof v === 'number')) {
            return Buffer.from(values);
        }
    }
    const out = {};
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        out[k] = reviveBufferNode(val[k]);
    }
    return out;
}

/**
 * Serializa recursivamente Buffers/Uint8Arrays para o formato BufferJSON em memória sem duplo ciclo JSON.stringify/parse.
 */
export function serializeAuthData(val) {
    if (val === null || typeof val !== 'object') return val;
    if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
        return { type: 'Buffer', data: Buffer.from(val).toString('base64') };
    }
    if (val.type === 'Buffer' && (val.data !== undefined)) {
        return {
            type: 'Buffer',
            data: typeof val.data === 'string' ? val.data : Buffer.from(val.data).toString('base64')
        };
    }
    if (Array.isArray(val)) {
        const len = val.length;
        const arr = new Array(len);
        for (let i = 0; i < len; i++) {
            arr[i] = serializeAuthData(val[i]);
        }
        return arr;
    }
    const keys = Object.keys(val);
    const out = {};
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = val[k];
        if (v !== undefined) {
            out[k] = serializeAuthData(v);
        }
    }
    return out;
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
        creds = reviveAuthData(credsData.creds_data);
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
                creds_data: serializeAuthData(creds)
            }).throwOnError()
        );
    }

    // Warm-up leve e não-bloqueante: Pre-carrega apenas chaves críticas de handshake (app-state-sync-key / pre-key)
    // cedendo o Event Loop a cada 25 chaves para manter P50/P95 < 15ms mesmo com 16+ instâncias simultâneas.
    if (memCache.size === 0) {
        try {
            const { data: criticalKeys, error: cErr } = await retryWithBackoff(() =>
                supabase
                    .from('wa_auth_keys')
                    .select('key_name, key_data')
                    .eq('instance_id', instanceId)
                    .or('key_name.ilike.app-state-sync-key%,key_name.ilike.pre-key%')
                    .limit(120)
            );
            
            if (!cErr && criticalKeys) {
                for (let idx = 0; idx < criticalKeys.length; idx++) {
                    const dbKey = criticalKeys[idx];
                    const parsed = reviveAuthData(dbKey.key_data);
                    memCache.set(dbKey.key_name, parsed);
                    if ((idx + 1) % 25 === 0) {
                        await new Promise(r => setImmediate(r));
                    }
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
                            if (cv !== null && cv !== undefined) {
                                if (type === 'app-state-sync-key' && cv && cv.target) {
                                    cv = { ...cv, target: Buffer.from(cv.target, 'base64') };
                                }
                                data[id] = cv;
                            }
                            // Se cv for null, significa que já sabemos que a chave não existe no DB (cache negativo)
                        } else {
                            missingKeys.push(name);
                            missingIdMap.set(name, id);
                        }
                    }

                    // Fallback em LOTE para o Banco de Dados para todas as chaves ausentes da RAM
                    if (missingKeys.length > 0) {
                        try {
                            await waitForCircuitRecoveryIfNeeded();
                            const CHUNK_SIZE = 100;
                            for (let i = 0; i < missingKeys.length; i += CHUNK_SIZE) {
                                const chunk = missingKeys.slice(i, i + CHUNK_SIZE);
                                const { data: dbKeys, error } = await retryWithBackoff(() =>
                                    supabase
                                        .from('wa_auth_keys')
                                        .select('key_name, key_data')
                                        .eq('instance_id', instanceId)
                                        .in('key_name', chunk),
                                    2,
                                    600
                                );
                                
                                if (error) {
                                    if (!String(error.message || '').includes('CircuitBreaker')) {
                                        console.warn(`[SessionManager] Aviso no DB Fallback para ${chunk.length} chaves Signal:`, error.message);
                                    }
                                } else {
                                    const foundNames = new Set();
                                    if (dbKeys && dbKeys.length > 0) {
                                        for (let kIdx = 0; kIdx < dbKeys.length; kIdx++) {
                                            const row = dbKeys[kIdx];
                                            foundNames.add(row.key_name);
                                            try {
                                                const parsed = reviveAuthData(row.key_data);
                                                memCache.set(row.key_name, parsed);
                                                const origId = missingIdMap.get(row.key_name);
                                                if (origId) {
                                                    let cv = parsed;
                                                    if (type === 'app-state-sync-key' && cv && cv.target) {
                                                        cv = { ...cv, target: Buffer.from(cv.target, 'base64') };
                                                    }
                                                    data[origId] = cv;
                                                }
                                            } catch (pErr) {
                                                console.warn(`[SessionManager] Erro ao deserializar chave ${row.key_name}:`, pErr.message);
                                            }
                                            if ((kIdx + 1) % 30 === 0) {
                                                await new Promise(r => setImmediate(r));
                                            }
                                        }
                                    }
                                    // Negative Caching: Chaves que foram buscadas e NÃO existem no DB são salvas como null na RAM
                                    // Isso impede tempestades de SELECTs repetidos para chaves inexistentes no Baileys
                                    for (const kName of chunk) {
                                        if (!foundNames.has(kName)) {
                                            memCache.set(kName, null);
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            if (!String(err?.message || '').includes('CircuitBreaker')) {
                                console.warn(`[SessionManager] Oscilação no DB Fallback de chaves Signal (${type}):`, err.message);
                            }
                        }
                    }

                    return data;
                },
                set: async (data) => {
                    if (!pendingKeyBuffers.has(instanceId)) {
                        pendingKeyBuffers.set(instanceId, {
                            tenantId,
                            upserts: new Map(),
                            deletes: new Set(),
                            timer: null
                        });
                    }
                    const buf = pendingKeyBuffers.get(instanceId);
                    buf.tenantId = tenantId || buf.tenantId;
                    let processedCount = 0;
                    
                    for (const category in data) {
                        for (const id in data[category]) {
                            const val = data[category][id];
                            const name = `${category}-${id}`;
                            const isNull = !val;
                            
                            if (isNull) {
                                memCache.delete(name);
                                buf.upserts.delete(name);
                                buf.deletes.add(name);
                            } else {
                                memCache.set(name, val);
                                buf.deletes.delete(name);
                                buf.upserts.set(name, {
                                    instance_id: instanceId,
                                    tenant_id: tenantId,
                                    key_name: name,
                                    key_data: serializeAuthData(val)
                                });
                            }
                            if (++processedCount % 30 === 0) {
                                await new Promise(r => setImmediate(r));
                            }
                        }
                    }

                    // Coalescência em lote (250ms) na fila ordenada por instância para evitar saturação do gateway Supabase
                    scheduleKeyFlush(instanceId, tenantId, false).catch(() => {});
                }
            }
        },
        saveCreds: async () => {
            if (pendingCredTimers.has(instanceId)) {
                const existing = pendingCredTimers.get(instanceId);
                if (existing?.timer) clearTimeout(existing.timer);
            }

            const flushNow = () => {
                const entry = pendingCredTimers.get(instanceId);
                if (entry?.timer) {
                    clearTimeout(entry.timer);
                    entry.timer = null;
                }
                pendingCredTimers.delete(instanceId);
                return enqueueWrite(instanceId, async () => {
                    await retryWithBackoff(async () => {
                        await waitForCircuitRecoveryIfNeeded();
                        const { error } = await supabase.from('wa_auth_credentials').upsert({
                            instance_id: instanceId,
                            tenant_id: tenantId,
                            creds_data: serializeAuthData(authState.state.creds)
                        });
                        if (error) throw new Error(error.message);
                    }, 2, 800);
                });
            };

            const timer = setTimeout(() => {
                flushNow().catch(() => {});
            }, 300);

            pendingCredTimers.set(instanceId, { timer, flushNow });
        }
    };

    return authState;
}
