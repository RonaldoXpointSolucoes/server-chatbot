import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

async function run() {
  const res = await fetch(`${url}/rest/v1/messages?select=text_content,timestamp&order=timestamp.desc&limit=10`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  const data = await res.json();
  data.forEach((d, i) => console.log(`${i+1}: ${d.text_content} (${d.timestamp})`));
}
run();
