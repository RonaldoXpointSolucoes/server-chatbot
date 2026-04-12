process.on('uncaughtException', (err) => {
    console.error('FATAL UNCAUGHT EXCEPTION:', err);
    setInterval(() => {}, 100000); // Mantenha vivo para lermos o log
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('FATAL UNHANDLED REJECTION:', reason);
    setInterval(() => {}, 100000); // Mantenha vivo para lermos o log
});

console.log("[BOOT] Inicializando Server Antigravity Engine V2...");

import('./src/index.js').catch(err => {
    console.error("FATAL BOOT CRASH (Import Error / Syntax Error):", err);
    setInterval(() => {}, 100000); // Mantenha vivo para lermos o log!
});
