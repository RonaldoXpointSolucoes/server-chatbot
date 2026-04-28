const fs = require('fs');
const filePath = 'src/store/chatStore.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target1 = `            const validContacts = dbContacts.filter(c => {
                if (c.instance_id) {
                    if (Array.isArray(allowedInstances) && allowedInstances.length > 0) {
                        if (!allowedInstances.includes(c.instance_id)) return false;
                    } else if (roleStr === 'agent' || roleStr === 'Agente') {
                        return false; // Agents with no allowed instances get nothing
                    }
                }`;
                
const replacement1 = `            const validContacts = dbContacts.filter(c => {
                const conv = dbConvs.find(cv => cv.contact_id === c.id);
                const effectiveInstanceId = conv?.instance_id || c.instance_id;
                
                if (effectiveInstanceId) {
                    if (Array.isArray(allowedInstances) && allowedInstances.length > 0) {
                        if (!allowedInstances.includes(effectiveInstanceId)) return false;
                    } else if (roleStr === 'agent' || roleStr === 'Agente') {
                        return false; // Agents with no allowed instances get nothing
                    }
                }`;

if (content.includes(target1)) {
    content = content.replace(target1, replacement1);
    fs.writeFileSync(filePath, content);
    console.log("Success");
} else {
    console.log("Not found target1");
}
