const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
    try {
        await client.query("BEGIN");
        
        // Simulate Supabase Auth JWT claims for Ronaldo
        await client.query(`
            SET LOCAL "request.jwt.claims" TO '{"sub": "9057ca36-0b29-4fe5-89fb-be5e13387030", "user_metadata": {"tenant_id": "9057ca36-0b29-4fe5-89fb-be5e13387030"}}'
        `);
        await client.query(`SET LOCAL role TO 'authenticated'`);
        
        // Try to update Julinha's PIN
        const updateRes = await client.query(`
            UPDATE users_profiles 
            SET pin = '12345' 
            WHERE id = 'a5393d07-6402-4892-a9e5-7f98a1f2650a'
            RETURNING *
        `);
        
        console.log('Update Returned Rows:', updateRes.rows.length);
        
        await client.query("ROLLBACK");
    } catch(err) {
        console.error('ERROR:', err);
    } finally {
        client.end();
    }
});
