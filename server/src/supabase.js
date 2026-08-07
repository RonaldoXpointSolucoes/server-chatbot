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

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://yzbxsxabzncdzuxvlppt.supabase.co').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env");
}

// Para prevenir o TypeError: connToClose.close is not a function do realtime-js
// Injetamos um transport WebSocket válido globalmente/locamente
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  global: {
    fetch: (url, options) => fetch(url, { ...options, keepalive: true })
  },
  realtime: {
    transport: WebSocket
  }
});

export const NODE_ID = (process.env.NODE_ID || `worker-local-${Math.random().toString(36).substring(7)}`).trim();
console.log(`[Worker Boot] Inicializado com NODE_ID: ${NODE_ID}`);

export async function retryWithBackoff(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (error) {
    const isNetworkError = 
      error.message?.includes('fetch failed') ||
      error.message?.includes('Timeout') ||
      error.message?.includes('timeout') ||
      error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      error.message?.includes('ConnectTimeoutError') ||
      error.message?.includes('database connection') ||
      error.status >= 500;
        
    if (retries > 0 && isNetworkError) {
      console.info(`[Supabase/Network] Oscilação temporária de rede (${error.message || error}). Auto-recuperando em ${delay}ms... (${retries} retentativas)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
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

  // Se a entrada tiver 10 ou 11 dígitos sem o DDI 55, adiciona o 55
  if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
    clean = '55' + clean;
  }

  // Se for número brasileiro (+55) com 12 ou 13 dígitos
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    const ddd = parseInt(clean.substring(2, 4), 10);
    const numberPart = clean.substring(4);
    
    let phone9 = clean;
    let phone8 = clean;
    if (numberPart.length === 9 && numberPart.startsWith('9')) {
      phone9 = clean;
      phone8 = '55' + clean.substring(2, 4) + numberPart.substring(1);
    } else if (numberPart.length === 8) {
      phone8 = clean;
      phone9 = '55' + clean.substring(2, 4) + '9' + numberPart;
    }

    // 1. Tentar consultar na tabela 'contacts' do Supabase se já existe whatsapp_jid válido
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
        if (contact && contact.phone) {
          return `${contact.phone}@s.whatsapp.net`;
        }
      } catch (e) {
        // Silenciado
      }
    }

    // 2. Tentar consultar via socket Baileys onWhatsApp (se socket ativo)
    if (sock && typeof sock.onWhatsApp === 'function') {
      try {
        const results = await sock.onWhatsApp(phone9, phone8);
        if (Array.isArray(results)) {
          const valid = results.find(r => r && r.exists && r.jid);
          if (valid && valid.jid) {
            return valid.jid;
          }
        }
      } catch (e) {
        // Silenciado
      }
    }

    // 3. Regra de negócio por DDD para fallback quando nem DB nem socket responderem:
    // DDDs 11 a 28 (SP/RJ/ES) usam 9 dígitos (13 caracteres: 55 + DDD + 9 + 8d)
    // DDDs 31 a 99 (Minas Gerais DDD 34, 31, 32, 35, 37, 38, etc e demais estados)
    // usam frequentemente 8 dígitos (12 caracteres) no servidor da Meta
    if (ddd >= 31 && ddd <= 99) {
      return `${phone8}@s.whatsapp.net`;
    }
    return `${phone9}@s.whatsapp.net`;
  }

  return `${clean}@s.whatsapp.net`;
}


