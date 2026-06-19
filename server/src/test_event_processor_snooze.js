import { supabase } from './supabase.js';
import eventProcessor from './event-processor/index.js';

async function run() {
  try {
    console.log("=== TESTANDO REABERTURA VIA EVENT PROCESSOR (MENSAGEM DO CLIENTE) ===");

    // 1. Pegar a conversa de teste e o contato correspondente
    const { data: convs, error: err } = await supabase
      .from('conversations')
      .select('id, status, snoozed_until, contact_id, tenant_id, instance_id')
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
    
    // Buscar o contato correspondente para obter o whatsapp_jid ou telefone
    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('id, phone, name, whatsapp_jid')
      .eq('id', testConv.contact_id)
      .single();

    if (contactErr || !contact) {
      console.error("Erro ao buscar contato:", contactErr);
      return;
    }

    const jid = contact.whatsapp_jid || `${contact.phone}@s.whatsapp.net`;
    console.log(`[Teste] Conversa: ${testConv.id}, Contato JID: ${jid}`);
    console.log(`[Teste] Status original: ${testConv.status}`);

    const originalStatus = testConv.status;
    const originalSnooze = testConv.snoozed_until;

    // 2. Colocar conversa em 'snoozed' e snoozed_until no futuro (1 hora a partir de agora)
    const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    console.log(`[Teste] Colocando conversa em status='snoozed' e snoozed_until=${futureTime}...`);

    const { error: updateErr } = await supabase
      .from('conversations')
      .update({
        status: 'snoozed',
        snoozed_until: futureTime
      })
      .eq('id', testConv.id);

    if (updateErr) {
      console.error("[Teste] Erro ao colocar em snooze:", updateErr.message);
      return;
    }

    // 3. Simular o processamento da mensagem do cliente (inbound)
    console.log("[Teste] Chamando handleMessageUpsert com mensagem inbound do cliente...");
    const mockMsgId = 'MOCK_TEST_MSG_' + Date.now();
    const mockMessagePayload = {
      messages: [
        {
          key: {
            remoteJid: jid,
            fromMe: false,
            id: mockMsgId
          },
          pushName: contact.name || 'Cliente Teste',
          message: {
            conversation: 'Oi! Preciso de ajuda!'
          },
          messageTimestamp: Math.floor(Date.now() / 1000)
        }
      ],
      type: 'notify'
    };

    // Criamos um mock do socket do Baileys vazio, pois a nossa lógica de conversa só usa sock para LID mapping
    const mockSock = {
      signalRepository: {
        lidMapping: {
          getPNForLID: async () => null
        }
      }
    };

    await eventProcessor.handleMessageUpsert(testConv.tenant_id, testConv.instance_id, mockSock, mockMessagePayload);

    console.log("[Teste] Mensagem enfileirada. Aguardando 10 segundos para processamento em lote do event-processor...");
    await new Promise(r => setTimeout(r, 10000));

    // 4. Buscar a conversa no banco novamente para ver se ela acordou e mudou de status
    const { data: finalConvs, error: finalErr } = await supabase
      .from('conversations')
      .select('id, status, snoozed_until')
      .eq('id', testConv.id);

    if (finalErr) {
      console.error("[Teste] Erro ao buscar resultado final:", finalErr.message);
      return;
    }

    const finalConv = finalConvs[0];
    console.log(`[Teste] Status final: "${finalConv.status}" (SnoozedUntil: "${finalConv.snoozed_until}")`);

    if ((finalConv.status === 'open' || finalConv.status === 'bot') && finalConv.snoozed_until === null) {
      console.log("[Teste] SUCESSO! A mensagem do cliente acordou a conversa snoozed e limpou os campos de snooze.");
    } else {
      console.log("[Teste] FALHA! A conversa continuou em snooze.");
      
      // Restaurar originais caso falhou
      await supabase
        .from('conversations')
        .update({
          status: originalStatus,
          snoozed_until: originalSnooze
        })
        .eq('id', testConv.id);
    }

    console.log("=== FIM DO TESTE ===");
  } catch (e) {
    console.error("Erro crítico no teste:", e);
  }
}

run();
