import pg from 'pg';
const { Client } = pg;

(async () => {
    try {
        const client = new Client({
            connectionString: 'postgresql://postgres:Xx%40gh03360102@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?options=-c%20project%3Dyzbxsxabzncdzuxvlppt',
            ssl: {
                rejectUnauthorized: false
            }
        });
        await client.connect();
        
        console.log("Adicionando coluna 'email' na tabela 'push_subscriptions'...");
        await client.query(`
            ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS email VARCHAR(255);
        `);
        console.log("Coluna adicionada com sucesso!");
        
        await client.end();
    } catch (e) {
        console.error("Erro executando DDL:", e);
    }
})();
