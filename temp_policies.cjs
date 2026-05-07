const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres'
});

client.connect().then(() => {
  return client.query("SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'public.companies'::regclass");
}).then(res => {
  console.log(res.rows);
  return client.end();
}).catch(console.error);
