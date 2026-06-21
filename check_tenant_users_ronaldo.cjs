const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    try {
        const res = await client.query("SELECT * FROM tenant_users WHERE user_id = '9057ca36-0b29-4fe5-89fb-be5e13387030'");
        console.log(res.rows);
    } finally {
        client.end();
    }
});
