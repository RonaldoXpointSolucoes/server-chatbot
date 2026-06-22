const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    try {
        const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'contacts'");
        console.log(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        client.end();
    }
});
