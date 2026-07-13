import fs from 'fs';
import path from 'path';

try {
    const raw = fs.readFileSync('C:\\Users\\NOTE-(FORM)02JUL26\\.gemini\\antigravity\\brain\\103eea4c-7282-4512-90ff-95ba37d2cad9\\.system_generated\\steps\\1850\\output.txt', 'utf8');
    const parsed = JSON.parse(raw);
    const logFilePath = 'C:\\Users\\NOTE-(FORM)02JUL26\\.gemini\\antigravity\\brain\\103eea4c-7282-4512-90ff-95ba37d2cad9\\scratch\\parsed_logs.txt';
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.writeFileSync(logFilePath, parsed.logs || '');
    console.log('SUCCESS: parsed logs to parsed_logs.txt, size:', parsed.logs?.length || 0);
} catch (err) {
    console.error('ERROR:', err);
}
