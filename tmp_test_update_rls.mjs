import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos no .env!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  try {
    // 1) Pegar uma conversa ativa qualquer da tabela
    const { data: convs, error: fetchError } = await supabase
      .from('conversations')
      .select('id, status, tenant_id')
      .limit(5);

    if (fetchError) {
      console.error("Erro ao carregar conversas via chave anônima (RLS):", fetchError);
      return;
    }

    if (!convs || convs.length === 0) {
      console.log("Nenhuma conversa retornada pelo RLS!");
      return;
    }

    console.log("Conversas encontradas (amostra):", convs);

    const testConv = convs[0];
    console.log(`\nTentando atualizar o status da conversa ${testConv.id} para 'resolved' usando a chave anônima...`);

    const { data: updateData, error: updateError } = await supabase
      .from('conversations')
      .update({ status: 'resolved' })
      .eq('id', testConv.id)
      .select();

    if (updateError) {
      console.error("❌ ERRO NO UPDATE DE STATUS VIA RLS (Anon Key):", updateError);
    } else {
      console.log("✅ UPDATE EXECUTADO COM SUCESSO!", updateData);
      
      // Restaura o status original
      await supabase
        .from('conversations')
        .update({ status: testConv.status })
        .eq('id', testConv.id);
      console.log("Status original restaurado.");
    }

  } catch (e) {
    console.error("Exceção:", e);
  }
}

run();
