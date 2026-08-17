const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateCard(cardId, deliveryReport) {
  const { data: card, error: fetchErr } = await supabase
    .from('crm_leads')
    .select('*')
    .eq('id', cardId)
    .single();

  if (fetchErr || !card) {
    console.error(`Falha ao buscar card ${cardId}:`, fetchErr?.message);
    return;
  }

  const prevHistory = card.history || [];
  const newHistoryItem = {
    at: new Date().toISOString(),
    by: 'Antigravity AI (Fila Dev)',
    to: 'testing',
    from: card.status || 'development',
    delivery_report: deliveryReport
  };

  const deliverySection = `\n\n---\n### 🚀 Registro de Entrega & Execução Técnica\n**Data/Hora:** ${new Date().toLocaleString('pt-BR')}\n**Executor:** Antigravity AI (Fila Dev)\n**Status:** Validado e migrado para Homologação & QA\n\n${deliveryReport.summary}`;
  const cleanNotes = (card.notes || '').split('### 🚀 Registro de Entrega & Execução Técnica')[0].trim();
  const updatedNotes = cleanNotes ? `${cleanNotes}${deliverySection}` : deliverySection.trim();

  const { data: updated, error: updateErr } = await supabase
    .from('crm_leads')
    .update({
      status: 'testing',
      history: [...prevHistory, newHistoryItem],
      notes: updatedNotes
    })
    .eq('id', cardId)
    .select()
    .single();

  if (updateErr) {
    console.error(`Erro ao atualizar card ${cardId}:`, updateErr.message);
  } else {
    console.log(`✅ Card "${updated.title}" migrado com sucesso para "Em Testes & QA"!`);
  }
}

async function main() {
  // 1. Card 1: Monitoramento Centralizado de Erros
  const report1 = {
    title: '[Sistema] Monitoramento Centralizado de Erros',
    status: 'testing',
    summary: 'Implementação completa da centralização e observabilidade de erros de Frontend e Backend no Supabase (system_logs). Criação do utilitário reportError e setupGlobalErrorLogging no frontend, interceptação global de window.onerror e window.onunhandledrejection, adição de rota POST /api/v1/system/logs/error e POST /api/logs/error no servidor Node.js e captura assíncrona não-bloqueante de erros 500 no middleware do Express com metadados de contexto.',
    executor: 'Antigravity AI (Fila Dev)',
    executed_at: new Date().toISOString(),
    validation: {
      status: 'Aprovado',
      type_checking: 'npx tsc --noEmit (0 erros)'
    },
    files_modified: [
      {
        file: 'server/src/system-logger.js',
        functions: ['persistSystemLog', 'capture', 'POST /error'],
        description: 'Persistência assíncrona não-bloqueante de erros no Supabase system_logs e rota para ingestão de erros.'
      },
      {
        file: 'server/src/index.js',
        functions: ['app.use /api/logs', 'errorMiddleware'],
        description: 'Roteamento de logs e captura de erros globais do Express com contexto da requisição.'
      },
      {
        file: 'src/utils/errorLogger.ts',
        functions: ['reportError', 'setupGlobalErrorLogging'],
        description: 'Módulo utilitário para interceptação de erros globais e envio ao DevLogger/Supabase.'
      },
      {
        file: 'src/main.tsx',
        functions: ['setupGlobalErrorLogging'],
        description: 'Inicialização dos listeners de erro globais no boot do React.'
      }
    ]
  };

  // 2. Card 2: Detalhamento de Execução em Cards 'Em Teste'
  const report2 = {
    title: "[Sistema] Detalhamento de Execução em Cards 'Em Teste'",
    status: 'testing',
    summary: 'Implementação de aba dinâmica e editável de Detalhamento da Execução Técnica no modal do card do Kanban, com metadados (data, executor, validação, resumo, arquivos e funções), formatação Markdown, botão de cópia de registro técnico e trava/bloqueio de governança para impedir a migração de cards para "Em Testes & QA" sem o devido preenchimento do relatório técnico.',
    executor: 'Antigravity AI (Fila Dev)',
    executed_at: new Date().toISOString(),
    validation: {
      status: 'Aprovado',
      type_checking: 'npx tsc --noEmit (0 erros)'
    },
    files_modified: [
      {
        file: 'src/pages/CrmKanban.tsx',
        functions: ['CRMLead interface', 'handleSaveTechnicalExecution', 'hasTechnicalExecutionDetails', 'handleDrop', 'handleAdvanceLead', 'technical tab rendering'],
        description: 'Interface dinâmica e editável para Detalhamento de Execução Técnica no modal de cards do Kanban e bloqueio de governança para migração sem preenchimento técnico.'
      },
      {
        file: '.agents/skills/fila-dev/scripts/get_dev_queue.cjs',
        functions: ['getDevQueue move'],
        description: 'Suporte à gravação estruturada de delivery_report no histórico e notas do card durante a movimentação para testes.'
      }
    ]
  };

  await migrateCard('3b098eb7-ce3f-486d-a00e-d3e3674e4108', report1);
  await migrateCard('91184df8-5987-424b-8170-2da4e54f8896', report2);
}

main().catch(console.error);
