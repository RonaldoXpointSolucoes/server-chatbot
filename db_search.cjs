const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
    try {
        const id = '3354c9e7-1d7a-433d-b77a-eda66160ffcc';
        const { rows } = await client.query("SELECT table_name FROM information_schema.columns WHERE column_name = 'id' AND data_type = 'uuid'");
        
        let found = [];
        for (let row of rows) {
            try {
                const { rowCount } = await client.query('SELECT 1 FROM "' + row.table_name + '" WHERE id = $1', [id]);
                if (rowCount > 0) found.push(row.table_name);
            } catch(e) {}
        }
        console.log('ID Found in tables:', found);

        const res = await client.query("SELECT definition FROM pg_views WHERE viewname = 'v_checklist_operators'");
        console.log('\nView definition:');
        console.log(res.rows[0]?.definition);
    } catch(err) {
        console.error(err);
    } finally {
        client.end();
    }
});
