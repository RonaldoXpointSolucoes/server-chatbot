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

/**
 * Fetch resiliente com retry, jitter exponencial e tratamento de falhas de conexão / 5xx
 * para comunicação transparente e ininterrupta do Node.js com a API Supabase Cloud.
 */
async function resilientFetch(url, options = {}, retries = 4, delay = 800) {
  try {
    const response = await fetch(url, { ...options, keepalive: true });
    
    // Tratamento de instabilidade HTTP 5xx do gateway / servidor Supabase Cloud (500, 502, 503, 504, 520-524)
    if (response.status >= 500 && retries > 0) {
      const jitter = Math.floor(Math.random() * 300);
      const waitTime = delay + jitter;
      console.warn(`[Supabase/HTTP] Erro HTTP ${response.status} na API Supabase. Retentando em ${waitTime}ms... (${retries} retentativas restantes)`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return resilientFetch(url, options, retries - 1, Math.min(delay * 2, 6000));
    }
    
    return response;
  } catch (error) {
    const errorMsg = error?.message || String(error);
    const errorCode = error?.code || '';
    
    const isTransientNetworkError = 
      errorMsg.includes('fetch failed') ||
      errorMsg.includes('Timeout') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('ECONNRESET') ||
      errorMsg.includes('ETIMEDOUT') ||
      errorMsg.includes('EPIPE') ||
      errorMsg.includes('ENOTFOUND') ||
      errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
      errorCode === 'UND_ERR_SOCKET' ||
      errorMsg.includes('ConnectTimeoutError') ||
      errorMsg.includes('database connection');

    if (isTransientNetworkError && retries > 0) {
      const jitter = Math.floor(Math.random() * 350);
      const waitTime = delay + jitter;
      console.warn(`[Supabase/Network] Oscilação transitória de conexão (${errorMsg || errorCode}). Auto-recuperando em ${waitTime}ms... (${retries} retentativas restantes)`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return resilientFetch(url, options, retries - 1, Math.min(delay * 2, 6000));
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

export async function retryWithBackoff(fn, retries = 4, delay = 800) {
  try {
    return await fn();
  } catch (error) {
    const errorMsg = error?.message || String(error);
    const errorCode = error?.code || '';
    const status = error?.status || error?.statusCode;

    const isNetworkError = 
      errorMsg.includes('fetch failed') ||
      errorMsg.includes('Timeout') ||
      errorMsg.includes('timeout') ||
      errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
      errorCode === 'UND_ERR_SOCKET' ||
      errorMsg.includes('ConnectTimeoutError') ||
      errorMsg.includes('database connection') ||
      errorMsg.includes('ECONNRESET') ||
      errorMsg.includes('ETIMEDOUT') ||
      errorMsg.includes('EPIPE') ||
      errorMsg.includes('ENOTFOUND') ||
      (typeof status === 'number' && status >= 500);
        
    if (retries > 0 && isNetworkError) {
      const jitter = Math.floor(Math.random() * 300);
      const nextDelay = delay + jitter;
      console.info(`[Supabase/Network] Oscilação temporária de banco/rede (${errorMsg || errorCode}). Auto-recuperando em ${nextDelay}ms... (${retries} retentativas)`);
      await new Promise(resolve => setTimeout(resolve, nextDelay));
      return retryWithBackoff(fn, retries - 1, Math.min(delay * 2, 8000));
    }
    throw error;
  }
}

/**
 * Resolve e normaliza o JID real do destinatário WhatsApp para o Brasil (+55).
 * Trata nativamente a variação de 8 vs 9 dígitos para DDDs fora de SP (ex: DDD 34, 31, etc)
 * e consulta a tabela 'contacts' e o socket Baileys (onWhatsApp) para garantir entrega 100%.
 */
export async function resolveTargetJid(sock, jid, tenantId) {
  if (!jid || typeof jid !== 'string') return jid;
  if (jid.endsWith('@g.us') || jid.endsWith('@lid')) return jid;

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

    // A) SE FOR TELEFONE FIXO (ex: 551141351987): Retorna imediatamente sem adicionar 9!
    if (isLandline) {
      return `${phone8}@s.whatsapp.net`;
    }

    // B) SE FOR CELULAR:
    // 1. Tentar consultar via socket Baileys onWhatsApp (Fonte Primária de Verdade Nível Meta)
    if (sock && typeof sock.onWhatsApp === 'function') {
      try {
        const queryList = Array.from(new Set([phone9, phone8]));
        const results = await sock.onWhatsApp(...queryList);
        if (Array.isArray(results)) {
          // Se a Meta informar que existe um JID ativo no servidor (seja de 12 ou 13 dígitos), retorna o JID validado!
          const valid = results.find(r => r && r.exists && r.jid);
          if (valid && valid.jid) {
            return valid.jid;
          }
        }
      } catch (e) {
        // Silenciado
      }
    }

    // 2. Tentar consultar na tabela 'contacts' do Supabase se já existe whatsapp_jid validado no passado
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
          return contact.whatsapp_jid;
        }
      } catch (e) {
        // Silenciado
      }
    }

    // 3. FALLBACK INTELIGENTE (Sem Socket / Sem Registro Prévio):
    // Se a entrada original do usuário tiver 12 dígitos (ex: 556692545851 - sem o 9º dígito digitado)
    // E o DDD for >= 31 (ex: DDD 66 - Mato Grosso, MG, etc), mantém phone8 (12 dígitos).
    // Caso contrário (ex: DDD 11 a 28, ou se veio com 13 dígitos), utiliza phone9 (13 dígitos).
    if (clean.length === 12 && ddd >= 31) {
      return `${phone8}@s.whatsapp.net`;
    }
    return `${phone9}@s.whatsapp.net`;
  }

  return `${clean}@s.whatsapp.net`;
}


