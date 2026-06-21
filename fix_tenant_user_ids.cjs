const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

client.connect().then(async () => {
    try {
        const { data: authData, error } = await supabase.auth.admin.listUsers();
        if (error) throw error;
        
        const authUsers = authData.users;
        
        const res = await client.query("SELECT * FROM tenant_users WHERE user_id IS NOT NULL");
        const tenantUsers = res.rows;
        
        console.log(`Found ${tenantUsers.length} tenant_users. Checking for mismatched IDs...`);
        let fixed = 0;
        
        for (const tu of tenantUsers) {
            // Find real auth user by email
            const realUser = authUsers.find(u => u.email.toLowerCase() === tu.email.toLowerCase());
            
            if (realUser) {
                if (tu.user_id !== realUser.id) {
                    console.log(`Mismatch found for ${tu.email}: tenant_users has ${tu.user_id}, auth.users has ${realUser.id}. Fixing...`);
                    
                    // Update tenant_users to have the real auth user ID!
                    await client.query("UPDATE tenant_users SET user_id = $1 WHERE id = $2", [realUser.id, tu.id]);
                    fixed++;
                }
            } else {
                console.log(`WARNING: ${tu.email} is in tenant_users with ID ${tu.user_id} but NOT found in auth.users!`);
            }
        }
        
        console.log(`Fixed ${fixed} mismatched user_ids in tenant_users.`);
    } catch(err) {
        console.error(err);
    } finally {
        client.end();
    }
});
