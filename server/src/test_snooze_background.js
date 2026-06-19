import { supabase } from './supabase.js';

async function run() {
  try {
    console.log("=== TESTANDO SNOOZE EM SEGUNDO PLANO (LOOP DO SERVIDOR) ===");

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
    console.log(`[Teste] Conversa selecionada - ID: ${testConv.id}`);
    console.log(`[Teste] Status original: ${testConv.status}, SnoozedUntil: ${testConv.snoozed_until}`);

    // 2. Colocar em snooze expirando em 5 segundos no futuro
    const expireTime = new Date(Date.now() + 5000).toISOString();
    console.log(`[Teste] Atualizando conversa para status='snoozed' e snoozed_until=${expireTime}...`);

    const { error: updateErr } = await supabase
      .from('conversations')
      .update({
        status: 'snoozed',
        snoozed_until: expireTime
      })
      .eq('id', testConv.id);

    if (updateErr) {
      console.error("[Teste] Erro ao colocar em snooze:", updateErr.message);
      return;
    }

    console.log("[Teste] Conversa colocada em snooze no banco. Agora vamos aguardar 40 segundos para ver se o loop do servidor de segundo plano a reabre automaticamente...");

    // Aguardar 45 segundos
    await new Promise(r => setTimeout(r, 45000));

    // 3. Buscar novamente a conversa no banco
    const { data: finalConvs, error: finalErr } = await supabase
      .from('conversations')
      .select('id, status, snoozed_until, updated_at')
      .eq('id', testConv.id);

    if (finalErr) {
      console.error("[Teste] Erro ao buscar resultado final:", finalErr.message);
      return;
    }

    const finalConv = finalConvs[0];
    console.log(`[Teste] Valores finais após 45 segundos - Status: ${finalConv.status}, SnoozedUntil: ${finalConv.snoozed_until}`);

    if (finalConv.status === 'open' && finalConv.snoozed_until === null) {
      console.log("[Teste] SUCESSO! O loop do servidor em segundo plano reabriu a conversa automaticamente.");
    } else {
      console.log("[Teste] FALHA! O loop do servidor em segundo plano NÃO reabriu a conversa.");
    }

    console.log("=== FIM DO TESTE ===");
  } catch (e) {
    console.error("Erro crítico no teste:", e);
  }
}

run();
