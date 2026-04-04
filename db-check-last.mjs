import fs from 'fs';

// simple .env parser
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

async function run() {
  const res = await fetch(`${url}/rest/v1/messages?select=text_content,sender_type,timestamp,whatsapp_id&order=timestamp.desc&limit=5`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  console.log("DB Messages:");
  console.log(await res.json());
}
run();
