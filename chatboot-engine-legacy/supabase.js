const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase Engine Auth Mode Inicializado com SERVICE_ROLE:', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and Service Role Key are required!');
}

// Utilizando service_role para evitar dores de cabeça na inserção backend de RLS
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = { supabase };
