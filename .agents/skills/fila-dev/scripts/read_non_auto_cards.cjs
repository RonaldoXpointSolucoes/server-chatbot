const fs = require('fs');
const path = require('path');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_since_sep15.json'), 'utf8'));

// Vamos inspecionar as notas dos cards não automáticos e dos automáticos relevantes
const nonAutoCards = [1, 10, 12, 14, 15, 16, 18, 19, 25, 26, 52, 56, 57, 58, 59, 60, 64, 66, 68, 71, 73];

console.log('=== DETALHES DOS CARDS PRINCIPAIS / ESPECÍFICOS ===\n');

nonAutoCards.forEach(idx => {
  const c = cards[idx - 1];
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`[#${idx}] ID: ${c.id}`);
  console.log(`STATUS: ${c.status} | DATA: ${c.created_at}`);
  console.log(`TITULO: ${c.title}`);
  console.log(`TAGS: ${JSON.stringify(c.tags)}`);
  console.log(`NOTAS (primeiros 600 caracteres):\n${(c.notes || '').slice(0, 600)}...\n`);
});
