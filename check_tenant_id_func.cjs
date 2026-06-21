const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    try {
        const res = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'get_auth_tenant_id'");
        console.log(res.rows);
    } finally {
        client.end();
    }
});
