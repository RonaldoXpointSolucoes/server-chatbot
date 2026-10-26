const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '../../../../');
const envPath = path.join(projectRoot, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
  if (m) {
    let v = (m[2] || '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
});

const { createClient } = require(path.join(projectRoot, 'node_modules/@supabase/supabase-js'));

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Connecting to Supabase:', supabaseUrl);
  const { data: boards, error: bErr } = await supabase.from('crm_boards').select('id, name, created_at, config');
  if (bErr) {
    console.error('Error fetching boards:', bErr);
    return;
  }
  console.log('Boards found:', boards.map(b => ({ id: b.id, name: b.name })));

  for (const b of boards) {
    const { count, error: cErr } = await supabase
      .from('crm_leads')
      .select('*', { count: 'exact', head: true })
      .eq('board_id', b.id);
    console.log(`Board: "${b.name}" (${b.id}) -> Total leads: ${count}`);
  }
}

main().catch(console.error);
