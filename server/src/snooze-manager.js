import { supabase } from './supabase.js';

class SnoozeManager {
  constructor() {
    this.intervalId = null;
  }

  start() {
    console.log('[SnoozeManager] Inicializando monitor de conversas adiadas...');
    // Roda a checagem a cada 30 segundos
    this.intervalId = setInterval(() => this.checkSnoozedConversations(), 30000);
    // Roda uma checagem imediata no boot
    this.checkSnoozedConversations();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async checkSnoozedConversations() {
    try {
      const now = new Date().toISOString();
      
      // Buscar todas as conversas cujo snooze expirou
      const { data: expiredConvs, error: selectError } = await supabase
        .from('conversations')
        .select('*')
        .eq('status', 'snoozed')
        .lte('snoozed_until', now);

      if (selectError) {
        console.error('[SnoozeManager] Erro ao buscar conversas expiradas:', selectError.message);
        return;
      }

      if (!expiredConvs || expiredConvs.length === 0) {
        return;
      }

      console.log(`[SnoozeManager] Encontradas ${expiredConvs.length} conversas com adiamento expirado. Reabrindo...`);

      for (const conv of expiredConvs) {
        // 1. Atualizar o status da conversa para 'open' e limpar o snoozed_until
        const { error: updateError } = await supabase
          .from('conversations')
          .update({
            status: 'open',
            snoozed_until: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', conv.id);

        if (updateError) {
          console.error(`[SnoozeManager] Erro ao reabrir conversa ${conv.id}:`, updateError.message);
          continue;
        }

        // 2. Inserir uma mensagem de sistema de reabertura permanente na conversa
        const systemMsgText = `⏰ Esta conversa foi reaberta de forma automática porque estava reagendada para hoje.`;
        const dbMsg = {
          conversation_id: conv.id,
          tenant_id: conv.tenant_id,
          text_content: systemMsgText,
          sender_type: 'system',
          direction: 'outgoing',
          status: 'sent',
          timestamp: new Date().toISOString(),
          instance_id: conv.instance_id
        };

        const { error: msgInsertError } = await supabase
          .from('messages')
          .insert([dbMsg]);

        if (msgInsertError) {
          console.error(`[SnoozeManager] Falha ao registrar mensagem de sistema para conversa ${conv.id}:`, msgInsertError.message);
        } else {
          console.log(`[SnoozeManager] Conversa ${conv.id} reaberta e mensagem do sistema inserida com sucesso.`);
        }
      }
    } catch (err) {
      console.error('[SnoozeManager] Exceção crítica no loop do snooze:', err);
    }
  }
}

const snoozeManager = new SnoozeManager();
export default snoozeManager;
