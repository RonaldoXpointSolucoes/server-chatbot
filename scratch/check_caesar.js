import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/check_burguer_plus_output.json', 'utf8'));
const caesar = data.cardapio_produtos.find(p => p.id === 'E21E0CCF-3B4A-42EE-801F-0AEFBCD54C23');

console.log("SALADA CAESAR product details:", caesar);
