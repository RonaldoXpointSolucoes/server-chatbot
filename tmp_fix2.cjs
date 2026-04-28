const fs = require('fs');
const filePath = 'src/store/chatStore.ts';
let content = fs.readFileSync(filePath, 'utf8');

const targetRegex = /instance_id:\s*dbC\.instance_id\s*\|\|\s*null/g;
const replacement = 'instance_id: conv.instance_id || dbC.instance_id || null';

if (targetRegex.test(content)) {
    content = content.replace(targetRegex, replacement);
    fs.writeFileSync(filePath, content);
    console.log("Success: replaced all instances.");
} else {
    console.log("Not found via regex");
}
