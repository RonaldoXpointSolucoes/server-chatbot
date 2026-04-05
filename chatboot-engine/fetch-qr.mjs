import fs from 'fs';
import fetch from 'node-fetch';

async function main() {
    console.log("1. Acionando Motor Baileys (Tenant: XPOINT)...");
    await fetch('http://localhost:9000/instance/XPOINT/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceReset: true })
    });

    console.log("2. Aguardando 4 segundos o Baileys cuspir o QR...");
    await new Promise(r => setTimeout(r, 4000));

    console.log("3. Buscando QR Code...");
    const res = await fetch('http://localhost:9000/instance/XPOINT/qrcode');
    const data = await res.json();

    if(data.qrcode) {
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { background: #0b0c10; color: #66fcf1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: -apple-system, system-ui, sans-serif; }
                .qr-container { padding: 20px; background: white; border-radius: 20px; box-shadow: 0 0 50px rgba(102, 252, 241, 0.4); }
                img { width: 300px; height: 300px; }
            </style>
        </head>
        <body>
            <h1>X-Point: Leitura do Código</h1>
            <div class="qr-container">
                <img src="${data.qrcode}" alt="WhatsApp QR Code" />
            </div>
            <p>Aponte o WhatsApp do seu celular.</p>
            <script>
                setInterval(async () => {
                    const r = await fetch('http://localhost:9000/instance/XPOINT/qrcode');
                    const d = await r.json();
                    if(d.status === 'open') {
                        document.body.innerHTML = '<h1>✅ Módulo Online e Conectado!</h1>';
                    }
                }, 3000);
            </script>
        </body>
        </html>
        `;
        const path = process.cwd() + '/qrcode-preview.html';
        fs.writeFileSync(path, html);
        console.log("SUCESSO! Arquivo salvo em: " + path);
    } else {
        console.log("Ainda sem QR Code, ou já está conectado.", data);
    }
}
main();
