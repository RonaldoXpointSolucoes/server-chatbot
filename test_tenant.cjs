const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
    try {
        await client.query("BEGIN");
        
        await client.query(`
            SET LOCAL "request.jwt.claims" TO '{"sub": "9057ca36-0b29-4fe5-89fb-be5e13387030", "user_metadata": {"tenant_id": "9057ca36-0b29-4fe5-89fb-be5e13387030"}}'
        `);
        await client.query(`SET LOCAL role TO 'authenticated'`);
        
        const res = await client.query(`SELECT get_auth_tenant_id() as tid`);
        console.log('get_auth_tenant_id():', res.rows[0].tid);
        
        await client.query("ROLLBACK");
    } catch(err) {
        console.error('ERROR:', err);
    } finally {
        client.end();
    }
});
