const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
    try {
        const res = await client.query("SELECT * FROM v_checklist_operators WHERE email = 'julinha@burguerplus.com.br'");
        console.log(res.rows);
    } catch(err) {
        console.error(err);
    } finally {
        client.end();
    }
});
