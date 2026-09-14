import { supabase } from '../src/supabase.js';

async function checkInstances() {
  const { data: insts } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('tenant_id', '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21');
  console.log('Instâncias do tenant 8b1e427b-2321-4ea7-9d7e-90f7d5cbad21:');
  console.log(insts?.map(i => ({ id: i.id, name: i.name, display_name: i.display_name, status: i.status, phone_number: i.phone_number })));

  const { data: instDirect } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', '5c78d358-d449-41c4-b396-a04ab20a39e4');
  console.log('Instância 5c78d358:', instDirect);

  process.exit(0);
}

checkInstances();
