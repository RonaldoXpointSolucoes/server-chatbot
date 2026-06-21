const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
    try {
        await client.query("BEGIN");

        // Drop the recursive policy
        await client.query("DROP POLICY IF EXISTS admin_manage_profiles ON users_profiles");

        // Create new policy using the SECURITY DEFINER function to prevent recursion
        await client.query(`
            CREATE POLICY admin_manage_profiles ON users_profiles
            FOR ALL
            USING (
                is_auth_tenant_admin()
            )
            WITH CHECK (
                is_auth_tenant_admin()
            );
        `);

        await client.query("COMMIT");
        console.log('RLS policy for users_profiles updated to use is_auth_tenant_admin().');
    } catch(err) {
        await client.query("ROLLBACK");
        console.error('ERROR:', err);
    } finally {
        client.end();
    }
});
