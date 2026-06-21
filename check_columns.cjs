const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    try {
        const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users_profiles'");
        console.log(res.rows.map(r => r.column_name));
    } finally {
        client.end();
    }
});
