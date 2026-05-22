const fs = require('fs');

const filePath = 'c:\\Users\\david\\OneDrive\\Documentos\\Projetos\\Antigravity\\ChatBoot\\src\\pages\ChatDashboard.tsx';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

// Vamos extrair apenas as linhas do return (linhas 1258 a 3373)
const returnLines = lines.slice(1257, 3373);

let stack = [];
let insideComment = false;

// Função para limpar strings JSX e expressões Javascript {} simples
function cleanLine(line) {
  let cleaned = line;
  
  // Remover comentários de linha
  cleaned = cleaned.replace(/\/\/.*$/, '');
  
  // Remover comentários de bloco JS/JSX
  cleaned = cleaned.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  
  return cleaned;
}

// Analisador simplificado de tags XML/JSX
for (let i = 0; i < returnLines.length; i++) {
  const lineNum = i + 1258;
  const line = cleanLine(returnLines[i]);
  
  // Regex para encontrar tags JSX: <tag ...> ou </tag>
  // Evitamos capturar operadores < ou > de comparação
  const tagRegex = /<\/?[a-zA-Z0-9_\-\.]+(?:\s+[a-zA-Z0-9_\-\.]+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|(?:\{[^\}]*\})|[^\s>]+))?)*\s*\/?>/g;
  
  let match;
  while ((match = tagRegex.exec(line)) !== null) {
    const fullTag = match[0];
    
    // Ignorar tags autocontidas como <br />, <img />, <input />, <Tag /> se terminarem em />
    if (fullTag.endsWith('/>')) continue;
    
    // Extrair o nome da tag
    const isClosing = fullTag.startsWith('</');
    const tagNameMatch = fullTag.match(/<\/?([a-zA-Z0-9_\-\.]+)/);
    if (!tagNameMatch) continue;
    const tagName = tagNameMatch[1];
    
    // Ignorar tags HTML autocontidas comuns que às vezes não têm barra no final (só por precaução)
    if (['img', 'input', 'br', 'hr', 'meta', 'link'].includes(tagName.toLowerCase()) && !isClosing) {
      continue;
    }
    
    if (isClosing) {
      if (stack.length === 0) {
        console.log(`[TAG EXTRA DE FECHAMENTO] </${tagName}> na linha ${lineNum}: ${line.trim()}`);
      } else {
        const last = stack.pop();
        if (last.name !== tagName) {
          console.log(`[ERRO DE CASAMENTO] Esperava </${last.name}> (aberta na linha ${last.line}), mas encontrou </${tagName}> na linha ${lineNum}: ${line.trim()}`);
          // Recoloca na pilha para tentar recuperar
          stack.push(last);
        }
      }
    } else {
      stack.push({ name: tagName, line: lineNum, text: line.trim() });
    }
  }
}

console.log(`\nTags que ficaram abertas na pilha: ${stack.length}`);
stack.forEach(t => {
  console.log(`Linha ${t.line}: <${t.name}> -> ${t.text}`);
});
