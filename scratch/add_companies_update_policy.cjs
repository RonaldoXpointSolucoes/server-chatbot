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
      
      // Check existing policies on public.companies
      const res = await client.query("SELECT policyname, cmd FROM pg_policies WHERE tablename = 'companies'");
      console.log("Current policies on public.companies:", res.rows);
      
      // Let's check if we have an UPDATE policy. If not, let's create it.
      const hasUpdatePolicy = res.rows.some(r => r.cmd === 'UPDATE');
      
      if (!hasUpdatePolicy) {
         console.log("No UPDATE policy found on companies. Creating one...");
         await client.query(`
           CREATE POLICY "Users can update their companies" ON public.companies
           FOR UPDATE 
           TO authenticated 
           USING (
             id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
           )
           WITH CHECK (
             id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
           )
         `);
         console.log("UPDATE policy created successfully!");
      } else {
         console.log("UPDATE policy already exists.");
      }
      
  } catch (e) {
      console.error("Error connecting or executing:", e);
  } finally {
      await client.end();
  }
}

run();
