import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const checkpointPath = path.join(__dirname, '..', 'stable-checkpoint.json');

if (!fs.existsSync(checkpointPath)) {
  console.error("❌ Arquivo stable-checkpoint.json não foi encontrado!");
  process.exit(1);
}

const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));

console.log("\n=======================================================");
console.log(" 🛡️ CHECKPOINT DE RESTAURAÇÃO ESTÁVEL DE PRODUÇÃO");
console.log("=======================================================");
console.log(`📌 Nome:               ${checkpoint.checkpointName}`);
console.log(`📅 Data de Validação:  ${checkpoint.timestamp}`);
console.log(`🏷️ Git Tag Imutável:   ${checkpoint.git.tag}`);
console.log(`🌿 Branch de Salvaguarda: ${checkpoint.git.backupBranch}`);
console.log(`🔑 Hash do Commit:      ${checkpoint.git.commitHash}`);
console.log(`💻 Frontend Vercel:    v${checkpoint.frontend.version} (${checkpoint.frontend.url})`);
console.log(`⚙️ Backend Server Node: v${checkpoint.server.version} (${checkpoint.server.url})`);
console.log("-------------------------------------------------------");
console.log("🚀 COMANDOS RÁPIDOS DE RESTAURAÇÃO:");
console.log(` 1. Rollback Frontend Vercel: ${checkpoint.restoreInstructions.frontendVercelRollback}`);
console.log(` 2. Checkout Git Estável:    ${checkpoint.restoreInstructions.gitRollbackCommand}`);
console.log(` 3. Execução via Script NPM: npm run restore:all`);
console.log("=======================================================\n");
