import fs from 'fs';
import path from 'path';

const files = [
  '.env',
  '.env.production',
  '.env.production.local',
  '.env.test.local',
  '.env.vercel',
  '.env - Copia.production'
];

files.forEach(file => {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    lines.forEach(line => {
      if (line.includes('GEMINI_API_KEY')) {
        const parts = line.split('=');
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim().replace(/^"(.*)"$/, '$1');
        console.log(`File: ${file} | Key: ${key} | Len: ${val.length} | Start: ${val.substring(0, 8)}... | End: ...${val.substring(val.length - 5)}`);
      }
    });
  } else {
    console.log(`File not found: ${file}`);
  }
});
