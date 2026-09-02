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

async function check() {
  const { data, error } = await supabase.from('checklists').select('*').limit(10);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('CHECKLIST COLUMNS:', Object.keys(data[0] || {}));
    console.log('\nCHECKLISTS DATA:');
    data.forEach(d => {
      console.log({
        id: d.id,
        title: d.title,
        sector_id: d.sector_id,
        cargo_id: d.cargo_id,
        responsible_ids: d.responsible_ids
      });
    });
  }
}

check();
