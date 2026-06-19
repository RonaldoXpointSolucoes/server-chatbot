import fs from 'fs';
import readline from 'readline';

async function run() {
  const logFile = 'C:\\Users\\ronal\\.gemini\\antigravity\\brain\\31bd03fc-8c48-49dc-a7e6-70176874baba\\.system_generated\\tasks\\task-803.log';
  const fileStream = fs.createReadStream(logFile);
  
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (line.includes('b1fdbcfb') || line.includes('975960999') || line.includes('Ronaldo Clemente')) {
      console.log(`${lineNum}: ${line}`);
    }
  }
}

run();
