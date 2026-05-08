import { Client } from 'pg';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=(.*)/)[1].trim();
const client = new Client({ connectionString: dbUrl });
client.connect().then(() => {
  client.query("SELECT policyname, roles, cmd, qual FROM pg_policies WHERE tablename = 'companies'").then(res => {
    console.table(res.rows);
    client.end();
  });
}).catch(console.error);
