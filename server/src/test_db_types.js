import { supabase } from './supabase.js';

async function run() {
  try {
    console.log("=== ANÁLISE DE SEGMENTAÇÃO DE DADOS DO BANCO ===");
    
    // Consulta a definição da coluna na tabela conversations
    const { data: cols, error: err } = await supabase
      .from('conversations')
      .select('*')
      .limit(1);

    if (err) {
      console.error("Erro:", err);
      return;
    }

    // Como o supabase-js não expõe diretamente o data_type das colunas via select simples,
    // nós podemos consultar a view do postgres do information_schema de forma indireta?
    // Não, pois o RLS ou o PostgREST do Supabase não expõe a view information_schema.columns por padrão via API REST.
    // Mas nós temos a tabela pg_settings ou similar?
    // Podemos tentar fazer uma query no Supabase usando um truque: o supabase-js permite consultas do postgrest?
    // Não, ele só permite consultar tabelas expostas.
    // Mas nós podemos checar as datas e offsets retornados nas consultas reais!
    // Vamos olhar o valor bruto retornado de snoozed_until para as conversas que já vencera:
    
    const { data: convs, error: fetchErr } = await supabase
      .from('conversations')
      .select('id, status, snoozed_until')
      .not('snoozed_until', 'is', null)
      .limit(5);

    if (fetchErr) {
      console.error(fetchErr);
      return;
    }

    console.log("Valores retornados pelo Supabase:");
    for (const c of convs) {
      console.log(`- ID: ${c.id}`);
      console.log(`  snoozed_until bruto: "${c.snoozed_until}"`);
      console.log(`  Tipo JS do campo: ${typeof c.snoozed_until}`);
    }

    // Vamos checar o fuso horário retornado pelo PostgreSQL ao consultar a hora atual do banco
    // Mas não temos query direta de SQL.
    // E se compararmos no backend usando o PostgreSQL e usando o Node?
    // Vamos ver!
  } catch (e) {
    console.error(e);
  }
}

run();
