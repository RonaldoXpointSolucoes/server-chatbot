const pg = require('pg');

const poolerUrls = [
  'postgresql://postgres.yzbxsxabzncdzuxvlppt:Xx%40gh03360102@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.yzbxsxabzncdzuxvlppt:Xx%40gh03360102@aws-0-sa-east-1.pooler.supabase.com:5432/postgres',
  'postgresql://postgres.yzbxsxabzncdzuxvlppt:Xx%40gh03360102@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.yzbxsxabzncdzuxvlppt:Xx%40gh03360102@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
  'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres'
];

async function tryConnect() {
  for (const url of poolerUrls) {
    console.log('Tentando conectar em:', url.split('@')[1]);
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      console.log('Conexão SUCESSO via:', url.split('@')[1]);
      
      await client.query(`
        ALTER TABLE public.checklists 
        ADD COLUMN IF NOT EXISTS cargo_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS cargo_ids JSONB DEFAULT '[]'::jsonb;
      `);
      console.log('Colunas cargo_id e cargo_ids adicionadas com sucesso na tabela checklists!');

      await client.query("NOTIFY pgrst, 'reload schema';");
      console.log('PostgREST schema cache recarregado!');

      await client.end();
      return true;
    } catch (e) {
      console.log('Falha:', e.message);
      try { await client.end(); } catch(_) {}
    }
  }
  return false;
}

tryConnect();
