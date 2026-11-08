import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envServer = path.resolve(__dirname, '../.env');
const envRoot = path.resolve(__dirname, '../../.env');

if (fs.existsSync(envServer)) {
  config({ path: envServer });
} else if (fs.existsSync(envRoot)) {
  config({ path: envRoot });
} else {
  config();
}

import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import dns from 'dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://yzbxsxabzncdzuxvlppt.supabase.co').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env");
}

class NodeSupabaseCircuitBreaker {
  constructor() {
    this.state = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this.consecutiveFailures = 0;
    this.lastStateChange = Date.now();
    this.failureThreshold = 15;
    this.cooldownMs = 5000;
    this.coalesceWindowMs = 400;
    this.lastFailureTime = 0;
  }

  canRequest() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastStateChange > this.cooldownMs) {
        this.state = 'HALF_OPEN';
        this.consecutiveFailures = Math.floor(this.failureThreshold / 2);
        this.lastStateChange = Date.now();
        return true;
      }
      return false;
    }
    return true;
  }

  canExecute() {
    return this.canRequest();
  }

  recordSuccess() {
    if (this.state !== 'CLOSED') {
      console.info('[Supabase Node CircuitBreaker] Conexão normalizada com sucesso. Circuito FECHADO.');
    }
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.lastStateChange = Date.now();
  }

  recordFailure() {
    // Se o disjuntor já está ABERTO, requisições bloqueadas não devem empurrar o cooldown para o futuro
    if (this.state === 'OPEN') {
      return;
    }

    const now = Date.now();
    if (this.lastFailureTime && (now - this.lastFailureTime < this.coalesceWindowMs)) {
      return;
    }
    if (this.lastFailureTime && (now - this.lastFailureTime > 20000)) {
      this.consecutiveFailures = 0;
    }
    this.lastFailureTime = now;
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.lastStateChange = Date.now();
      console.info(`[Supabase Node CircuitBreaker] ⚡ Disjuntor ABERTO após ${this.consecutiveFailures} janelas de falha consecutivas. Pausando retentativas ativas por ${this.cooldownMs / 1000}s para alívio do gateway.`);
    }
  }

  isCircuitOpen() {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastStateChange > this.cooldownMs) {
        this.state = 'HALF_OPEN';
        this.consecutiveFailures = Math.floor(this.failureThreshold / 2);
        this.lastStateChange = Date.now();
        console.info('[Supabase Node CircuitBreaker] Período de cooldown expirado. Transicionando para HALF_OPEN (permitindo requisições piloto)...');
        return false;
      }
      return true;
    }
    return false;
  }
}

export const nodeSupabaseCircuitBreaker = new NodeSupabaseCircuitBreaker();

export function isTransientSupabaseError(err) {
  if (!err) return false;
  const msg = String(err?.message || err?.details || err || '');
  const code = String(err?.code || '');
  const name = String(err?.name || '');
  return (
    msg.includes('CircuitBreaker') ||
    msg.includes('fetch failed') ||
    msg.includes('Timeout') ||
    msg.includes('timeout') ||
    msg.includes('aborted due to timeout') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('EPIPE') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('EAI_AGAIN') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ConnectTimeoutError') ||
    msg.includes('SocketError') ||
    msg.includes('Connection closed') ||
    msg.includes('database connection') ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    name === 'AbortError' ||
    name === 'TimeoutError'
  );
}

/**
 * Fetch resiliente com retry, jitter exponencial e tratamento de falhas de conexão / 5xx
 * para comunicação transparente e ininterrupta do Node.js com a API Supabase Cloud.
 */
