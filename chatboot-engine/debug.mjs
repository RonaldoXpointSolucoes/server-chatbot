import fetch from 'node-fetch';
import readline from 'readline';

const PORT = process.env.PORT || 9000;
const BASE_URL = `http://localhost:${PORT}`;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
    console.log("=== BUGHUNTER CLI | NODEJS WHATSAPP ENGINE ===");
    console.log("1. Checar Saúde Global do Servidor");
    console.log("2. Checar Saúde de um Tenant / Motor");
    console.log("3. Iniciar Emparelhamento por Código (Pairing Code) para um Tenant");
    console.log("4. Sair");
    
    const option = await ask('\nEscolha uma opção: ');

    try {
        if (option === '1') {
            const res = await fetch(`${BASE_URL}/debug/healthz`);
            const data = await res.json();
            console.log("\n[HEALTHZ GLOBAL]");
            console.dir(data, { depth: null, colors: true });
        } 
        else if (option === '2') {
            const tenantId = await ask('Digite o UUID do tenant: ');
            const res = await fetch(`${BASE_URL}/debug/tenant/${tenantId}`);
            const data = await res.json();
            console.log(`\n[HEALTHZ TENANT ${tenantId}]`);
            console.dir(data, { depth: null, colors: true });
        }
        else if (option === '3') {
            const tenantId = await ask('Digite o UUID do tenant (Crie novo se quiser): ');
            const number = await ask('Digite o número da operadora do bot (Ex: 551199999999): ');
            const res = await fetch(`${BASE_URL}/instance/${tenantId}/pairing-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: number, forceReset: true })
            });
            const data = await res.json();
            console.log(`\n[PAIRING GENERATOR TRIGGERED] Código chegará no banco logo!`);
            console.dir(data, { depth: null, colors: true });
        }
        else if (option === '4') {
            process.exit(0);
        }
        else {
            console.log("Opção Inválida.");
        }
    } catch(err) {
        console.error("Erro ao chamar Engine. Tem certeza que o Engine NodeJS está rodando? Erro:", err.message);
    }
    
    setTimeout(main, 1000);
}

main();
