import { Client } from 'pg';

const regions = [
    'sa-east-1',
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'ca-central-1',
    'eu-west-1',
    'eu-west-2',
    'eu-west-3',
    'eu-central-1',
    'ap-southeast-1',
    'ap-northeast-1'
];

const ports = [6543, 5432];

(async () => {
    console.log("Iniciando busca da região correta do Pooler do Supabase nas portas 6543 e 5432...");
    for (const region of regions) {
        const host = `aws-0-${region}.pooler.supabase.com`;
        for (const port of ports) {
            console.log(`Testando região: ${region} (${host}) porta ${port}...`);
            const client = new Client({
                host: host,
                port: port,
                database: 'postgres',
                user: 'postgres.yzbxsxabzncdzuxvlppt',
                password: 'Xx@gh03360102',
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 3000
            });
            
            try {
                await client.connect();
                console.log(`\n🎉 SUCESSO! Conectado com sucesso na região: ${region} na porta ${port}\n`);
                await client.end();
                process.exit(0);
            } catch (e) {
                const msg = e.message || '';
                if (msg.includes('not found') || msg.includes('ENOTFOUND')) {
                    // Ignora
                } else if (msg.includes('password authentication failed') || msg.includes('autenticação') || msg.includes('database')) {
                    console.log(`\n👉 ENCONTRADO! O tenant existe na região ${region} na porta ${port}, erro: ${msg}\n`);
                    await client.end().catch(() => {});
                    process.exit(0);
                } else {
                    console.log(`  Erro na região ${region} porta ${port}: ${msg}`);
                }
            }
        }
    }
    console.log("Busca finalizada sem sucesso.");
})();
