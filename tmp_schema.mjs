import { Client } from 'pg';

(async () => {
    try {
        const client = new Client({
            connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres'
        });
        await client.connect();
        
        const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'messages'");
        console.table(res.rows);
        
        await client.end();
    } catch (e) {
        console.error("Erro:", e);
    }
})();
