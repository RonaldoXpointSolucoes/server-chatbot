import fs from 'fs';

try {
  const content = fs.readFileSync('server/event_debug.log', 'utf8');
  const lines = content.split('\n');
  console.log(`Total lines: ${lines.length}`);
  console.log("=== LAST 100 LINES ===");
  console.log(lines.slice(-100).join('\n'));
} catch (err) {
  console.error(err);
}
