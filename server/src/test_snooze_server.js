import { supabase } from './supabase.js';

async function run() {
  try {
    console.log("=== TESTANDO UPDATE DE STATUS PARA SNOOZED ===");
    
    // Pegar uma conversa qualquer para testar update temporário
    const { data: convs, error: err } = await supabase
      .from('conversations')
      .select('id, status, snoozed_until')
      .limit(1);

    if (err) {
      console.error("Erro ao buscar conversa:", err);
      return;
    }

    if (!convs || convs.length === 0) {
      console.log("Nenhuma conversa encontrada para teste.");
      return;
    }

    const testConv = convs[0];
    console.log(`Conversa original - ID: ${testConv.id}, status: ${testConv.status}, snoozed_until: ${testConv.snoozed_until}`);

    const originalStatus = testConv.status;
    const originalSnooze = testConv.snoozed_until;

    // Tentar atualizar para status = 'snoozed'
    console.log("Tentando atualizar status para 'snoozed'...");
    const { data: updated, error: updateErr } = await supabase
      .from('conversations')
      .update({
        status: 'snoozed',
        snoozed_until: new Date(Date.now() + 60000).toISOString() // 1 min no futuro
      })
      .eq('id', testConv.id)
      .select();

    if (updateErr) {
      console.error("ERRO ao atualizar para 'snoozed':", updateErr);
    } else {
      console.log("Sucesso ao atualizar para 'snoozed':", updated);
      
      // Restaurar valores originais
      console.log("Restaurando valores originais...");
      const { error: restoreErr } = await supabase
        .from('conversations')
        .update({
          status: originalStatus,
          snoozed_until: originalSnooze
        })
        .eq('id', testConv.id);
      
      if (restoreErr) {
        console.error("Erro ao restaurar conversa:", restoreErr);
      } else {
        console.log("Valores originais restaurados.");
      }
    }

    console.log("=== FIM DO TESTE ===");
  } catch (e) {
    console.error("Erro crítico:", e);
  }
}

run();
