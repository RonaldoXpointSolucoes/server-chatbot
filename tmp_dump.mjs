import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log("Checking companies table...");
  const { data: companies, error: errC } = await sb.from('companies').select('*');
  console.log("Companies:", JSON.stringify(companies, null, 2));

  console.log("Checking one contact...");
  const { data: contacts, error: errCo } = await sb.from('contacts').select('*').limit(1);
  console.log("Contact:", JSON.stringify(contacts, null, 2));
}

check();
