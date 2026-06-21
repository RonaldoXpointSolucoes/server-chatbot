const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
    try {
        const id = '3354c9e7-1d7a-433d-b77a-eda66160ffcc';
        const res = await client.query("SELECT * FROM tenant_users WHERE user_id = $1", [id]);
        console.log(res.rows);
    } catch(err) {
        console.error(err);
    } finally {
        client.end();
    }
});
