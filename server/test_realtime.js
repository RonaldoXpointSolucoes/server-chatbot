import dotenv from 'dotenv';
dotenv.config();

import realtime from './src/realtime-publisher/index.js';

(async () => {
    try {
        console.log("Starting broadcast test...");
        await realtime.publishInstanceEvent('test-tenant', 'test-instance-1234', 'instance.test', { ok: true });
        console.log("Broadcast success!");
        process.exit(0);
    } catch (e) {
        console.error("Test Error:", e);
        process.exit(1);
    }
})();
