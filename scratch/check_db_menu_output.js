import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  try {
    const output = {};

    const { data: companies } = await supabase.from('companies').select('*');
    output.companies = companies ? companies.map(c => ({ id: c.id, name: c.name, slug: c.slug })) : [];

    const { data: bots } = await supabase.from('bots').select('*');
    output.bots = bots ? bots.map(b => ({
      id: b.id,
      name: b.name,
      tenant_id: b.tenant_id,
      active: b.active,
      systemPrompt: b.systemPrompt || b.system_prompt
    })) : [];

    const { data: chunks } = await supabase.from('knowledge_chunks').select('*').limit(20);
    output.knowledge_chunks = chunks ? chunks.map(c => ({
      id: c.id,
      tenant_id: c.tenant_id,
      content: c.content
    })) : [];

    fs.writeFileSync('scratch/check_db_menu_output.json', JSON.stringify(output, null, 2));
    console.log("Salvo com sucesso!");
  } catch (err) {
    console.error(err);
  }
}

run();
