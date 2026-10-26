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
  const boardId = '95be1dee-9d28-47d9-8ccf-d51a337f1572';
  const { data: cards, error } = await supabase
    .from('crm_leads')
    .select('id, title, priority, position, tags, status, created_at')
    .eq('board_id', boardId)
    .eq('status', 'analysis')
    .order('position', { ascending: true });

  if (error) {
    console.error('Erro:', error);
    return;
  }

  console.log(`\n📋 TOTAL DE CARTÕES NA FILA 'EM ANÁLISE': ${cards.length}\n`);
  cards.forEach((c, idx) => {
    console.log(`${String(idx + 1).padStart(2, '0')}. [P${c.priority}] [${c.id.slice(0, 8)}] ${c.title}`);
    console.log(`    Tags: ${JSON.stringify(c.tags)}`);
  });
}

main().catch(console.error);
