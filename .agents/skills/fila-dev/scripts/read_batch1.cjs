const fs = require('fs');
const path = require('path');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_since_sep15.json'), 'utf8'));

const firstBatch = [1, 10, 12, 14, 15, 16, 18, 19, 25, 26, 52, 56, 57, 58];

firstBatch.forEach(idx => {
  const c = cards[idx - 1];
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`[#${idx}] ID: ${c.id}`);
  console.log(`STATUS: ${c.status} | DATA: ${c.created_at}`);
  console.log(`TITULO: ${c.title}`);
  console.log(`NOTAS (primeiros 500 caracteres):\n${(c.notes || '').slice(0, 500)}...\n`);
});