async function resilientFetch(url, options = {}, retries = 2, delay = 600) {
  if (nodeSupabaseCircuitBreaker.isCircuitOpen()) {
    throw new Error('Supabase Node CircuitBreaker: Requisição pausada temporariamente para recuperação do gateway Supabase');
  }

  const fetchOptions = options.signal
    ? options
    : { ...options, signal: AbortSignal.timeout(12000) };

  try {
    const response = await fetch(url, fetchOptions);
    
    // Tratamento de instabilidade HTTP 5xx do gateway / servidor Supabase Cloud (500, 502, 503, 504, 520-524)
    if (response.status >= 500 && retries > 0) {
      const jitter = Math.floor(Math.random() * 300);
      const waitTime = delay + jitter;
      if (retries <= 1) {
        console.info(`[Supabase/HTTP] Instabilidade HTTP ${response.status} na API Supabase. Retentando em ${waitTime}ms... (${retries} retentativas restantes)`);
      }
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return resilientFetch(url, options, retries - 1, Math.min(Math.round(delay * 1.5), 4000));
    }
    
    if (response.ok) {
      nodeSupabaseCircuitBreaker.recordSuccess();
    } else if (response.status >= 500 && retries === 0) {
      nodeSupabaseCircuitBreaker.recordFailure();
    }

    return response;
  } catch (error) {
    const errorMsg = error?.message || String(error);
    const errorCode = error?.code || '';
    const errorName = error?.name || '';
    
    // Se o erro foi gerado pelo próprio CircuitBreaker, NÃO grava como nova falha da rede Supabase!
    if (errorMsg.includes('CircuitBreaker')) {
      throw error;
    }

    const isTransientNetworkError = 
      errorMsg.includes('fetch failed') ||
      errorMsg.includes('Timeout') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('ECONNRESET') ||
      errorMsg.includes('ETIMEDOUT') ||
      errorMsg.includes('EPIPE') ||
      errorMsg.includes('ENOTFOUND') ||
      errorMsg.includes('EAI_AGAIN') ||
      errorMsg.includes('ECONNREFUSED') ||
      errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
      errorCode === 'UND_ERR_SOCKET' ||
      errorCode === 'UND_ERR_BODY_TIMEOUT' ||
      errorCode === 'UND_ERR_HEADERS_TIMEOUT' ||
      errorMsg.includes('ConnectTimeoutError') ||
      errorMsg.includes('SocketError') ||
      errorMsg.includes('Connection closed') ||
      errorMsg.includes('database connection') ||
      errorName === 'AbortError' ||
      errorName === 'TimeoutError';

    if (isTransientNetworkError && retries > 0 && !nodeSupabaseCircuitBreaker.isCircuitOpen()) {
      const jitter = Math.floor(Math.random() * 350);
      const waitTime = delay + jitter;
      if (retries <= 1) {
        console.info(`[Supabase/Network] Auto-recuperando conexão (${errorMsg || errorCode}) em ${waitTime}ms... (${retries} retentativas restantes)`);
      }
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return resilientFetch(url, options, retries - 1, Math.min(Math.round(delay * 1.5), 4000));
    }
    
    if (retries === 0) {
      nodeSupabaseCircuitBreaker.recordFailure();
    }
    throw error;
  }
}

// Para prevenir o TypeError: connToClose.close is not a function do realtime-js
// Injetamos um transport WebSocket válido globalmente/locamente e fetch resiliente com retentativas
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    fetch: resilientFetch
  },
  realtime: {
    transport: WebSocket
  }
});

export const NODE_ID = (process.env.NODE_ID || `worker-local-${Math.random().toString(36).substring(7)}`).trim();
console.log(`[Worker Boot] Inicializado com NODE_ID: ${NODE_ID}`);

