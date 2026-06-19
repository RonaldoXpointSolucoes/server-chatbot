import { Client } from 'pg';
import dns from 'dns';

// Força o Node.js a priorizar IPv6 na resolução de nomes
dns.setDefaultResultOrder('ipv6first');

(async () => {
    try {
        console.log("Tentando conectar ao host db.yzbxsxabzncdzuxvlppt.supabase.co com dns ipv6first...");
        const client = new Client({
            host: 'db.yzbxsxabzncdzuxvlppt.supabase.co',
            port: 5432,
            database: 'postgres',
            user: 'postgres',
            password: 'Xx@gh03360102',
            ssl: { rejectUnauthorized: false }
        });
        await client.connect();
        
        console.log("=== LISTANDO TABELAS NO SCHEMA PUBLIC ===");
        const resTables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        
        for (const row of resTables.rows) {
            console.log(`- ${row.table_name}`);
        }
        
        await client.end();
    } catch (e) {
        console.error("Erro executando SQL:", e);
        
        console.log("\nTentando com IP IPv6 literal...");
        try {
            const client2 = new Client({
                host: '2600:1f1e:75b:4b13:43aa:7380:3d2f:719f',
                port: 5432,
                database: 'postgres',
                user: 'postgres',
                password: 'Xx@gh03360102',
                ssl: { rejectUnauthorized: false }
            });
            await client2.connect();
            console.log("Conectou com sucesso usando IP IPv6 literal!");
            await client2.end();
        } catch (e2) {
            console.error("Erro com IP IPv6 literal:", e2);
        }
    }
})();
