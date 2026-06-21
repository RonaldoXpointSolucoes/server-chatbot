const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
    try {
        const res = await client.query(`
            SELECT tu.user_id, tu.full_name, tu.email, tu.tenant_id, tu.role
            FROM tenant_users tu
            LEFT JOIN users_profiles up ON up.id = tu.user_id
            WHERE up.id IS NULL AND tu.user_id IS NOT NULL
        `);
        console.log('Missing tenant_users profiles:', res.rows.length);
        
        for (const u of res.rows) {
            console.log('Inserting profile for', u.full_name, u.user_id);
            await client.query(`
                INSERT INTO users_profiles (id, tenant_id, name, email, role, is_active)
                VALUES ($1, $2, $3, $4, $5, true)
                ON CONFLICT (id) DO NOTHING
            `, [u.user_id, u.tenant_id, u.full_name, u.email, u.role === 'admin' ? 'company_admin' : 'operator']);
        }
        console.log('Done.');
    } catch(err) {
        console.error(err);
    } finally {
        client.end();
    }
});