export async function retryWithBackoff(fn, retries = 1, delay = 600) {
  try {
    const res = await fn();
    if (res && typeof res === 'object' && res.error && retries > 0) {
      if (isTransientSupabaseError(res.error) && !nodeSupabaseCircuitBreaker.isCircuitOpen()) {
        const jitter = Math.floor(Math.random() * 300);
        const nextDelay = delay + jitter;
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        return retryWithBackoff(fn, retries - 1, Math.min(Math.round(delay * 1.5), 4000));
      }
    }
    return res;
  } catch (error) {
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes('CircuitBreaker') || nodeSupabaseCircuitBreaker.isCircuitOpen()) {
      throw error;
    }
    const errorCode = error?.code || '';
    const errorName = error?.name || '';
    const status = error?.status || error?.statusCode;

    const isNetworkError = 
      errorMsg.includes('fetch failed') ||
      errorMsg.includes('Timeout') ||
      errorMsg.includes('timeout') ||
      errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
      errorCode === 'UND_ERR_SOCKET' ||
      errorCode === 'UND_ERR_BODY_TIMEOUT' ||
      errorCode === 'UND_ERR_HEADERS_TIMEOUT' ||
      errorMsg.includes('ConnectTimeoutError') ||
      errorMsg.includes('SocketError') ||
      errorMsg.includes('Connection closed') ||
      errorMsg.includes('database connection') ||
      errorMsg.includes('ECONNRESET') ||
      errorMsg.includes('ETIMEDOUT') ||
      errorMsg.includes('EPIPE') ||
      errorMsg.includes('ENOTFOUND') ||
      errorMsg.includes('EAI_AGAIN') ||
      errorMsg.includes('ECONNREFUSED') ||
      errorName === 'AbortError' ||
      errorName === 'TimeoutError' ||
      (typeof status === 'number' && status >= 500);
        
    if (retries > 0 && isNetworkError) {
      const jitter = Math.floor(Math.random() * 300);
      const nextDelay = delay + jitter;
      console.info(`[Supabase/Network] Recuperando oscilação temporária (${errorMsg || errorCode}) em ${nextDelay}ms... (${retries} retentativas restantes)`);
      await new Promise(resolve => setTimeout(resolve, nextDelay));
      return retryWithBackoff(fn, retries - 1, Math.min(Math.round(delay * 1.5), 4000));
    }
    throw error;
  }
}

// Cache em memória para JIDs já resolvidos (evita roundtrips redundantes de rede no socket onWhatsApp)
const resolvedJidCache = new Map();
const JID_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Resolve e normaliza o JID real do destinatário WhatsApp para o Brasil (+55).
 * Trata nativamente a variação de 8 vs 9 dígitos para DDDs fora de SP (ex: DDD 34, 31, etc)
 * e consulta a tabela 'contacts' e o socket Baileys (onWhatsApp) para garantir entrega 100%.
 */
