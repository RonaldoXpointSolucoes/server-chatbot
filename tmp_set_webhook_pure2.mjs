const API_URL = 'https://wsapi.xpointsolucoes.com.br';
const GLOBAL_KEY = '356c087d9-4073-4ceb-986a-09083992518c';
const WEBHOOK_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co/functions/v1/evolution-webhook';

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
        console.log(`Result for ${name}:`, JSON.stringify(data));
    }
  } catch(e) {
    console.error("Fatal Error:", e);
  }
}
run();
