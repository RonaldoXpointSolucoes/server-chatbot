const fs = require('fs');
const path = require('path');

const logFilePath = path.join(
  'C:',
  'Users',
  'NOTE-(FORM)02JUL26',
  '.gemini',
  'antigravity',
  'brain',
  '103eea4c-7282-4512-90ff-95ba37d2cad9',
  '.system_generated',
  'steps',
  '665',
  'output.txt'
);

try {
  const content = fs.readFileSync(logFilePath, 'utf8');
  const lines = content.split('\\n');
  
  const keywords = ['online', 'Worker Boot', 'CardapioSync', 'AutoHealing', 'Error', 'Failed', 'Erro', 'Falha'];
  
  console.log(`Searching logs for keywords. Total lines: ${lines.length}`);
  
  for (const line of lines) {
    for (const kw of keywords) {
      if (line.toLowerCase().includes(kw.toLowerCase())) {
        console.log(`Match [${kw}]:`, line.substring(0, 200));
        break;
      }
    }
  }
} catch (e) {
  console.error("Error reading file:", e.message);
}
