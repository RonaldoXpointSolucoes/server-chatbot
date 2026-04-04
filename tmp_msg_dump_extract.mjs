import fs from 'fs';
const text = fs.readFileSync('db_msg_dump.txt', 'utf8');
const jsonMatch = text.match(/\[[\s\S]*\]/);
if (jsonMatch) {
  console.log(jsonMatch[0]);
} else {
  console.log(text);
}
