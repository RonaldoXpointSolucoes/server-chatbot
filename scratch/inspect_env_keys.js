import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const lines = env.split('\n');

lines.forEach(line => {
  if (line.includes('GEMINI_API_KEY') || line.includes('SUPABASE')) {
    const parts = line.split('=');
    const key = parts[0].trim();
    let val = parts.slice(1).join('=').trim();
    console.log(`Key: ${key} | Len: ${val.length} | Start: ${val.substring(0, 8)}... | End: ...${val.substring(val.length - 5)}`);
  }
});
