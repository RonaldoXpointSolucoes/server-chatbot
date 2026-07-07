const { execSync } = require('child_process');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const envVars = {};

envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const equalIdx = trimmed.indexOf('=');
  if (equalIdx > 0) {
    const key = trimmed.substring(0, equalIdx).trim();
    const val = trimmed.substring(equalIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key.startsWith('VITE_')) {
      envVars[key] = val;
    }
  }
});

console.log("Found VITE_ variables in .env:", Object.keys(envVars));

for (const [key, val] of Object.entries(envVars)) {
  console.log(`Updating ${key} on Vercel...`);
  try {
    // Remove if exists
    try {
      execSync(`npx.cmd vercel env rm ${key} production -y`, { stdio: 'ignore' });
      console.log(`  Removed old ${key}`);
    } catch (e) {
      // Ignore if it didn't exist
    }
    
    // Add new
    const cmd = `npx.cmd vercel env add ${key} production --value "${val}" --yes`;
    execSync(cmd, { stdio: 'inherit' });
    console.log(`  Successfully added ${key}`);
  } catch (err) {
    console.error(`  Failed to update ${key}:`, err.message);
  }
}

console.log("All Vercel environment variables synchronized!");
