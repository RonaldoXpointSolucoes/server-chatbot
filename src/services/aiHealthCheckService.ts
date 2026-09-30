import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase';
import { geminiService } from './geminiService';

export interface HealthCheckItem {
  id: string;
  name: string;
  category: 'api_key' | 'bots' | 'channels' | 'simulation';
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: string;
  latencyMs?: number;
  actionLabel?: string;
  actionRoute?: string;
}

export interface AiDiagnosticsReport {
  isHealthy: boolean; // 100% apto para responder
  hasWarnings: boolean;
  hasErrors: boolean;
  score: number; // 0 a 100%
  timestamp: string;
  items: HealthCheckItem[];
  summary: string;
}

export async function runAiHealthCheck(tenantId: string): Promise<AiDiagnosticsReport> {
  const items: HealthCheckItem[] = [];
  const startTime = Date.now();

  try {
    // 1. Buscar dados do Tenant / Empresa
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, settings, global_ai_enabled')
      .eq('id', tenantId)
      .maybeSingle();

    const companySettings = (company?.settings && typeof company.settings === 'object') ? company.settings : {};
    const apiKey = companySettings?.gemini_api_key || geminiService.getApiKey() || '';

    // ==========================================
    // PILAR 1: CHAVE DE API GEMINI & CONECTIVIDADE
    // ==========================================
    if (!apiKey || !apiKey.trim()) {
      items.push({
        id: 'api_key_missing',
        name: 'Chave de API Gemini',
        category: 'api_key',
        status: 'error',
        message: 'Nenhuma chave de API configurada para a empresa.',
        details: 'A Inteligência Artificial necessita de uma chave de API oficial do Google Gemini para responder aos clientes.',
        actionLabel: 'Configurar Chave Gemini',
        actionRoute: '/settings/credentials'
      });
    } else {
      try {
        const pingResult = await geminiService.testConnection(apiKey.trim());
        if (pingResult.ok) {
          items.push({
            id: 'api_key_ok',
            name: 'Conexão com a Inteligência Artificial',
            category: 'api_key',
            status: 'ok',
            message: `Google Gemini 100% operacional (${pingResult.latencyMs || 0}ms)`,
            details: `Modelo testado: ${pingResult.model || 'gemini-2.5-flash'}. Resposta recebida dentro dos padrões de velocidade.`,
            latencyMs: pingResult.latencyMs
          });
        } else {
          items.push({
            id: 'api_key_failed',
            name: 'Conexão com a Inteligência Artificial',
            category: 'api_key',
            status: 'error',
            message: pingResult.message,
            details: 'A chave configurada falhou no teste de validação interna.',
            actionLabel: 'Verificar Credenciais',
            actionRoute: '/settings/credentials'
          });
        }
      } catch (err: any) {
        items.push({
          id: 'api_key_exception',
          name: 'Conexão com a Inteligência Artificial',
          category: 'api_key',
          status: 'error',
          message: `Erro ao testar API Gemini: ${err.message || err}`,
          details: 'Falha inesperada ao tentar contato com os servidores da Google Generative AI.',
          actionLabel: 'Verificar Credenciais',
          actionRoute: '/settings/credentials'
        });
      }
    }

    // ==========================================
    // PILAR 2: ROBÔS (BOTS) CONFIGURADOS & PAPÉIS
    // ==========================================
    const { data: bots, error: botsErr } = await supabase
      .from('bots')
      .select('*')
      .eq('tenant_id', tenantId);

    const botList = bots || [];
    const activeBots = botList.filter(b => b.status === 'active');

    const isOrchestrator = (b: any) => {
      const name = String(b.name || '').toLowerCase();
      const role = String(b.role || '').toLowerCase();
      const cat = String(b.category || '').toLowerCase();
      return name.includes('(orquestrador)') || name.includes('orquestrador') || role === 'orquestrador' || cat === 'orquestrador';
    };

    if (botsErr) {
      items.push({
        id: 'bots_query_error',
        name: 'Configuração de Robôs',
        category: 'bots',
        status: 'error',
        message: 'Erro ao consultar robôs cadastrados no banco de dados.',
        details: botsErr.message
      });
    } else if (botList.length === 0) {
      items.push({
        id: 'bots_none',
        name: 'Robôs Ativos',
        category: 'bots',
        status: 'error',
        message: 'Nenhum robô cadastrado para esta empresa.',
        details: 'É necessário criar ao menos um robô com instruções de atendimento para responder clientes.',
        actionLabel: 'Criar Robô IA',
        actionRoute: '/settings/bots'
      });
    } else if (activeBots.length === 0) {
      items.push({
        id: 'bots_inactive',
        name: 'Robôs Ativos',
        category: 'bots',
        status: 'error',
        message: `Existem ${botList.length} robô(s) cadastrados, mas NENHUM está com status "Ativo".`,
        details: 'Ative ao menos um robô para que ele possa responder automaticamente.',
        actionLabel: 'Ativar Robô',
        actionRoute: '/settings/bots'
      });
    } else {
      // Robôs ativos existem
      const specialists = activeBots.filter(b => !isOrchestrator(b));
      const orchestrators = activeBots.filter(b => isOrchestrator(b));

      let botRoleStatus: 'ok' | 'warning' = 'ok';
      let botRoleMsg = `${activeBots.length} robô(s) inteligente(s) ativo(s): ${activeBots.map(b => b.name).join(', ')}`;
      let botRoleDetails = 'Robôs com diretrizes de resposta ativas e prontos para atender.';

      if (specialists.length === 0 && orchestrators.length > 0) {
        botRoleStatus = 'warning';
        botRoleMsg = `Robô ativo "${orchestrators[0].name}" configurado como Orquestrador.`;
        botRoleDetails = 'O robô operará em modo de atendimento direto unificado. Para fluxos avançados por setor, recomenda-se adicionar especialistas (ex: Recepção, Vendas).';
      }

      items.push({
        id: 'bots_active_ok',
        name: 'Robôs & Especialistas',
        category: 'bots',
        status: botRoleStatus,
        message: botRoleMsg,
        details: botRoleDetails,
        actionLabel: 'Gerenciar Robôs',
        actionRoute: '/settings/bots'
      });

      // Verificar AutoReply desativado
      const autoReplyOff = activeBots.filter(b => b.autoReply === false);
      if (autoReplyOff.length > 0) {
        items.push({
          id: 'bots_autoreply_off',
          name: 'Respostas Automáticas (Auto-Reply)',
          category: 'bots',
          status: 'warning',
          message: `${autoReplyOff.length} robô(s) ativo(s) estão com o Auto-Reply desativado.`,
          details: `Robôs: ${autoReplyOff.map(b => b.name).join(', ')}. Eles não enviarão mensagens automáticas.`,
          actionLabel: 'Ativar Auto-Reply',
          actionRoute: '/settings/bots'
        });
      }

      // Verificar Modo de Teste / Sandbox
      const inTestMode = activeBots.filter(b => b.test_mode === true);
      if (inTestMode.length > 0) {
        items.push({
          id: 'bots_test_mode',
          name: 'Modo Sandbox / Teste',
          category: 'bots',
          status: 'warning',
          message: `O robô "${inTestMode[0].name}" está em Modo de Teste restrito.`,
          details: `Ele só responderá mensagens originadas do telefone homologado: ${inTestMode[0].test_phone || 'Não informado'}. Mensagens de clientes reais serão silenciadas.`,
          actionLabel: 'Desativar Modo Teste',
          actionRoute: '/settings/bots'
        });
      }

      // Verificar System Prompt vazio
      const emptyPrompt = activeBots.filter(b => !b.systemPrompt || !b.systemPrompt.trim());
      if (emptyPrompt.length > 0) {
        items.push({
          id: 'bots_empty_prompt',
          name: 'Diretrizes do Robô (System Prompt)',
          category: 'bots',
          status: 'warning',
          message: `O robô "${emptyPrompt[0].name}" está sem instruções de atendimento (prompt vazio).`,
          details: 'Ele responderá de forma genérica sem conhecimento do seu negócio.',
          actionLabel: 'Editar Prompt',
          actionRoute: '/settings/bots'
        });
      }
    }

    // ==========================================
    // PILAR 3: CAIXAS DE ENTRADA & VINCULAÇÃO (CHANNELS)
    // ==========================================
    const { data: instances, error: instErr } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('tenant_id', tenantId);

    const instanceList = instances || [];
    const connectedInstances = instanceList.filter(i => 
      i.connection_status === 'connected' || i.status === 'connected' || i.status === 'active'
    );

    if (instErr) {
      items.push({
        id: 'instances_error',
        name: 'Caixas de Entrada WhatsApp',
        category: 'channels',
        status: 'error',
        message: 'Erro ao verificar caixas de entrada WhatsApp.',
        details: instErr.message
      });
    } else if (connectedInstances.length === 0) {
      items.push({
        id: 'instances_disconnected',
        name: 'Conexão do WhatsApp',
        category: 'channels',
        status: 'warning',
        message: 'Nenhuma caixa de entrada WhatsApp conectada no momento.',
        details: 'As mensagens só chegarão e serão respondidas quando houver ao menos um número conectado no sistema.',
        actionLabel: 'Conectar WhatsApp',
        actionRoute: '/settings/inboxes'
      });
    } else {
      const getInstanceName = (inst: any) => inst.display_name || inst.whatsapp_name || inst.name || inst.phone_number || 'Caixa WhatsApp';

      // Verificar se as caixas conectadas estão vinculadas aos robôs ativos
      const allActiveBotChannelIds = new Set<string>();
      activeBots.forEach(b => {
        if (Array.isArray(b.channels)) {
          b.channels.forEach((chId: string) => allActiveBotChannelIds.add(String(chId)));
        }
      });

      const unlinkedInstances = connectedInstances.filter(i => !allActiveBotChannelIds.has(String(i.id)));

      if (unlinkedInstances.length > 0 && activeBots.length > 0) {
        const unlinkedName = getInstanceName(unlinkedInstances[0]);
        items.push({
          id: 'instances_unlinked',
          name: 'Vinculação de Caixas ao Robô',
          category: 'channels',
          status: 'error',
          message: `A caixa WhatsApp "${unlinkedName}" NÃO está vinculada a nenhum robô ativo!`,
          details: `Para o robô responder automaticamente às mensagens que chegam nesta caixa, você precisa marcar a caixa "${unlinkedName}" nas opções de canais do robô.`,
          actionLabel: 'Vincular Caixa ao Robô',
          actionRoute: '/settings/bots'
        });
      } else {
        items.push({
          id: 'instances_linked_ok',
          name: 'Caixas WhatsApp Vinculadas',
          category: 'channels',
          status: 'ok',
          message: `${connectedInstances.length} caixa(s) WhatsApp conectada(s) e devidamente vinculada(s) aos robôs.`,
          details: `Caixas ativas: ${connectedInstances.map(i => getInstanceName(i)).join(', ')}.`
        });
      }

      // Verificar bot_active na instância
      const botDisabledInstances = connectedInstances.filter(i => {
        const s = (i.settings && typeof i.settings === 'object') ? i.settings : {};
        return i.bot_active === false || s.bot_active === false;
      });
      if (botDisabledInstances.length > 0) {
        const disabledName = getInstanceName(botDisabledInstances[0]);
        items.push({
          id: 'instances_bot_disabled',
          name: 'Robô Desativado na Caixa',
          category: 'channels',
          status: 'warning',
          message: `O robô está desativado nas configurações da caixa "${disabledName}".`,
          details: 'Nas opções avançadas da caixa de entrada, a chave "Ativar Robô" está desligada.',
          actionLabel: 'Ajustar Opções da Caixa',
          actionRoute: '/settings/inboxes'
        });
      }

      // Verificar Whitelist de teste na instância
      const testWhitelistInstances = connectedInstances.filter(i => {
        const s = (i.settings && typeof i.settings === 'object') ? i.settings : {};
        const testNums = i.bot_test_numbers || s.bot_test_numbers;
        return testNums && String(testNums).trim().length > 0;
      });
      if (testWhitelistInstances.length > 0) {
        const wlInst = testWhitelistInstances[0];
        const wlName = getInstanceName(wlInst);
        const wlNums = wlInst.bot_test_numbers || wlInst.settings?.bot_test_numbers;
        items.push({
          id: 'instances_whitelist',
          name: 'Filtro de Números de Teste na Caixa',
          category: 'channels',
          status: 'warning',
          message: `A caixa "${wlName}" possui números de teste definidos.`,
          details: `Apenas mensagens dos números [${wlNums}] receberão respostas automáticas do robô. Clientes normais serão silenciados.`,
          actionLabel: 'Ver Whitelist',
          actionRoute: '/settings/inboxes'
        });
      }
    }

    // ==========================================
    // PILAR 4: TESTE DE RESPOSTA DA IA (PING E2E)
    // ==========================================
    if (activeBots.length > 0 && apiKey) {
      try {
        const pingStart = Date.now();
        const primaryBot = activeBots[0];
        const client = new GoogleGenerativeAI(apiKey.trim());
        const model = client.getGenerativeModel({ model: primaryBot.model || 'gemini-2.5-flash' });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: 'Você é o robô de validação do sistema. Responda apenas "OPERACIONAL".' }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0.1 }
        });
        const responseText = (await result.response).text().trim();
        const pingLatency = Date.now() - pingStart;

        if (responseText) {
          items.push({
            id: 'simulation_ok',
            name: 'Teste de Geração de Resposta (E2E)',
            category: 'simulation',
            status: 'ok',
            message: `Robô gerou resposta com sucesso em ${pingLatency}ms!`,
            details: `Amostra da resposta: "${responseText.slice(0, 60)}"`,
            latencyMs: pingLatency
          });
        }
      } catch (simErr: any) {
        items.push({
          id: 'simulation_failed',
          name: 'Teste de Geração de Resposta (E2E)',
          category: 'simulation',
          status: 'warning',
          message: `Falha no teste de geração de resposta: ${simErr.message || simErr}`,
          details: 'O motor de IA respondeu com instabilidade na geração de conteúdo.'
        });
      }
    }

  } catch (globalErr: any) {
    items.push({
      id: 'global_diagnostics_error',
      name: 'Erro Geral de Diagnóstico',
      category: 'api_key',
      status: 'error',
      message: `Erro ao executar diagnóstico: ${globalErr.message || globalErr}`
    });
  }

  // Consolidar resultados
  const hasErrors = items.some(i => i.status === 'error');
  const hasWarnings = items.some(i => i.status === 'warning');
  const isHealthy = !hasErrors;

  // Cálculo de pontuação
  const totalScoreItems = items.length;
  const okCount = items.filter(i => i.status === 'ok').length;
  const warnCount = items.filter(i => i.status === 'warning').length;
  const score = totalScoreItems > 0 ? Math.round(((okCount * 1 + warnCount * 0.5) / totalScoreItems) * 100) : 0;

  let summary = '';
  if (isHealthy && !hasWarnings) {
    summary = '🎉 O Robô I.A está 100% funcional e pronto para responder as mensagens automaticamente!';
  } else if (isHealthy && hasWarnings) {
    summary = '⚡ O Robô I.A está operacional e apto a responder, mas há avisos de configuração que você deve revisar.';
  } else {
    summary = '⚠️ Foram detectadas falhas críticas ou falta de configuração que impedem o Robô I.A de responder clientes.';
  }

  return {
    isHealthy,
    hasWarnings,
    hasErrors,
    score,
    timestamp: new Date().toISOString(),
    items,
    summary
  };
}
