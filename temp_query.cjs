const { Client } = require('pg');
require('dotenv').config({ path: './server/.env' });
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query("SELECT id, text, whatsapp_message_id, raw_message FROM messages WHERE text LIKE '📎 Formato não suportado%' ORDER BY timestamp DESC LIMIT 5");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);
