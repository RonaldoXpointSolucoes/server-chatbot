import fs from 'fs';

const filePath = 'old_ChatDashboard.tsx';
const buf = fs.readFileSync(filePath);
// Convert to string replacing invalid UTF-8 bytes with clean text or removing them
const cleanText = buf.toString('utf8').replace(/\uFFFD/g, '');
fs.writeFileSync(filePath, cleanText, 'utf8');
console.log('Fixed encoding for old_ChatDashboard.tsx!');
