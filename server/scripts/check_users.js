import { supabase } from '../src/supabase.js';

async function checkUsers() {
  const { data: users } = await supabase
    .from('tenant_users')
    .select('id, email, name, role, tenant_id')
    .eq('tenant_id', '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21');
  console.log('Usuários do tenant:', users);
  process.exit(0);
}

checkUsers();
