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

