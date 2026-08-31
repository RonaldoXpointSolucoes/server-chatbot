const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const sql = `
    CREATE TABLE IF NOT EXISTS public.voucher_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      voucher_id TEXT,
      voucher_token TEXT,
      tipo_operacao TEXT,
      valor NUMERIC,
      beneficiario_nome TEXT,
      empresa_origem TEXT,
      status_anterior TEXT,
      status_novo TEXT,
      data_hora TIMESTAMPTZ DEFAULT NOW(),
      usuario_responsavel TEXT,
      hash_transacao TEXT,
      motivo TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE public.voucher_events ENABLE ROW LEVEL SECURITY;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'voucher_events' AND policyname = 'voucher_events_all') THEN
        CREATE POLICY voucher_events_all ON public.voucher_events FOR ALL USING (true) WITH CHECK (true);
      END IF;
    END $$;

    NOTIFY pgrst, 'reload schema';
  `;

  // Tenta chamar postgres RPCs existentes
  const rpcs = ['exec_sql', 'execute_sql', 'exec', 'execute', 'run_sql', 'sql'];
  for (const rpcName of rpcs) {
    try {
      const { data, error } = await supabase.rpc(rpcName, { query: sql, sql: sql, sql_query: sql });
      console.log(`RPC ${rpcName}:`, { data, error });
    } catch (e) {
      console.log(`RPC ${rpcName} exception:`, e.message);
    }
  }

  const { data: testData, error: testErr } = await supabase.from('voucher_events').select('*').limit(1);
  console.log('Verificação final voucher_events:', { testData, testErr });
}

run();
