const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    try {
        const res = await client.query("SELECT qual FROM pg_policies WHERE policyname = 'admin_manage_profiles' AND tablename = 'users_profiles'");
        console.log(res.rows[0].qual);
    } finally {
        client.end();
    }
});
