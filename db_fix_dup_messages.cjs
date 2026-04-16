const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    
    try {
        await client.connect();
        
        console.log('1. Identifying duplicate messages by whatsapp_message_id within the same tenant...');
        
        // Exclude null whatsapp_message_ids just in case they exist
        const result = await client.query(`
            DELETE FROM messages a
            USING messages b
            WHERE a.id > b.id
            AND a.tenant_id = b.tenant_id
            AND a.whatsapp_message_id = b.whatsapp_message_id
            AND a.whatsapp_message_id IS NOT NULL;
        `);
        
        console.log(`Deleted ${result.rowCount} duplicate messages from the DB.`);
        
        console.log('2. Applying unique constraint...');
        await client.query(`
            ALTER TABLE messages 
            ADD CONSTRAINT unique_whatsapp_message_id 
            UNIQUE (tenant_id, whatsapp_message_id);
        `);
        
        console.log('Unique constraint applied successfully. Fallback mechanism should now kick in for duplicates.');

    } catch (e) {
        if (e.code === '42P16') {
             console.log('Constraint already exists. Finished!');
        } else {
             console.error('Database migration script error:', e);
        }
    } finally {
        await client.end();
    }
}

run();
