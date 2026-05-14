const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.yzbxsxabzncdzuxvlppt:Xx%40gh03360102@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
});
client.connect().then(() => {
  return client.query("INSERT INTO app_version (version, deploy_date) VALUES ('2.4.1', NOW()) RETURNING *");
}).then(res => {
  console.log(res.rows);
  client.end();
}).catch(err => {
  console.error(err);
  client.end();
});
