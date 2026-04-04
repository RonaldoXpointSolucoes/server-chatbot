import * as fs from 'fs';
import * as path from 'path';

function getEnv(key) {
    const envPath = path.resolve('.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const result = content.split('\n').map(line => line.trim()).find(line => line.startsWith(key + '='));
    if (!result) return null;
    return result.split('=')[1].replace(/['"]/g, '');
}

const API_URL = getEnv('VITE_EVOLUTION_API_URL');
const GLOBAL_KEY = getEnv('VITE_EVOLUTION_GLOBAL_API_KEY');
const WEBHOOK_URL = getEnv('VITE_SUPABASE_WEBHOOK_URL');

async function run() {
  try {
    const res = await fetch(`${API_URL}/instance/fetchInstances`, {
      headers: { apikey: GLOBAL_KEY }
    });
    if(!res.ok) {
       console.error("Fetch instances failed", await res.text());
       return;
    }
    const instances = await res.json();
    console.log("Instances:", instances.map(i => i.instance.instanceName));

    for (let inst of instances) {
        const name = inst.instance.instanceName;
        console.log(`Setting webhook for ${name} to ${WEBHOOK_URL}...`);
        
        const setRes = await fetch(`${API_URL}/webhook/set/${name}`, {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               apikey: GLOBAL_KEY
            },
            body: JSON.stringify({
               webhook: {
                  enabled: true,
                  url: WEBHOOK_URL,
                  byEvents: false,
                  base64: true,
                  events: [
                    "APPLICATION_STARTUP",
                    "QRCODE_UPDATED",
                    "MESSAGES_SET",
                    "MESSAGES_UPSERT",
                    "MESSAGES_UPDATE",
                    "MESSAGES_DELETE",
                    "SEND_MESSAGE",
                    "CONTACTS_SET",
                    "CONTACTS_UPSERT",
                    "CONTACTS_UPDATE",
                    "PRESENCE_UPDATE",
                    "CHATS_SET",
                    "CHATS_UPSERT",
                    "CHATS_UPDATE",
                    "CHATS_DELETE",

                    "GROUPS_UPSERT",
                    "GROUP_UPDATE",
                    "GROUP_PARTICIPANTS_UPDATE",
                    "CONNECTION_UPDATE",
                    "CALL"
                  ]
               }
            })
        });
        const data = await setRes.json();
        console.log(`Result for ${name}:`, data);
    }
  } catch(e) {
    console.error("Fatal Error:", e);
  }
}
run();
