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

  const { data: leads, error } = await supabase
    .from('crm_leads')
    .select('id, title, status, created_at, tags, notes, priority, position, history')
    .eq('board_id', boardId)
    .gte('created_at', '2026-09-15T00:00:00Z')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${leads.length} cards since 2026-09-15.`);

  const summary = leads.map((l, i) => {
    return {
      index: i + 1,
      id: l.id,
      title: l.title,
      status: l.status,
      created_at: l.created_at,
      tags: l.tags,
      notes_snippet: (l.notes || '').slice(0, 150).replace(/\n/g, ' '),
      notes_full_length: (l.notes || '').length
    };
  });

  fs.writeFileSync(path.join(__dirname, 'cards_since_sep15.json'), JSON.stringify(leads, null, 2), 'utf8');
  console.log('Saved cards_since_sep15.json successfully.');

  summary.forEach(s => {
    console.log(`[${s.index}] [${s.status}] (${s.created_at.slice(0,10)}) ${s.title}`);
  });
}

main().catch(console.error);
