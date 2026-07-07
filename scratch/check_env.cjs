const keys = Object.keys(process.env).filter(k => k.toLowerCase().includes('vercel') || k.toLowerCase().includes('token'));
console.log("Found env keys:", keys);
