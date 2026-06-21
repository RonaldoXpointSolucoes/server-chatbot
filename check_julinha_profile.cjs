const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    try {
        const res = await client.query("SELECT * FROM users_profiles WHERE id = 'a5393d07-6402-4892-a9e5-7f98a1f2650a'");
        console.log(res.rows);
    } finally {
        client.end();
    }
});
