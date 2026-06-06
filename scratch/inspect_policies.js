import pg from 'pg';
import fs from 'fs';

const envMap = {};
try {
  const envText = fs.readFileSync('.env', 'utf-8');
  envText.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if(match) envMap[match[1]] = match[2].trim();
  });
} catch(e) {}

const connectionString = envMap.DATABASE_URL || process.env.DATABASE_URL;

const client = new pg.Client({ connectionString });
await client.connect();
const res = await client.query("SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public';");
console.log(res.rows);
await client.end();
