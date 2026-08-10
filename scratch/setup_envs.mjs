import fetch from 'node-fetch';

const TOKEN = '1|9N4B49v001jV1vosQMx77EsVBC1HtlPHC8ewpDwf9b64e3d5';
const BASE_URL = 'https://coolify.xpointsolucoes.com.br/api/v1';

const BACKEND_UUID = 'fq2ailrq1q4smlsir1ackw5u';
const FRONTEND_UUID = 'fqjnl7aw5bxgzf5ph7nblvsa';

const backendEnvs = [
  { key: 'PORT', value: '3000' },
  { key: 'SUPABASE_URL', value: 'https://yzbxsxabzncdzuxvlppt.supabase.co' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k' },
  { key: 'DATABASE_URL', value: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres' },
  { key: 'DISABLE_AUTO_START_SESSIONS', value: 'false' },
  { key: 'IS_LOCAL_DEV', value: 'false' }
];

const frontendEnvs = [
  { key: 'VITE_SUPABASE_URL', value: 'https://yzbxsxabzncdzuxvlppt.supabase.co' },
  { key: 'VITE_SUPABASE_ANON_KEY', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjA3MDMsImV4cCI6MjA5MDc5NjcwM30.NmeEhsEqvg9Wp5fchUd5JyFt3K3e9Y-MHZ69wnNseec' },
  { key: 'VITE_WHATSAPP_ENGINE_URL', value: 'https://serverchat.xpointsolucoes.com.br' }
];

async function addEnv(appUuid, key, value) {
  const res = await fetch(`${BASE_URL}/applications/${appUuid}/envs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ key, value })
  });
  const data = await res.json();
  console.log(`[${appUuid}] Added ${key}:`, data);
}

async function run() {
  console.log("Configurando variáveis de ambiente do Backend...");
  for (const env of backendEnvs) {
    await addEnv(BACKEND_UUID, env.key, env.value);
  }
  console.log("Configurando variáveis de ambiente do Frontend...");
  for (const env of frontendEnvs) {
    await addEnv(FRONTEND_UUID, env.key, env.value);
  }
  console.log("Concluído com sucesso!");
}

run();
