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

  // Buscar todos os leads
  const { data: leads, error } = await supabase
    .from('crm_leads')
    .select('id, title, status, created_at, tags, notes, priority, position')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching leads:', error);
    return;
  }

  console.log(`Total leads: ${leads.length}`);

  // Analisar range de datas
  if (leads.length > 0) {
    console.log('Primeiro lead created_at:', leads[0].created_at);
    console.log('Último lead created_at:', leads[leads.length - 1].created_at);
  }

  // Filtrar >= 2026-09-15
  const sinceSep15 = leads.filter(l => {
    const d = new Date(l.created_at);
    return d >= new Date('2026-09-15T00:00:00Z');
  });

  console.log(`Leads created >= 2026-09-15: ${sinceSep15.length}`);

  // Agrupar por status geral
  const byStatus = {};
  leads.forEach(l => {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  });
  console.log('All leads by status:', byStatus);

  const byStatusSinceSep15 = {};
  sinceSep15.forEach(l => {
    byStatusSinceSep15[l.status] = (byStatusSinceSep15[l.status] || 0) + 1;
  });
  console.log('Leads >= 2026-09-15 by status:', byStatusSinceSep15);

  console.log('\n--- DETALHES DOS LEADS >= 2026-09-15 ---');
  sinceSep15.forEach((l, idx) => {
    console.log(`[${idx + 1}] ID: ${l.id} | Status: ${l.status} | Created: ${l.created_at} | Title: ${l.title}`);
  });
}

main().catch(console.error);
