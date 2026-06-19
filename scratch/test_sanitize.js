const sanitizeJsonString = (str) => {
  let result = '';
  let inString = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (char === '"') {
      if (i > 0 && str[i - 1] === '\\') {
        result += char;
        continue;
      }
      
      const getPrevNonWhitespaceChar = (index) => {
        for (let j = index - 1; j >= 0; j--) {
          if (!/\s/.test(str[j])) return str[j];
        }
        return '';
      };
      
      const getNextNonWhitespaceChar = (index) => {
        for (let j = index + 1; j < str.length; j++) {
          if (!/\s/.test(str[j])) return str[j];
        }
        return '';
      };
      
      const prev = getPrevNonWhitespaceChar(i);
      const next = getNextNonWhitespaceChar(i);
      
      const isStructural = 
        prev === '{' || 
        prev === ',' || 
        next === ':' || 
        prev === ':' || 
        next === ',' || 
        next === '}';
        
      if (isStructural) {
        inString = !inString;
        result += char;
      } else {
        result += '\\"';
      }
    } else if (char === '\n') {
      if (inString) {
        result += '\\n';
      } else {
        result += char;
      }
    } else if (char === '\r') {
      if (!inString) {
        result += char;
      }
    } else {
      result += char;
    }
  }
  return result;
};

// Test cases
const test1 = `{
  "intent": "visualizar_cardapio",
  "agentId": "9f71c4c1-3d71-460a-9d95-e2db560a6713",
  "reasoning": "O cliente quer ver o cardápio",
  "reply": "Claro! Aqui está o nosso cardápio: http://localhost:3000/cardapio. Temos opções deliciosas!"
}`;

console.log("Test 1:");
try {
  const sanitized = sanitizeJsonString(test1);
  console.log("Sanitized:", sanitized);
  JSON.parse(sanitized);
  console.log("SUCCESS!");
} catch (e) {
  console.error("FAILED:", e.message);
}

const test2 = `{
  "intent": "visualizar_cardapio",
  "agentId": "9f71c4c1-3d71-460a-9d95-e2db560a6713",
  "reasoning": "O cliente quer salada",
  "reply": "Temos sim! Nossa Salada Caesar é excelente. Ela leva: alface americana crocante, tiras de frango grelhado, queijo parmesão e croutons crocantes, tudo envolvido em nosso molho Caesar especial.\\n\\nGostaria de pedir uma?"
}`;

console.log("\nTest 2:");
try {
  const sanitized = sanitizeJsonString(test2);
  console.log("Sanitized:", sanitized);
  JSON.parse(sanitized);
  console.log("SUCCESS!");
} catch (e) {
  console.error("FAILED:", e.message);
}

const test3 = `{
  "intent": "visualizar_cardapio",
  "agentId": "9f71c4c1-3d71-460a-9d95-e2db560a6713",
  "reasoning": "O cliente perguntou por salada",
  "reply": "Olá!
Temos várias opções de saladas. Exemplo:
- Salada Caesar: Deliciosa.
- Outra salada: Muito boa."
}`;

console.log("\nTest 3:");
try {
  const sanitized = sanitizeJsonString(test3);
  console.log("Sanitized:", sanitized);
  JSON.parse(sanitized);
  console.log("SUCCESS!");
} catch (e) {
  console.error("FAILED:", e.message);
}

const test4 = `{
  "intent": "visualizar_cardapio",
  "agentId": "9f71c4c1-3d71-460a-9d95-e2db560a6713",
  "reasoning": "O cliente perguntou por salada",
  "reply": "Aqui está o que temos: "Salada Caesar" é maravilhosa!
Temos também outros pratos."
}`;

console.log("\nTest 4:");
try {
  const sanitized = sanitizeJsonString(test4);
  console.log("Sanitized:", sanitized);
  JSON.parse(sanitized);
  console.log("SUCCESS!");
} catch (e) {
  console.error("FAILED:", e.message);
}

