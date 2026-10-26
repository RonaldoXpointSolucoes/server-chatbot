const fs = require('fs');
const path = require('path');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_since_sep15.json'), 'utf8'));

console.log('Total cards:', cards.length);

// Agrupamento por título normalizado / assunto
const clusters = {};

cards.forEach(c => {
  // Limpar prefixos comuns como [Sistema / Correção Crítica], [Backend], etc
  let cleanTitle = c.title
    .replace(/^\[.*?\]\s*/, '')
    .trim();

  // Vamos mapear por temas principais
  let theme = 'Outros';
  const t = (c.title + ' ' + (c.notes || '')).toLowerCase();

  if (t.includes('gastrofood') || t.includes('cardápio')) {
    theme = 'Integração Gastrofood & Cardápio';
  } else if (t.includes('impressão') || t.includes('imprimir') || t.includes('pausar i.a.')) {
    theme = 'Automação / Impressão & Pausa de IA';
  } else if (t.includes('dobra de colunas') || t.includes('persistência da dobra')) {
    theme = 'Kanban / UX Dobra de Colunas';
  } else if (t.includes('mensagens prontas') || t.includes('inversão da ordem de exibição')) {
    theme = 'Chat UI / Mensagens Prontas e Pastas';
  } else if (t.includes('ordem da lista de chats') || t.includes('manter ordem de listagem') || t.includes('resolver conversa') || t.includes('resolver ticket')) {
    theme = 'Chat / Ordenação de Conversas ao Resolver Tickets';
  } else if (t.includes('áudio com falhas') || t.includes('transcrição')) {
    theme = 'Chat / Mídia & Áudio & Transcrição';
  } else if (t.includes('perda de mensagens') || t.includes('duplicação e demora') || t.includes('falhas de envio')) {
    theme = 'Chat & WhatsApp / Envio, Deduplicação e Mídias';
  } else if (t.includes('fetchcontactpicture') || t.includes('foto de perfil') || t.includes('contato')) {
    theme = 'Frontend / Imagens de Contato & Redes Instáveis';
  } else if (t.includes('antigravity dev logger') || t.includes('log viewer') || t.includes('tela de logs') || t.includes('console do servidor')) {
    theme = 'DevTools / Console, Logs & Observabilidade';
  } else if (t.includes('simplificação do fluxo de chamados') || t.includes('refatoração de ui/ux')) {
    theme = 'CRM / UI/UX & Fluxo de Chamados';
  } else if (t.includes('skill \'fila dev\'') || t.includes('fila-dev')) {
    theme = 'Governança & Automação / Fila Dev';
  } else if (t.includes('gemini') || t.includes('circuitbreaker') || t.includes('credenciais gemini')) {
    theme = 'IA / Gemini & CircuitBreaker';
  } else if (t.includes('supabase') || t.includes('banco de dados')) {
    theme = 'Banco de Dados / Sincronização & Consultas';
  } else if (t.includes('baileys') || t.includes('sessionmanager') || t.includes('socket') || t.includes('conflito de sessão')) {
    theme = 'WhatsApp Engine / Sessões e Conexão';
  } else if (t.includes('estabilização e correção de erros operacionais') || t.includes('diagnóstico de sistema')) {
    theme = 'Diagnóstico Operacional / Sistema';
  }

  if (!clusters[theme]) clusters[theme] = [];
  clusters[theme].push(c);
});

console.log('\n--- TEMAS IDENTIFICADOS ---');
Object.keys(clusters).forEach(th => {
  console.log(`\n### Tema: ${th} (${clusters[th].length} cards)`);
  clusters[th].forEach(c => {
    console.log(`  - [${c.id.slice(0,8)}] [${c.status}] (${c.created_at.slice(0,10)}) ${c.title}`);
  });
});
