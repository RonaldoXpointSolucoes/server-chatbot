import fs from 'fs';

const logPath = 'C:/Users/ronal/.gemini/antigravity/brain/fb8ddabc-dc38-4032-8532-ffa018568cb4/.system_generated/tasks/task-2862.log';

if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');
    console.log(`Total lines: ${lines.length}`);
    const matches = [];
    lines.forEach((line, index) => {
        if (line.toLowerCase().includes('sincronizando correções') || line.toLowerCase().includes('erro crítico') || line.toLowerCase().includes('post /api/v1/knowledge/corrections')) {
            // Find nearby lines with timestamps or context
            const start = Math.max(0, index - 2);
            const end = Math.min(lines.length - 1, index + 2);
            const context = lines.slice(start, end + 1).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
            matches.push(`--- MATCH AT LINE ${index + 1} ---\n${context}`);
        }
    });
    console.log(`Matches found: ${matches.length}`);
    console.log(matches.slice(-5).join('\n\n'));
} else {
    console.log('Log file not found.');
}
