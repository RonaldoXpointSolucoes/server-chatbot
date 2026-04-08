import { config } from 'dotenv';
config({ path: '../.env' });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import apiGateway from './api-gateway/index.js';
import publicRestRoutes from './api-gateway/public-rest.js';
import { setupSwagger } from './api-gateway/swagger.js';
import systemLogger from './system-logger.js';
import { supabase } from './supabase.js';
import sessionManager from './session-manager/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

let serverChangelog = [];
try {
   const clPath = path.join(__dirname, '../changelog.json');
   if (fs.existsSync(clPath)) {
      const cls = JSON.parse(fs.readFileSync(clPath, 'utf8'));
      if(cls.changelog && Array.isArray(cls.changelog)) {
          serverChangelog = cls.changelog;
      }
   }
} catch(e) {
   console.warn("Changelog notice:", e.message);
}

const ENGINE_VERSION = packageJson.version;
const COMPILE_DATE = new Date().toISOString();

const app = express();
const PORT = process.env.PORT || 9000;

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'apikey']
}));
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));

app.get('/debug/healthz', async (req, res) => {
    // Tenta ler o historico de releases para o front (data e hora reais do banco se possível)
    let releaseHistory = [];
    try {
        const { data: dbReleases } = await supabase.from('server_releases')
            .select('*')
            .order('compile_date', { ascending: false })
            .limit(10);
            
        releaseHistory = dbReleases || [];
    } catch(err) { /* ignore */ }

    return res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        engineVersion: ENGINE_VERSION,
        compileDate: COMPILE_DATE,
        changelog: serverChangelog, // Retornando as novidades!
        history: releaseHistory
    });
});
app.get('/debug/readyz', async (req, res) => {
    const { error } = await supabase.from('tenants').select('id').limit(1);
    if (error) return res.status(503).json({ status: 'error_db', detail: error.message });
    return res.json({ status: 'ready' });
});

// Setup Swagger UI (/swagger/teste.html)
setupSwagger(app);

// Rotas públicas formato REST (Evolution API style)
app.use('/', publicRestRoutes);

app.use('/api', apiGateway);
app.use('/api/v1/system/logs', systemLogger);

app.listen(PORT, async () => {
    console.log(`[Antigravity V2] Node.js Server online na porta ${PORT}`);
    
    // Registrar o deploy no banco Supabase
    try {
        // Tenta com a coluna novidades "changelog_details", se falhar, tenta sem.
        const { error: err1 } = await supabase.from('server_releases').insert([{
            version: ENGINE_VERSION,
            compile_date: COMPILE_DATE,
            environment: 'production',
            changelog_notes: JSON.stringify(serverChangelog)
        }]);

        if (err1 && err1.message.includes('column')) {
            // Se a coluna "changelog_notes" não existir, envia apenas o essencial (fallback)
            await supabase.from('server_releases').insert([{
                version: ENGINE_VERSION,
                compile_date: COMPILE_DATE,
                environment: 'production'
            }]);
        }
        console.log(`[Auditoria] Deploy registrado: ${ENGINE_VERSION} e População Novidades Executada!`);
    } catch(err) {
        console.error("[Auditoria] Falha ao registrar deploy", err.message);
    }

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
