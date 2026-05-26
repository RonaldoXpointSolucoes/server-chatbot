import fs from 'fs';

const content = fs.readFileSync('src/pages/ChatDashboard.tsx', 'utf8');
const lines = content.split('\n');

const query = process.argv[2] || '';
console.log(`Searching for "${query}" in src/pages/ChatDashboard.tsx...`);

let matchesCount = 0;
lines.forEach((line, index) => {
  if (line.toLowerCase().includes(query.toLowerCase())) {
    matchesCount++;
    if (matchesCount <= 50) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
console.log(`Total matches: ${matchesCount}`);
