import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let wacallsProcess = null;
let autoRestart = true;
let restartAttempts = 0;
const MAX_RESTARTS = 5;

export function startWaCallsProcess() {
    // Apenas ativa se estiver em ambiente linux ou se for explicitamente produção,
    // e se o binário wacalls-server existir.
    const binaryName = process.platform === 'win32' ? 'wacalls-server.exe' : 'wacalls-server';
    const binaryPath = path.join(__dirname, '..', binaryName);

    if (!fs.existsSync(binaryPath)) {
        console.log(`[WaCalls Process Manager] Binário do WaCalls não encontrado em: ${binaryPath}. Pulando inicialização.`);
        return;
    }

    console.log(`[WaCalls Process Manager] Inicializando executável em: ${binaryPath}`);

    // Garantir que a pasta data exista
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'wacalls.db');

    function spawnProcess() {
        if (!autoRestart) return;

        console.log(`[WaCalls Process Manager] Iniciando processo Go: ${binaryPath} -addr 127.0.0.1:8080 -db ${dbPath}`);
        
        wacallsProcess = spawn(binaryPath, ['-addr', '127.0.0.1:8080', '-db', dbPath]);

        wacallsProcess.stdout.on('data', (data) => {
            const lines = data.toString().trim().split('\n');
            for (const line of lines) {
                if (line) console.log(`[WaCalls Go] ${line}`);
            }
        });

        wacallsProcess.stderr.on('data', (data) => {
            const lines = data.toString().trim().split('\n');
            for (const line of lines) {
                if (!line) continue;
                if (line.includes('level=INFO') || line.includes('level=info')) {
                    console.log(`[WaCalls Go] ${line}`);
                } else if (line.includes('level=WARN') || line.includes('level=warn')) {
                    console.warn(`[WaCalls Go Warn] ${line}`);
                } else {
                    console.error(`[WaCalls Go Error] ${line}`);
                }
            }
        });

        wacallsProcess.on('close', (code) => {
            console.warn(`[WaCalls Process Manager] Processo Go encerrado com código: ${code}`);
            wacallsProcess = null;

            if (autoRestart && restartAttempts < MAX_RESTARTS) {
                restartAttempts++;
                const delay = Math.min(1000 * Math.pow(2, restartAttempts), 30000);
                console.log(`[WaCalls Process Manager] Tentando reiniciar em ${delay / 1000} segundos... (Tentativa ${restartAttempts}/${MAX_RESTARTS})`);
                setTimeout(spawnProcess, delay);
            } else if (restartAttempts >= MAX_RESTARTS) {
                console.error(`[WaCalls Process Manager] Limite máximo de reinicializações atingido (${MAX_RESTARTS}). O WaCalls permanecerá desativado.`);
            }
        });

        wacallsProcess.on('error', (err) => {
            console.error(`[WaCalls Process Manager] Erro ao iniciar subprocesso Go:`, err.message);
        });
    }

    spawnProcess();

    // Lidar com encerramento do processo Node principal
    const cleanExit = () => {
        if (wacallsProcess) {
            console.log('[WaCalls Process Manager] Finalizando subprocesso Go de forma limpa...');
            autoRestart = false;
            wacallsProcess.kill('SIGTERM');
        }
    };

    process.on('exit', cleanExit);
    process.on('SIGINT', () => {
        cleanExit();
        process.exit();
    });
    process.on('SIGTERM', () => {
        cleanExit();
        process.exit();
    });
}
