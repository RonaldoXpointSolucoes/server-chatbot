import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function check() {
  const { data, error } = await supabase.from('tenants').select('*');
  console.log("Tenants:", data);
  console.log("Error:", error);
  
  if (data && data.length === 0) {
    console.log("Inserindo tenant padrao...");
    await supabase.from('tenants').insert({ name: 'Master Tenant', evolution_instance_name: 'master' });
    const { data: t2 } = await supabase.from('tenants').select('*');
    console.log("Tenants agora:", t2);
  }
}
check();
