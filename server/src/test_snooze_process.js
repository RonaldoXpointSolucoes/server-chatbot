import { supabase } from './supabase.js';
import snoozeManager from './snooze-manager.js';

async function run() {
  try {
    console.log("=== INICIANDO SIMULAÇÃO DE PROCESSO DE SNOOZE ===");

    // 1. Pegar uma conversa ativa de teste
    const { data: convs, error: err } = await supabase
      .from('conversations')
      .select('id, status, snoozed_until, updated_at')
      .limit(1);

    if (err) {
      console.error("Erro ao buscar conversa:", err);
      return;
    }

    if (!convs || convs.length === 0) {
      console.log("Nenhuma conversa encontrada.");
      return;
    }

    const testConv = convs[0];
    const originalStatus = testConv.status;
    const originalSnooze = testConv.snoozed_until;

    console.log(`[Teste] Conversa teste selecionada - ID: ${testConv.id}`);
    console.log(`[Teste] Valores originais - Status: ${originalStatus}, SnoozedUntil: ${originalSnooze}`);

    // 2. Definir status como 'snoozed' e snoozed_until no passado (10 segundos atrás)
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
    console.log(`[Teste] Atualizando no banco para status='snoozed' e snoozed_until=${tenSecondsAgo}...`);
    
    const { error: updateErr } = await supabase
      .from('conversations')
      .update({
        status: 'snoozed',
        snoozed_until: tenSecondsAgo
      })
      .eq('id', testConv.id);

    if (updateErr) {
      console.error("[Teste] Erro ao colocar conversa em snooze:", updateErr.message);
      return;
    }

    console.log("[Teste] Conversa colocada em snooze com sucesso no banco.");

    // 3. Executar imediatamente a checagem do SnoozeManager
    console.log("[Teste] Executando checkSnoozedConversations()...");
    await snoozeManager.checkSnoozedConversations();

    // 4. Buscar a conversa novamente para ver se o status mudou para 'open' e snoozed_until ficou null
    console.log("[Teste] Buscando conversa novamente para verificar resultado...");
    const { data: finalConvs, error: finalErr } = await supabase
      .from('conversations')
      .select('id, status, snoozed_until, updated_at')
      .eq('id', testConv.id);

    if (finalErr) {
      console.error("[Teste] Erro ao buscar resultado final:", finalErr.message);
      return;
    }

    const finalConv = finalConvs[0];
    console.log(`[Teste] Valores finais - Status: ${finalConv.status}, SnoozedUntil: ${finalConv.snoozed_until}`);

    if (finalConv.status === 'open' && finalConv.snoozed_until === null) {
      console.log("[Teste] SUCESSO! O SnoozeManager reabriu a conversa corretamente.");
    } else {
      console.log("[Teste] FALHA! A conversa não foi reaberta corretamente.");
      
      // Restaurar valores originais caso tenha falhado
      console.log("[Teste] Restaurando valores originais...");
      await supabase
        .from('conversations')
        .update({
          status: originalStatus,
          snoozed_until: originalSnooze
        })
        .eq('id', testConv.id);
    }

    console.log("=== FIM DA SIMULAÇÃO ===");
  } catch (e) {
    console.error("Erro crítico na simulação:", e);
  }
}

run();
