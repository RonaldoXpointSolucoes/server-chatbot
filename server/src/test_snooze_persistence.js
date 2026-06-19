import { supabase } from './supabase.js';

async function run() {
  try {
    console.log("=== TESTANDO PERSISTÊNCIA DO STATUS SNOOZED ===");

    // 1. Pegar uma conversa ativa de teste
    const { data: convs, error: err } = await supabase
      .from('conversations')
      .select('id, status, snoozed_until')
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

    console.log(`[Teste] Conversa selecionada - ID: ${testConv.id}`);
    console.log(`[Teste] Status original: ${originalStatus}`);

    // 2. Atualizar status para 'snoozed' e snoozed_until para amanhã
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    console.log(`[Teste] Atualizando status para 'snoozed' e snoozed_until=${tomorrow}...`);

    const { error: updateErr } = await supabase
      .from('conversations')
      .update({
        status: 'snoozed',
        snoozed_until: tomorrow
      })
      .eq('id', testConv.id);

    if (updateErr) {
      console.error("[Teste] Erro no update:", updateErr.message);
      return;
    }

    console.log("[Teste] Conversa atualizada. Agora vamos aguardar 15 segundos para ver se o status se mantém...");

    // Aguardar 15 segundos
    await new Promise(r => setTimeout(r, 15000));

    // 3. Ler novamente do banco
    const { data: finalConvs, error: finalErr } = await supabase
      .from('conversations')
      .select('id, status, snoozed_until')
      .eq('id', testConv.id);

    if (finalErr) {
      console.error("[Teste] Erro ao ler resultado final:", finalErr.message);
      return;
    }

    const finalConv = finalConvs[0];
    console.log(`[Teste] Status final após 15 segundos: "${finalConv.status}" (SnoozedUntil: "${finalConv.snoozed_until}")`);

    if (finalConv.status === 'snoozed') {
      console.log("[Teste] O status 'snoozed' persistiu com sucesso!");
    } else {
      console.log(`[Teste] ALERTA! O status mudou de 'snoozed' para '${finalConv.status}' sozinho!`);
    }

    // Restaurar valores originais
    console.log("[Teste] Restaurando valores originais...");
    await supabase
      .from('conversations')
      .update({
        status: originalStatus,
        snoozed_until: originalSnooze
      })
      .eq('id', testConv.id);

    console.log("=== FIM DO TESTE ===");
  } catch (e) {
    console.error("Erro no teste:", e);
  }
}

run();
