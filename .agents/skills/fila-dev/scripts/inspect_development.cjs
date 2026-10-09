const { execSync } = require('child_process');
const output = execSync('node .agents/skills/fila-dev/scripts/get_dev_queue.cjs list', { encoding: 'utf-8' });
const json = JSON.parse(output);

console.log('=== SUMMARY DO QUADRO ===');
console.log(JSON.stringify(json.summary, null, 2));

console.log('\n=== CARDS EM DESENVOLVIMENTO (' + json.queue.development.length + ') ===');
json.queue.development.forEach((card, idx) => {
  console.log('--------------------------------------------------');
  console.log('Index:', idx + 1);
  console.log('ID:', card.id);
  console.log('Título:', card.title);
  console.log('Prioridade:', card.priority);
  console.log('Tags:', (card.tags || []).join(', '));
  console.log('Media count:', card.media_count);
  console.log('Attached media:', JSON.stringify(card.attached_media, null, 2));
  console.log('Recommended skills:', JSON.stringify(card.recommended_skills, null, 2));
  console.log('Notes completas:');
  console.log(card.notes);
});
