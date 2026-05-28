import { Client } from 'pg';

(async () => {
    try {
        const client = new Client({
            connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres'
        });
        await client.connect();
        
        console.log("Conectado ao Supabase...");
        // Tentamos adicionar a tabela à publicação do Realtime
        await client.query("ALTER PUBLICATION supabase_realtime ADD TABLE contact_notes;");
        console.log("Habilitação de Realtime para contact_notes executada com sucesso!");
        
        await client.end();
    } catch (e) {
        if (e.message?.includes('already exists') || e.message?.includes('já existe')) {
            console.log("Tabela contact_notes já está na publicação supabase_realtime.");
        } else {
            console.error("Erro executando SQL do Realtime:", e);
        }
    }
})();
