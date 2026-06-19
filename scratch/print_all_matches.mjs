import fs from 'fs';

const logPath = 'C:/Users/ronal/.gemini/antigravity/brain/fb8ddabc-dc38-4032-8532-ffa018568cb4/.system_generated/tasks/task-2862.log';

if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
        if (line.toLowerCase().includes('sincronizando correções') || line.toLowerCase().includes('erro crítico') || line.toLowerCase().includes('post /api/v1/knowledge/corrections')) {
            console.log(`${index + 1}: ${line}`);
        }
    });
} else {
    console.log('Log file not found.');
}
