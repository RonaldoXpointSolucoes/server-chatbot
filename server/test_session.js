import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';

console.log("Imports done");
import sessionManager from './src/session-manager/index.js';
console.log("sessionManager imported");
import realtime from './src/realtime-publisher/index.js';
console.log("realtime imported");
import { supabase } from './src/supabase.js';
console.log("supabase imported");

(async () => {
    try {
        console.log("Starting test supabase ping...");
        const {data, error} = await supabase.from('whatsapp_instances').select('id').limit(1);
        
        console.log("Starting test session...");
        await sessionManager.createSession('test-tenant', 'test-instance-1234');
        console.log("Success calling createSession");
        
        // Wait gracefully
        await new Promise(r => setTimeout(r, 8000));
        process.exit(0);
    } catch (e) {
        fs.writeFileSync('error.txt', e.stack || String(e), 'utf8');
        process.exit(1);
    }
})();
