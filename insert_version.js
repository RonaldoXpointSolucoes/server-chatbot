const url = 'https://yzbxsxabzncdzuxvlppt.supabase.co/rest/v1/app_version';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Prefer': 'return=representation'
  },
  body: JSON.stringify({
    version: '2.8.19',
    deploy_date: new Date().toISOString()
  })
})
.then(async res => {
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha no banco: ${res.status} - ${txt}`);
  }
  return res.json();
})
.then(data => {
  console.log('Versão 2.8.19 registrada com sucesso no Supabase!', data);
  process.exit(0);
})
.catch(err => {
  console.error('Erro ao registrar versão no Supabase:', err);
  process.exit(1);
});
