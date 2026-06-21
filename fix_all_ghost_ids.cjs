const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ghostData = [{"id":"06f06943-2684-4f8f-8e72-1710c9c43dbb","email":"tayane@burguerplus.com.br"},{"id":"3354c9e7-1d7a-433d-b77a-eda66160ffcc","email":"julinha@burguerplus.com.br"},{"id":"33f00191-534f-47c1-9b45-01702736e3fe","email":"Israel@burguerplus.com.br"},{"id":"402074b3-3ce8-46ba-a8c9-8011d033f6e8","email":"paulo@burguerplus.com.br"},{"id":"6c112692-90bf-4ae1-a6d2-dd59567daf5f","email":"Sthefany@burguerplus.com.br"},{"id":"7ab16dfc-aba2-4025-b446-83a8fc3ea70f","email":"giselle@burguerplus.com.br"},{"id":"9c93575b-7682-4c4c-858d-c63718b69311","email":"marcela@burguerplus.com.br"},{"id":"b2eecd5e-713a-4eb7-b477-c9318d2b8646","email":"lara@burguerplus.com.br"},{"id":"b46c7024-c64a-4ae2-aac3-d79b283d7f5e","email":"cida@burguerplus.com.br"},{"id":"b9f1ae0d-2778-499e-b7a9-d71c3e89b333","email":"rafael@burguerplus.com.br"},{"id":"cd8f5523-7317-4134-9334-46551e20622c","email":"natali@burguerplus.com.br"},{"id":"dc3ee5cc-d0d1-4898-8c0b-ecfc245a5117","email":"luana@burguerplus.com.br"},{"id":"ddae6ceb-6760-4f09-9624-96a05a17b545","email":"daniel@burguerplus.com.br"}];

client.connect().then(async () => {
    try {
        const { data: authData } = await supabase.auth.admin.listUsers();
        const authUsers = authData.users;
        
        const idMap = {};
        for (const ghost of ghostData) {
            const realUser = authUsers.find(u => u.email.toLowerCase() === ghost.email.toLowerCase());
            if (realUser) {
                idMap[ghost.id] = realUser.id;
            }
        }
        
        // Let's dynamically check for tables with a user_id column
        const resTables = await client.query(`
            SELECT table_name 
            FROM information_schema.columns 
            WHERE column_name = 'user_id' AND table_schema = 'public'
        `);
        
        for (const t of resTables.rows) {
            const table = t.table_name;
            try {
                for (const [ghostId, realId] of Object.entries(idMap)) {
                    await client.query(`UPDATE "${table}" SET user_id = $1 WHERE user_id = $2`, [realId, ghostId]);
                }
            } catch(e) {}
        }
        
        // Also check any other columns
        const resOp = await client.query(`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE column_name IN ('operator_id', 'responsible_id', 'created_by', 'updated_by') AND table_schema = 'public'
        `);
        for (const t of resOp.rows) {
            const table = t.table_name;
            const col = t.column_name;
            try {
                for (const [ghostId, realId] of Object.entries(idMap)) {
                    await client.query(`UPDATE "${table}" SET "${col}" = $1 WHERE "${col}" = $2`, [realId, ghostId]);
                }
            } catch(e) {}
        }
        
        console.log('Fixed all related ghost IDs in the entire database.');
    } catch(err) {
        console.error(err);
    } finally {
        client.end();
    }
});
