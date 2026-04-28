const fs = require('fs');
const filePath = 'src/store/chatStore.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Usando regex para ser mais flexível com whitespaces!
const targetRegex = /const validContacts = dbContacts\.filter\(c => \{\s*if \(c\.instance_id\) \{\s*if \(Array\.isArray\(allowedInstances\)/m;

const replacement = `const validContacts = dbContacts.filter(c => {
                const conv = dbConvs.find(cv => cv.contact_id === c.id);
                const effectiveInstanceId = conv?.instance_id || c.instance_id;
                
                if (effectiveInstanceId) {
                    if (Array.isArray(allowedInstances)`;

if (targetRegex.test(content)) {
    content = content.replace(targetRegex, replacement);
    fs.writeFileSync(filePath, content);
    console.log("Success");
} else {
    console.log("Not found target1 via regex");
}
