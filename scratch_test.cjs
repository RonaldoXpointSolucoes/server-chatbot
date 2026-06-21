const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
  try {
    await client.query('SET ROLE authenticated');
    await client.query(`SET request.jwt.claims TO '{"sub": "9057ca36-0b29-4fe5-89fb-be5e13387030"}'`);
    
    console.log("Checking is_auth_tenant_admin():");
    const res = await client.query('SELECT is_auth_tenant_admin()');
    console.log(res.rows);
  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    client.end();
  }
});
