const fs = require('fs');
const filePath = 'src/store/chatStore.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Ajuste no validContacts
const target1 = `                if (effectiveInstanceId) {
                    if (Array.isArray(allowedInstances) && allowedInstances.length > 0) {
                        if (!allowedInstances.includes(c.instance_id)) return false;`;
const rep1 = `                if (effectiveInstanceId) {
                    if (Array.isArray(allowedInstances) && allowedInstances.length > 0) {
                        if (!allowedInstances.includes(effectiveInstanceId)) return false;`;

content = content.replace(target1, rep1);

fs.writeFileSync(filePath, content);
console.log("Success");