export async function resolveTargetJid(sock, jid, tenantId) {
  if (!jid || typeof jid !== 'string') return jid;
  if (jid.endsWith('@g.us') || jid.endsWith('@lid')) return jid;

  const cacheKey = `${tenantId || 'global'}_${jid}`;
  const cached = resolvedJidCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < JID_CACHE_TTL_MS)) {
    return cached.result;
  }

  let clean = jid.split('@')[0].replace(/\D/g, '');
  if (!clean) return jid;

  // Remove zero à esquerda do DDD se presente (ex: 55011... -> 5511... ou 011... -> 11...)
  if (clean.startsWith('550') && clean.length >= 13) {
    clean = '55' + clean.substring(3);
  } else if (clean.startsWith('0') && (clean.length === 11 || clean.length === 12)) {
    clean = clean.substring(1);
  }

  // Se a entrada tiver 10 ou 11 dígitos sem o DDI 55, adiciona o 55
  if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
    clean = '55' + clean;
  } else if (!clean.startsWith('55') && clean.length === 12 && /^[1-9]{2}99\d{8}$/.test(clean)) {
    // Ex: 349946928878 (usuário digitou DDD + 9 duplicado sem DDI 55) -> 5534946928878
    clean = '55' + clean.substring(0, 2) + clean.substring(3);
  }

  // Se for número brasileiro (+55) com 12 ou 13 dígitos
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    const ddd = parseInt(clean.substring(2, 4), 10);
    const numberPart = clean.substring(4);
    
    // Identifica se é Telefone Fixo (números iniciados por 2, 3, 4, 5)
    const firstDigit = numberPart.charAt(0);
    const isLandline = ['2', '3', '4', '5'].includes(firstDigit);

    let phone9 = clean;
    let phone8 = clean;

    if (!isLandline) {
      if (numberPart.length === 9 && numberPart.startsWith('9')) {
        phone9 = clean;
        phone8 = '55' + clean.substring(2, 4) + numberPart.substring(1);
      } else if (numberPart.length === 8) {
        phone8 = clean;
        phone9 = '55' + clean.substring(2, 4) + '9' + numberPart;
      }
    }

    const saveAndReturn = (finalJid) => {
      if (finalJid) {
        resolvedJidCache.set(cacheKey, { result: finalJid, timestamp: Date.now() });
        if (resolvedJidCache.size > 5000) {
          const oldestKey = resolvedJidCache.keys().next().value;
          resolvedJidCache.delete(oldestKey);
        }
      }
      return finalJid;
    };

    // A) SE FOR TELEFONE FIXO (ex: 551141351987): Retorna imediatamente sem adicionar 9!
    if (isLandline) {
      return saveAndReturn(`${phone8}@s.whatsapp.net`);
    }

    // B) OTIMIZAÇÃO CRÍTICA (Fast Path Zero-Latency):
    // Se o número já tem 13 dígitos com o 9º dígito (padrão absoluto para SP/RJ/ES DDDs 11 a 28, ou se já veio formatado)
    // retorna IMEDIATAMENTE sem gastar 2 a 5 segundos de rede no socket onWhatsApp ou roundtrip no Supabase!
    if (clean.length === 13 && numberPart.startsWith('9')) {
      if (ddd < 31) {
        return saveAndReturn(`${phone9}@s.whatsapp.net`);
      }
    }

    // C) SE HOUVER AMBIGUIDADE (ex: 12 dígitos em DDD >= 31 ou sem certeza do 9º dígito):
    // 1. Tentar consultar na tabela 'contacts' do Supabase primeiro (rápido com índice idx_contacts_whatsapp_jid)
    if (tenantId) {
      try {
        const { data: contact } = await supabase
          .from('contacts')
          .select('whatsapp_jid, phone')
          .eq('tenant_id', tenantId)
          .in('phone', [phone9, phone8])
          .limit(1)
          .maybeSingle();

        if (contact && contact.whatsapp_jid && contact.whatsapp_jid.includes('@s.whatsapp.net')) {
          return saveAndReturn(contact.whatsapp_jid);
        }
      } catch (e) {
        // Silenciado
      }
    }

    // 2. Consulta via socket Baileys onWhatsApp apenas se não encontrado no cache/banco, com timeout de 2.5s
    if (sock && typeof sock.onWhatsApp === 'function') {
      try {
        // Para DDD >= 31, o padrão do WhatsApp é 8 dígitos após o DDD (12 dígitos com 55), então prioriza phone8 na ordem
        const queryList = ddd >= 31
          ? Array.from(new Set([phone8, phone9]))
          : Array.from(new Set([phone9, phone8]));
        const onWhatsAppPromise = sock.onWhatsApp(...queryList);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_ONWHATSAPP')), 2500));
        const results = await Promise.race([onWhatsAppPromise, timeoutPromise]);
        if (Array.isArray(results)) {
          const valid = results.find(r => r && r.exists && r.jid);
          if (valid && valid.jid) {
            return saveAndReturn(valid.jid);
          }
        }
      } catch (e) {
        // Silenciado para prosseguir com fallback sem poluir o cache definitivo
      }
    }

    // 3. FALLBACK INTELIGENTE (Sem Socket ou Timeout no onWhatsApp):
    // Não grava no resolvedJidCache para permitir resolução oficial via onWhatsApp na próxima tentativa.
    // Para DDD >= 31 (MG, PR, SC, RS, Centro-Oeste, Nordeste, Norte), 99% das contas WhatsApp usam 8 dígitos (12 dígitos com DDI 55).
    if (ddd >= 31) {
      return `${phone8}@s.whatsapp.net`;
    }
    return `${phone9}@s.whatsapp.net`;
  }

  const finalJid = `${clean}@s.whatsapp.net`;
  resolvedJidCache.set(cacheKey, { result: finalJid, timestamp: Date.now() });
  return finalJid;
}


