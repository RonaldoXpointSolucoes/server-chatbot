const fs = require('fs');
const path = require('path');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_since_sep15.json'), 'utf8'));

const groupsConfig = [
  {
    id: 'G01_CHAT_ORDER',
    title: '[Chat UI] Ordenação Estável da Lista de Conversas por Última Mensagem ao Resolver Tickets',
    type: 'feature',
    matcher: (c) => c.title.includes('Ordem da Lista de Chats Não Deve Alterar') || c.title.includes('Manter Ordem de Listagem')
  },
  {
    id: 'G02_KANBAN_FOLD',
    title: '[Kanban CRM] Persistência do Estado de Dobra/Colapso das Colunas no LocalStorage',
    type: 'feature',
    matcher: (c) => c.title.includes('Persistência da Dobra de Colunas')
  },
  {
    id: 'G03_QUICK_REPLIES',
    title: '[Chat UI] Inversão de Ordem no Modal de Respostas Rápidas: Mensagens Prontas antes das Pastas',
    type: 'feature',
    matcher: (c) => c.title.includes('Mensagens Prontas antes das Pastas')
  },
  {
    id: 'G04_AUDIO_TRANSCRIBE',
    title: '[Chat & Mídia] Correção de Áudios Picotados, Gravação WebM Opus e Pipeline de Transcrição por IA',
    type: 'bugfix_feature',
    matcher: (c) => c.title.includes('Áudio com Falhas e Melhoria na Transcrição')
  },
  {
    id: 'G05_MESSAGES_DEDUP_MEDIA',
    title: '[Chat & Mensageria] Envio Otimista Rápido, Deduplicação de Mensagens e Prevenção de Perda de Mídias',
    type: 'core_messaging',
    matcher: (c) => 
      c.title.includes('Eliminar Duplicação e Demora no Envio') ||
      c.title.includes('Perda de Mensagens, Imagens e Vídeos') ||
      c.title.includes('Falhas de Envio de Mensagens e Melhoria na Robustez') ||
      c.title.includes('fetchContactPicture')
  },
  {
    id: 'G06_CRM_TICKETS_UI',
    title: '[CRM / UI/UX] Refatoração e Simplificação do Fluxo e Modais de Chamados (Mobile-First)',
    type: 'ui_ux',
    matcher: (c) => c.title.includes('Simplificação do Fluxo de Chamados')
  },
  {
    id: 'G07_PRINT_PAUSE_AI',
    title: '[Automação / Atendimento] Pausa Automática da IA por 1 Hora após Disparo de Impressão de Recado',
    type: 'feature',
    matcher: (c) => c.title.includes('Pausar I.A. após Comando de Impressão')
  },
  {
    id: 'G08_GASTROFOOD_CACHE',
    title: '[Integração Gastrofood] Cache Inteligente de Cardápio, Resiliência a Falhas HTTP e Sanitização de Rotas',
    type: 'integration',
    matcher: (c) => c.title.includes('Gastrofood') || c.title.includes('Cardápio Gastrofood')
  },
  {
    id: 'G09_DEVLOGGER_CONSOLE',
    title: '[DevTools & Observabilidade] Console do Servidor, Antigravity DevLogger com Filtros e Ação Criar Card CRM',
    type: 'devtools',
    matcher: (c) => 
      c.title.includes('Log Viewer com IA') ||
      c.title.includes('Tela de Logs Antigravity') ||
      c.title.includes('Antigravity Dev Logger') ||
      c.title.includes('Console do Servidor Incorreto')
  },
  {
    id: 'G10_GEMINI_AI_CIRCUITBREAKER',
    title: '[AI Engine Next-Gen] Pool Multi-Keys Gemini, Rotação em Rate Limit e CircuitBreaker Resiliente',
    type: 'ai_engine',
    matcher: (c) => c.title.includes('Credenciais Gemini') || c.title.includes('CircuitBreaker')
  },
  {
    id: 'G11_APPWRITE_PERSISTENCE',
    title: '[Arquitetura de Dados Next-Gen] Migração Integral de Queries Supabase para Appwrite Self-Hosted (chatboot_db)',
    type: 'database',
    matcher: (c) => c.title.includes('Sincronização Supabase') || c.title.includes('Erros de Consulta e Sincronização')
  },
  {
    id: 'G12_GOVERNANCE_FILA_DEV',
    title: '[Governança & Automação] Aprimoramento da Skill \'Fila Dev\' e Análise Visual de Screenshots por IA',
    type: 'governance',
    matcher: (c) => c.title.includes('Fila Dev') || c.title.includes('Otimização de Layout UI/UX via IA com Análise de Screenshots')
  },
  {
    id: 'G13_WHATSMEOW_ENGINE',
    title: '[WhatsApp Engine Next-Gen] Substituição da Baileys por Whatsmeow Worker em Go e Conexão com Appwrite',
    type: 'engine_core',
    // Captura qualquer outro relacionado a Baileys, SessionManager, Lock loop, ou diagnósticos residuais
    matcher: (c) => true
  }
];

const mappedCards = [];
const groupBuckets = {};
groupsConfig.forEach(g => groupBuckets[g.id] = []);

cards.forEach(c => {
  let matchedGroup = null;
  for (const g of groupsConfig) {
    if (g.matcher(c)) {
      matchedGroup = g;
      break;
    }
  }
  groupBuckets[matchedGroup.id].push(c);
  mappedCards.push({ cardId: c.id, title: c.title, groupId: matchedGroup.id });
});

console.log('--- DISTRIBUIÇÃO DOS 73 CARDS NOS 13 GRUPOS ---');
groupsConfig.forEach(g => {
  const count = groupBuckets[g.id].length;
  console.log(`[${g.id}] ${g.title}: ${count} cards`);
});

const totalMapped = Object.values(groupBuckets).reduce((acc, list) => acc + list.length, 0);
console.log(`\nTotal mapeado: ${totalMapped} de ${cards.length}`);
