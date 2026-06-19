import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/check_burguer_plus_output.json', 'utf8'));

console.log("=== KNOWLEDGE CHUNKS CONTAINING 'salada' ===");
const matchedChunks = data.knowledge_chunks.filter(c => c.content.toLowerCase().includes('salada'));
matchedChunks.forEach((c, idx) => {
  console.log(`\nChunk ${idx + 1} (id: ${c.id}):`);
  console.log(c.content);
});

console.log("\n=== KNOWLEDGE CHUNKS CONTAINING 'caesar' ===");
const matchedCaesar = data.knowledge_chunks.filter(c => c.content.toLowerCase().includes('caesar'));
matchedCaesar.forEach((c, idx) => {
  console.log(`\nChunk ${idx + 1} (id: ${c.id}):`);
  console.log(c.content);
});
