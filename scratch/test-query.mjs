import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Ler variáveis do .env
const envText = fs.readFileSync('.env', 'utf-8');
const envMap = {};
envText.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envMap[match[1]] = match[2].trim();
});

const url = envMap.VITE_SUPABASE_URL;
const key = envMap.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log('Testando query de conversas adiadas...');
  
  // Vamos buscar o primeiro tenant_id no banco para simular
  const { data: tenants, error: tErr } = await supabase.from('tenants').select('id').limit(1);
  if (tErr || !tenants.length) {
    console.error('Erro ao buscar tenant:', tErr);
    return;
  }
  
  const tenantId = tenants[0].id;
  console.log(`Usando tenantId: ${tenantId}`);
  
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      status,
      contact_id,
      snoozed_until,
      snoozed_at,
      snoozed_by,
      instance_id,
      contacts (
        id,
        name,
        custom_name,
        push_name,
        phone,
        profile_picture_url
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'snoozed')
    .order('snoozed_until', { ascending: true });

  if (error) {
    console.error('❌ ERRO NA QUERY DO SUPABASE:', error);
  } else {
    console.log('✅ SUCESSO! Conversas encontradas:', data.length);
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
