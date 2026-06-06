import pg from 'pg';
import fs from 'fs';

const envMap = {};
try {
  const envText = fs.readFileSync('.env', 'utf-8');
  envText.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if(match) envMap[match[1]] = match[2].trim();
  });
} catch(e) {}

const connectionString = envMap.DATABASE_URL || process.env.DATABASE_URL;

const client = new pg.Client({ connectionString });
await client.connect();

console.log("=== COLUNAS DA TABELA whatsapp_instances ===");
const resColumns = await client.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'whatsapp_instances'
`);
console.log(resColumns.rows);

console.log("=== POLÍTICAS DE whatsapp_instances E companies ===");
const resPolicies = await client.query(`
  SELECT tablename, policyname, cmd, qual, with_check 
  FROM pg_policies 
  WHERE schemaname = 'public' AND tablename IN ('whatsapp_instances', 'companies', 'economic_groups')
`);
console.log(resPolicies.rows);

console.log("=== EMPRESAS (companies) CADASTRADAS ===");
const resCompanies = await client.query(`
  SELECT id, name, economic_group_id FROM companies
`);
console.log(resCompanies.rows);

console.log("=== GRUPOS ECONÔMICOS (economic_groups) CADASTRADAS ===");
const resGroups = await client.query(`
  SELECT id, name FROM economic_groups
`);
console.log(resGroups.rows);

console.log("=== INSTÂNCIAS CADASTRADAS ===");
const resInst = await client.query(`
  SELECT id, display_name, tenant_id FROM whatsapp_instances
`);
console.log(resInst.rows);

await client.end();
