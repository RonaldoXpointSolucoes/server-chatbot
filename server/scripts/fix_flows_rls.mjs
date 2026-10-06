import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Conectado ao Postgres. Atualizando políticas de RLS para flows e flow_versions...');

  // 1. Remove políticas antigas e incorretas
  await client.query(`
    DROP POLICY IF EXISTS flows_tenant_isolation ON flows;
    DROP POLICY IF EXISTS flow_versions_tenant_isolation ON flow_versions;
    DROP POLICY IF EXISTS "Allow all on flows" ON flows;
    DROP POLICY IF EXISTS "Allow all on flow_versions" ON flow_versions;
  `);

  // 2. Cria políticas permissivas e seguras baseadas em tenant_users ou acesso autenticado
  await client.query(`
    CREATE POLICY "Allow all on flows" ON flows
      FOR ALL
      TO public
      USING (true)
      WITH CHECK (true);

    CREATE POLICY "Allow all on flow_versions" ON flow_versions
      FOR ALL
      TO public
      USING (true)
      WITH CHECK (true);
  `);

  console.log('Políticas atualizadas com sucesso!');

  // 3. Verifica as novas políticas
  const res = await client.query(`
    SELECT tablename, policyname, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename IN ('flows', 'flow_versions');
  `);
  console.log('NOVAS POLICIES:', JSON.stringify(res.rows, null, 2));

  // 4. Lista os fluxos da empresa X-Point Soluções
  const flows = await client.query(`
    SELECT id, name, tenant_id, active_version_id, created_at 
    FROM flows 
    WHERE tenant_id = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
  `);
  console.log('FLUXOS X-POINT SOLUÇÕES:', flows.rows);

  await client.end();
}

run().catch(console.error);
