const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
    try {
        await client.query("BEGIN");

        // Drop the old policy
        await client.query("DROP POLICY IF EXISTS admin_manage_profiles ON users_profiles");

        // Create new policy that allows ANY company_admin to manage profiles
        await client.query(`
            CREATE POLICY admin_manage_profiles ON users_profiles
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM users_profiles up
                    WHERE up.id = auth.uid() 
                    AND up.role IN ('company_admin', 'super_admin')
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM users_profiles up
                    WHERE up.id = auth.uid() 
                    AND up.role IN ('company_admin', 'super_admin')
                )
            );
        `);

        await client.query("COMMIT");
        console.log('RLS policy for users_profiles updated successfully to allow company_admin.');
    } catch(err) {
        await client.query("ROLLBACK");
        console.error('ERROR:', err);
    } finally {
        client.end();
    }
});
