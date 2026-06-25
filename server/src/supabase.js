import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: VITE_SUPABASE_URL/SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env");
  process.exit(1);
}

// Para prevenir o TypeError: connToClose.close is not a function do realtime-js
// Injetamos um transport WebSocket válido globalmente/locamente
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  realtime: {
    transport: WebSocket
  }
});

export const NODE_ID = process.env.NODE_ID || `worker-local-${Math.random().toString(36).substring(7)}`;
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
      console.warn(`[Supabase/Network] Falha de rede/timeout (${error.message || error}). Retentando em ${delay}ms... (${retries} restantes)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

