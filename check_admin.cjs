const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    try {
        const res = await client.query("SELECT id FROM auth.users WHERE email = 'ronaldo.xpointsolucoes@gmail.com'");
        const ronaldoId = res.rows[0].id;
        
        const profile = await client.query("SELECT role FROM users_profiles WHERE id = $1", [ronaldoId]);
        console.log('Ronaldo auth.users ID:', ronaldoId);
        console.log('Ronaldo users_profiles role:', profile.rows);
    } finally {
        client.end();
    }
});
