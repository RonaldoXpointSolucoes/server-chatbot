const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres' });
client.connect().then(() => {
  client.query("SELECT policyname, roles, cmd, qual FROM pg_policies WHERE tablename = 'companies'").then(res => {
    console.log(res.rows);
    client.end();
  });
}).catch(console.error);
