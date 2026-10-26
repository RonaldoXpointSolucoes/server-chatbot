const fs = require('fs');
const path = require('path');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_since_sep15.json'), 'utf8'));

console.log(`Total: ${cards.length} cards`);

const categorized = cards.map((c, idx) => {
  const isAutoDiagnostic = 
    c.title.includes('[Diagnóstico de Sistema]') ||
    c.title.includes('[WhatsApp Engine] Estabilização de Conexão') ||
    c.title.includes('[Banco de Dados] Resolução de Erros de Consulta') ||
    c.title.includes('[IA / Automação] Resolução de Credenciais Gemini') ||
    c.title.includes('[Integração Gastrofood] Tratamento de Falhas') ||
    c.title.includes('[Sistema / Correção Crítica]');

  let historySummary = [];
  if (Array.isArray(c.history)) {
    historySummary = c.history.map(h => `${h.by || 'unknown'}: ${h.action || h.to || ''}`);
  }

  // Primeiro bloco de notas
  const firstNoteLine = (c.notes || '').split('\n').filter(l => l.trim().length > 0)[0] || '';

  return {
    idx: idx + 1,
    id: c.id,
    title: c.title,
    status: c.status,
    created_at: c.created_at,
    tags: c.tags,
    isAutoDiagnostic,
    firstNoteLine: firstNoteLine.slice(0, 100)
  };
});

console.log('--- RELAÇÃO COMPLETA DOS 73 CARDS ---');
categorized.forEach(c => {
  console.log(`[${String(c.idx).padStart(2, '0')}] [${c.status.padEnd(10)}] (${c.created_at.slice(0, 16)}) [Auto: ${c.isAutoDiagnostic ? 'SIM' : 'NÃO'}] ${c.title}`);
});

console.log('\n--- CARDS NÃO-AUTOMÁTICOS / ESPECÍFICOS ---');
categorized.filter(c => !c.isAutoDiagnostic).forEach(c => {
  console.log(`[${String(c.idx).padStart(2, '0')}] [${c.status.padEnd(10)}] ${c.title}`);
});
