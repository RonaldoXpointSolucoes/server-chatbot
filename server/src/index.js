import { config } from 'dotenv';
config({ path: '../.env' });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import apiGateway from './api-gateway/index.js';
import { supabase } from './supabase.js';
import sessionManager from './session-manager/index.js';

const app = express();
const PORT = process.env.PORT || 9000;

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/debug/healthz', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/debug/readyz', async (req, res) => {
    const { error } = await supabase.from('tenants').select('id').limit(1);
    if (error) return res.status(503).json({ status: 'error_db', detail: error.message });
    return res.json({ status: 'ready' });
});

app.use('/api', apiGateway);

app.listen(PORT, async () => {
    console.log(`[Antigravity V2] Node.js Server online na porta ${PORT}`);
    
    try {
        console.log("[Worker Boot] Buscando instâncias pendentes...");
        const { data: activeLeases } = await supabase
            .from('whatsapp_instances')
            .select('id, tenant_id')
            .in('status', ['connected', 'connecting', 'qr_ready']);
            
        if (activeLeases && activeLeases.length > 0) {
            console.log(`[Worker Boot] Retomando ${activeLeases.length} sockets...`);
            for (const instance of activeLeases) {
                sessionManager.createSession(instance.tenant_id, instance.id).catch(e => {
                    console.error(`Falha Auto-Restart: ${instance.id}`, e);
                });
                await new Promise(r => setTimeout(r, 1500));
            }
        }
    } catch(err) {
        console.error("Erro no worker boot", err);
    }
});
