import fs from 'fs';
import path from 'path';

const logPath = 'C:\\Users\\ronal\\.gemini\\antigravity\\brain\\fb8ddabc-dc38-4032-8532-ffa018568cb4\\.system_generated\\tasks\\task-2862.log';
const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

console.log("Total lines:", lines.length);
const matches = lines.filter(l => l.toLowerCase().includes('corrections') || l.toLowerCase().includes('racioc'));
console.log("Matching lines count:", matches.length);
matches.slice(-50).forEach(m => console.log(m));
