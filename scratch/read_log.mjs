import fs from 'fs';

const logPath = 'C:/Users/ronal/.gemini/antigravity/brain/fb8ddabc-dc38-4032-8532-ffa018568cb4/.system_generated/tasks/task-2862.log';

if (fs.existsSync(logPath)) {
    const lines = fs.readFileSync(logPath, 'utf8').split('\n');
    console.log(`Total lines: ${lines.length}`);
    const matches = [];
    lines.forEach((line, index) => {
        if (line.toLowerCase().includes('correction') || line.toLowerCase().includes('raciocínio')) {
            matches.push(`${index + 1}: ${line}`);
        }
    });
    console.log(`Matches found: ${matches.length}`);
    console.log(matches.slice(-50).join('\n'));
} else {
    console.log('Log file not found.');
}
