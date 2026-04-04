import { Client } from 'pg';
import fs from 'fs';

(async () => {
    try {
        const client = new Client({
            connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres'
        });
        await client.connect();
        
        const sql = fs.readFileSync('./DB_SETUP_MEDIA.sql', 'utf8');
        await client.query(sql);
        console.log("SQL executado com sucesso!");
        
        await client.end();
    } catch (e) {
        console.error("Erro executando SQL:", e);
    }
})();
