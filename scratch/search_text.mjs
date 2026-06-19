import fs from 'fs';
import path from 'path';

const searchDir = './';
const searchStrings = ['Reativar', 'pausada', 'resolver', 'prestes'];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    if (file === 'node_modules' || file === '.git' || file === '.vercel' || file === 'dist' || file === 'dev-dist') return;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.jsx') || fullPath.endsWith('.json') || fullPath.endsWith('.html') || fullPath.endsWith('.sql')) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const files = walk(searchDir);
console.log(`Found ${files.length} code files to search.`);

files.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    searchStrings.forEach(str => {
      if (content.toLowerCase().includes(str.toLowerCase())) {
        console.log(`Match for "${str}" in file: ${file}`);
      }
    });
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
});
