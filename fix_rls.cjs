const { Client } = require('pg');

const client = new Client({
  host: 'aws-0-sa-east-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.yzbxsxabzncdzuxvlppt',
  password: 'Xx@gh03360102',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
      await client.connect();
      const res = await client.query("SELECT polname FROM pg_policy WHERE polrelid = 'public.companies'::regclass");
      console.log("Existing policies:", res.rows);
      
      for (const row of res.rows) {
         console.log(`Dropping policy: ${row.polname}`);
         await client.query(`DROP POLICY IF EXISTS "${row.polname}" ON public.companies`);
      }
      
      console.log("Creating new SELECT policy for agents and owners...");
      await client.query(`
        CREATE POLICY "Users can view their companies" ON public.companies
        FOR SELECT 
        TO authenticated 
        USING (
          id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
        )
      `);
      console.log("Policies updated successfully.");
  } catch (e) {
      console.error(e);
  } finally {
      await client.end();
  }
}

run();
