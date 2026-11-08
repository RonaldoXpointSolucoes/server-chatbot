import { supabase, isTransientSupabaseError, nodeSupabaseCircuitBreaker } from './supabase.js';

class SnoozeManager {
  constructor() {
    this.intervalId = null;
    this.wasOffline = false;
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
      if (nodeSupabaseCircuitBreaker && typeof nodeSupabaseCircuitBreaker.isCircuitOpen === 'function' && nodeSupabaseCircuitBreaker.isCircuitOpen()) return;
      const now = new Date().toISOString();
      
      // Buscar todas as conversas cujo snooze expirou
      const { data: expiredConvs, error: selectError } = await supabase
        .from('conversations')
        .select('*')
        .eq('status', 'snoozed')
        .lte('snoozed_until', now);

      if (selectError) {
        const isFetchError = selectError.message && (
          selectError.message.includes('fetch failed') ||
          selectError.message.includes('getaddrinfo') ||
          selectError.message.includes('ENOTFOUND') ||
          selectError.message.includes('ETIMEDOUT') ||
          selectError.message.includes('ECONNRESET') ||
          selectError.message.includes('ECONNREFUSED') ||
          selectError.message.includes('request to') || selectError.message.includes('TimeoutError') || selectError.message.includes('AbortError') || selectError.message.toLowerCase().includes('aborted') || selectError.message.toLowerCase().includes('timeout') || isTransientSupabaseError(selectError)
        );

        if (isFetchError) {
          if (!this.wasOffline) {
            console.log('[SnoozeManager] Oscilação transitória na consulta ao Supabase (timeout/rede). O loop do Snooze tentará novamente em 30s.');
            this.wasOffline = true;
          }
        } else {
          console.warn('[SnoozeManager] Aviso ao buscar conversas expiradas:', selectError.message);
        }
        return;
      }

      if (this.wasOffline) {
        console.log('[SnoozeManager] Conexão com o Supabase restabelecida com sucesso!');
        this.wasOffline = false;
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
      if (!isTransientSupabaseError(err)) console.warn('[SnoozeManager] Aviso no loop do snooze:', err?.message || err);
    }
  }
}

const snoozeManager = new SnoozeManager();
export default snoozeManager;
