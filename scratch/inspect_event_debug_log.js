import fs from 'fs';
import readline from 'readline';

async function run() {
  const logFile = 'c:/Users/ronal/OneDrive/Documentos/Projetos/Antigravity/ChatBoot/server/event_debug.log';
  if (!fs.existsSync(logFile)) {
    console.error("Log file not found:", logFile);
    return;
  }
  
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  const matches = [];
  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (line.includes('975960999') || line.includes('8f34df06-dff0-40f7-bd5b-f2838bee0268') || line.includes('Ronaldo Teste') || line.includes('Ronaldo Clemente')) {
      matches.push(`${lineNum}: ${line}`);
    }
  }

  console.log(`Found ${matches.length} matching lines. Last 50 matches:`);
  matches.slice(-50).forEach(m => console.log(m));
}

run();
