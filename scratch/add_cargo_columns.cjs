const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve('.env');
let supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
let supabaseKey = '';
if (fs.existsSync(envPath)) {
  const c = fs.readFileSync(envPath, 'utf8');
  c.split('\n').forEach(l => {
    const m = l.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (m) {
      if (m[1] === 'VITE_SUPABASE_URL') supabaseUrl = m[2].trim().replace(/^['"]|['"]$/g, '');
      if (m[1] === 'SUPABASE_SERVICE_ROLE_KEY' || m[1] === 'VITE_SUPABASE_ANON_KEY') {
        if (!supabaseKey || m[1] === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  });
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function alterTable() {
  try {
    const sql = `
      ALTER TABLE public.checklists 
      ADD COLUMN IF NOT EXISTS cargo_id uuid,
      ADD COLUMN IF NOT EXISTS cargo_ids jsonb DEFAULT '[]'::jsonb;
    `;
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
      console.log('RPC exec_sql error (normal if not defined):', error.message);
      // Tentativa de update para testar se coluna já existe
      const { data: testUpdate, error: testErr } = await supabase.from('checklists').select('id, cargo_id, cargo_ids').limit(1);
      if (testErr) {
        console.log('Columns do not exist yet:', testErr.message);
      } else {
        console.log('Columns exist! Data:', testUpdate);
      }
    } else {
      console.log('SQL executed successfully:', data);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

alterTable();
