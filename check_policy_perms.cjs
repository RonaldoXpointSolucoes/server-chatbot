const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    try {
        const res = await client.query("SELECT policyname, tablename, qual, with_check FROM pg_policies WHERE tablename IN ('user_unit_permissions', 'user_sector_permissions')");
        console.log(JSON.stringify(res.rows, null, 2));
    } finally {
        client.end();
    }
});
