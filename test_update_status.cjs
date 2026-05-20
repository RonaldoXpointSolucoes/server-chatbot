require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    await client.connect();
    
    // 1) Listar políticas RLS para a tabela conversations
    const rlsRes = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'conversations';
    `);
    console.log("=== RLS status ===");
    console.log(rlsRes.rows);

    const policiesRes = await client.query(`
      SELECT polname, polcmd, polroles, polqual::text, polwithcheck::text 
      FROM pg_policy 
      WHERE polrelid = 'public.conversations'::regclass;
    `);
    console.log("\n=== Policies ===");
    console.log(policiesRes.rows);

    // 2) Listar triggers para conversations
    const triggersRes = await client.query(`
      SELECT trigger_name, action_timing, event_manipulation, action_statement
      FROM information_schema.triggers 
      WHERE event_object_table = 'conversations';
    `);
    console.log("\n=== Triggers ===");
    console.log(triggersRes.rows);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

test();
