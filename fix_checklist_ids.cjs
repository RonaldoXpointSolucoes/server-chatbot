const { Client } = require('pg');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ghostData = [{"id":"06f06943-2684-4f8f-8e72-1710c9c43dbb","email":"tayane@burguerplus.com.br"},{"id":"3354c9e7-1d7a-433d-b77a-eda66160ffcc","email":"julinha@burguerplus.com.br"},{"id":"33f00191-534f-47c1-9b45-01702736e3fe","email":"Israel@burguerplus.com.br"},{"id":"402074b3-3ce8-46ba-a8c9-8011d033f6e8","email":"paulo@burguerplus.com.br"},{"id":"6c112692-90bf-4ae1-a6d2-dd59567daf5f","email":"Sthefany@burguerplus.com.br"},{"id":"7ab16dfc-aba2-4025-b446-83a8fc3ea70f","email":"giselle@burguerplus.com.br"},{"id":"9c93575b-7682-4c4c-858d-c63718b69311","email":"marcela@burguerplus.com.br"},{"id":"b2eecd5e-713a-4eb7-b477-c9318d2b8646","email":"lara@burguerplus.com.br"},{"id":"b46c7024-c64a-4ae2-aac3-d79b283d7f5e","email":"cida@burguerplus.com.br"},{"id":"b9f1ae0d-2778-499e-b7a9-d71c3e89b333","email":"rafael@burguerplus.com.br"},{"id":"cd8f5523-7317-4134-9334-46551e20622c","email":"natali@burguerplus.com.br"},{"id":"dc3ee5cc-d0d1-4898-8c0b-ecfc245a5117","email":"luana@burguerplus.com.br"},{"id":"ddae6ceb-6760-4f09-9624-96a05a17b545","email":"daniel@burguerplus.com.br"}];

client.connect().then(async () => {
    try {
        const { data: authData } = await supabase.auth.admin.listUsers();
        const authUsers = authData.users;
        
        // Build mapping from Ghost ID to Real ID
        const idMap = {};
        for (const ghost of ghostData) {
            const realUser = authUsers.find(u => u.email.toLowerCase() === ghost.email.toLowerCase());
            if (realUser) {
                idMap[ghost.id] = realUser.id;
            }
        }
        
        // Update checklists
        const res = await client.query("SELECT id, responsible_ids FROM checklists");
        let fixed = 0;
        
        for (const chk of res.rows) {
            if (!chk.responsible_ids || !chk.responsible_ids.length) continue;
            
            let changed = false;
            const newIds = chk.responsible_ids.map(oldId => {
                if (idMap[oldId]) {
                    changed = true;
                    return idMap[oldId];
                }
                return oldId;
            });
            
            if (changed) {
                await client.query("UPDATE checklists SET responsible_ids = $1 WHERE id = $2", [newIds, chk.id]);
                fixed++;
            }
        }
        
        console.log('Fixed', fixed, 'checklists with ghost IDs.');
    } catch(err) {
        console.error(err);
    } finally {
        client.end();
    }
});
