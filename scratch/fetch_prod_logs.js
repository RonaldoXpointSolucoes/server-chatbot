import fs from 'fs';

async function run() {
  const url = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/api/v1/system/logs/stream';
  console.log("Conectando a:", url);
  
  const response = await fetch(url);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop();
    
    for (const part of parts) {
      if (part.startsWith('data: ')) {
        const jsonStr = part.slice(6);
        try {
          const data = JSON.parse(jsonStr);
          if (data.type === 'init') {
            console.log(`=== RECEBIDO INIT COM ${data.logs.length} LOGS ===`);
            let fileContent = '';
            data.logs.forEach(log => {
              fileContent += `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}\n`;
            });
            fs.writeFileSync('scratch/prod_logs_dump.txt', fileContent);
            console.log("Salvo com sucesso em scratch/prod_logs_dump.txt");
            process.exit(0);
          }
        } catch (e) {
          console.error("Erro ao fazer parse do log:", e);
        }
      }
    }
  }
}

run().catch(console.error);
