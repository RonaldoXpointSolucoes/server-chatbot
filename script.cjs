const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory() && !file.includes('node_modules')) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}
const files = walk('./src');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let hasReplacement = false;
  if (content.includes("sessionStorage.getItem('current_tenant_id')")) {
    content = content.replace(/(?<!localStorage\.getItem\('current_tenant_id'\)\s*\|\|\s*)sessionStorage\.getItem\('current_tenant_id'\)/g, "(localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'))");
    hasReplacement = true;
  }
  if (content.includes("sessionStorage.getItem('current_tenant_name')")) {
    content = content.replace(/(?<!localStorage\.getItem\('current_tenant_name'\)\s*\|\|\s*)sessionStorage\.getItem\('current_tenant_name'\)/g, "(localStorage.getItem('current_tenant_name') || sessionStorage.getItem('current_tenant_name'))");
    hasReplacement = true;
  }
  if (hasReplacement) {
    fs.writeFileSync(file, content);
    console.log('Modified: ' + file);
  }
});
