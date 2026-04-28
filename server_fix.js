const fs = require('fs');
const filePath = 'server/src/event-processor/index.js';
let content = fs.readFileSync(filePath, 'utf8');

const regexToReplace = /return \{\s*\.\.\.ex,\s*id:\s*ex\.id\s*\|\|\s*crypto\.randomUUID\(\),\s*tenant_id:\s*c\.tenant_id,\s*phone:\s*c\.phone,\s*name:\s*finalName,\s*whatsapp_jid:\s*c\.whatsapp_jid,\s*instance_id:\s*c\.instance_id\s*\};/g;

const newPayload = `return {
                     tenant_id: c.tenant_id,
                     phone: c.phone,
                     name: finalName,
                     whatsapp_jid: c.whatsapp_jid,
                     instance_id: c.instance_id
                 };`;

if (regexToReplace.test(content)) {
    content = content.replace(regexToReplace, newPayload);
    fs.writeFileSync(filePath, content);
    console.log('Server UPSERT fix applied successfully.');
} else {
    console.log('Could not find regex in server file!');
}
