const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
    try {
        await client.query("BEGIN");

        // Drop the old policy
        await client.query("DROP POLICY IF EXISTS admin_manage_profiles ON users_profiles");

        // Create new policy that checks if the user is an admin in tenant_users for that tenant
        await client.query(`
            CREATE POLICY admin_manage_profiles ON users_profiles
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM tenant_users tu
                    WHERE tu.user_id = auth.uid() 
                    AND tu.tenant_id = users_profiles.tenant_id 
                    AND tu.role IN ('company_admin', 'super_admin')
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM tenant_users tu
                    WHERE tu.user_id = auth.uid() 
                    AND tu.tenant_id = users_profiles.tenant_id 
                    AND tu.role IN ('company_admin', 'super_admin')
                )
            );
        `);

        await client.query("COMMIT");
        console.log('RLS policy for users_profiles updated successfully.');
    } catch(err) {
        await client.query("ROLLBACK");
        console.error('ERROR:', err);
    } finally {
        client.end();
    }
});
