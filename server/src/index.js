import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname_env = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname_env, '../../.env') });

import pg from 'pg';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import apiGateway from './api-gateway/index.js';
import publicRestRoutes from './api-gateway/public-rest.js';
import { setupSwagger } from './api-gateway/swagger.js';
import systemLogger, { errorBuffer, persistSystemLog } from './system-logger.js';
import { supabase, NODE_ID } from './supabase.js';
import sessionManager from './session-manager/index.js';
import snoozeManager from './snooze-manager.js';
import queueProcessor from './session-manager/queue-processor.js';
import autoRagTrainer from './automation-worker/auto-rag-trainer.js';
import AutomationWorker from './automation-worker/agent.js';
import { startWaCallsListener } from './wacalls-listener.js';
import { startWaCallsProcess } from './wacalls-process.js';
import { dispatchWebhookTriggers } from './event-processor/index.js';
import fs from 'fs';
import pidusage from 'pidusage';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

// Injeta os caminhos do ffmpeg e ffprobe instalados via npm no PATH global do processo para o Baileys
try {
   const ffmpegDir = path.dirname(ffmpegInstaller.path);
   const ffprobeDir = path.dirname(ffprobeInstaller.path);
   process.env.PATH = `${ffmpegDir}${path.delimiter}${ffprobeDir}${path.delimiter}${process.env.PATH}`;
   console.log(`[Antigravity Boot] Sincronização de Executáveis do Sistema concluída!`);
   console.log(`[Antigravity Boot] FFmpeg PATH: ${ffmpegDir}`);
   console.log(`[Antigravity Boot] FFprobe PATH: ${ffprobeDir}`);
} catch (pathErr) {
   console.error("[Antigravity Boot] Falha ao injetar caminhos ffmpeg/ffprobe no PATH:", pathErr.message);
}

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
    // Silencia erros inofensivos do undici/fetch ao abortar conexões (TypeError: terminated)
    if (err && (err.message === 'terminated' || err.message === 'fetch failed' || err.stack?.includes('onAborted') || err.stack?.includes('undici'))) {
        console.warn('[Fetch/Undici] Conexão cancelada ou abortada pelo cliente/servidor (TypeError: terminated).');
        return;
    }
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    if (reason && (reason.message === 'terminated' || reason.message === 'fetch failed' || reason.stack?.includes('onAborted') || reason.stack?.includes('undici'))) {
        console.warn('[Fetch/Undici] Rejeição de conexão cancelada ou abortada pelo cliente/servidor (TypeError: terminated).');
        return;
    }
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-agent-id', 'apikey', 'x-asts-test', 'X-Asts-Test']
}));
app.use(helmet());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(morgan('dev'));

const APP_ENV = (process.env.APP_ENV || 'production').toLowerCase();
const APP_NODE = process.env.APP_NODE || (APP_ENV === 'alpha' ? 'ALFA-A' : 'PROD-C');
const APP_VERSION = process.env.APP_VERSION || ENGINE_VERSION;
const GIT_COMMIT_SHA = process.env.GIT_COMMIT_SHA || process.env.VITE_PACKAGE_BUILD_DATE || 'dev-head';

// Endpoint de Saúde do Servidor (/health)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        environment: APP_ENV,
        node: APP_NODE,
        version: APP_VERSION,
        time: new Date().toISOString() 
    });
});

// Endpoint de Prontidão (/ready) - Usado pelo Coolify Health Check
app.get('/ready', async (req, res) => {
    try {
        const { error } = await supabase.from('tenants').select('id').limit(1);
        const isDbReady = !error;
        const isBaileysReady = Boolean(sessionManager);

        if (!isDbReady) {
            return res.status(503).json({ 
                status: 'error', 
                environment: APP_ENV,
                node: APP_NODE,
                database: false,
                baileys: isBaileysReady,
                error: error.message 
            });
        }

        return res.json({ 
            status: 'ready', 
            environment: APP_ENV,
            node: APP_NODE,
            database: true, 
            baileys: isBaileysReady 
        });
    } catch(err) {
        return res.status(503).json({ status: 'error', environment: APP_ENV, error: err.message });
    }
});

// Endpoint de Informação do Sistema (/api/v1/system/info)
app.get('/api/v1/system/info', (req, res) => {
    res.json({
        environment: APP_ENV,
        node: APP_NODE,
        version: APP_VERSION,
        commit: GIT_COMMIT_SHA,
        timestamp: new Date().toISOString()
    });
});

// Endpoint de Diagnóstico Avançado para Admins (/api/v1/admin/diagnostics)
app.get('/api/v1/admin/diagnostics', async (req, res) => {
    try {
        const { error: dbErr } = await supabase.from('tenants').select('id').limit(1);
        const activeSessions = sessionManager ? sessionManager.sessions.size : 0;

        return res.json({
            environment: APP_ENV,
            node: APP_NODE,
            version: APP_VERSION,
            commit: GIT_COMMIT_SHA,
            uptimeSeconds: process.uptime(),
            database: dbErr ? `error: ${dbErr.message}` : 'ok',
            baileys: {
                activeSessionsCount: activeSessions
            },
            timestamp: new Date().toISOString()
        });
    } catch(err) {
        return res.status(500).json({ status: 'error', detail: err.message });
    }
});

// Metadata da Versão do Baileys rodando no servidor
let baileysVersion = '7.0.0-rc.9';
let baileysDate = '29/07/2026';
try {
    const bPkgPath = path.join(__dirname, '../../baileys-core/package.json');
    if (fs.existsSync(bPkgPath)) {
        const bPkg = JSON.parse(fs.readFileSync(bPkgPath, 'utf8'));
        if (bPkg.version) {
            baileysVersion = bPkg.version;
        }
    }
} catch (e) {}

const baileysHistory = [
    {
        tag: 'v7.0.0-rc14',
        version: '7.0.0-rc14',
        name: 'v7.0.0-rc14 (Latest)',
        date: '2026-08-01',
        isLatest: true,
        isCurrent: true,
        repoUrl: 'https://github.com/WhiskeySockets/Baileys/releases/tag/v7.0.0-rc14',
        commit: '7e7b075',
        highlights: [
            'fix: advertise WIN_HYBRID instead of retired WIN32 web sub-platform (substitui WIN32 aposentado pela Meta por WIN_HYBRID)',
            'ci: pin npm to 11.x, last line that still runs on node 20',
            'example: fix logging of contact upserts',
            'WAProto: perf: optimize history sync memory and CPU usage (#2333)',
            'Resiliência aprimorada no processamento de lotes de mensagens e Bad MAC retry'
        ]
    },
    {
        tag: 'v6.7.24',
        version: '6.7.24',
        name: 'v6.7.24 (2026-07-29)',
        date: '2026-07-29',
        isLatest: false,
        isCurrent: false,
        repoUrl: 'https://github.com/WhiskeySockets/Baileys/releases/tag/v6.7.24',
        commit: 'e062994',
        highlights: [
            'Reverts: Revert "chore(release): v6.7.24 (c7a17f5)"',
            'Estabilização de sinalização de chamadas de voz e vídeo (WaCalls)',
            'Suporte a vCards interativos e múltiplos contatos (ContactMessage)',
            'Tratamento aprimorado de tokens de segurança E2E (tctoken)'
        ]
    },
    {
        tag: 'v7.0.0-rc.12',
        version: '7.0.0-rc.12',
        name: 'v7.0.0-rc.12',
        date: '2026-07-20',
        isLatest: false,
        isCurrent: false,
        repoUrl: 'https://github.com/WhiskeySockets/Baileys',
        commit: 'a12b34c',
        highlights: [
            'feat: Add support for pastParticipants in history sync (#2426)',
            'Novo compilador estático Protobuf (WAProto/GenerateStatics.sh)',
            'Otimização de memória RAM para instâncias multi-tenant'
        ]
    },
    {
        tag: 'v6.7.21',
        version: '6.7.21',
        name: 'v6.7.21',
        date: '2026-07-10',
        isLatest: false,
        isCurrent: false,
        repoUrl: 'https://github.com/WhiskeySockets/Baileys',
        commit: 'f98e721',
        highlights: [
            'Correções de heartbeat e presenciais (composing/recording)',
            'Mitigação de desconexões 408 (QR Code timeout)'
        ]
    }
];

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
        history: releaseHistory,
        baileysVersion,
        baileysDate,
        baileysHistory
    });
});
app.get('/debug/readyz', async (req, res) => {
    const { error } = await supabase.from('tenants').select('id').limit(1);
    if (error) return res.status(503).json({ status: 'error_db', detail: error.message });
    return res.json({ status: 'ready' });
});

app.get('/debug/metrics', async (req, res) => {
    try {
        const stats = await pidusage(process.pid);
        const memObj = process.memoryUsage();
        return res.json({
            status: 'ok',
            cpuPercent: stats.cpu,
            memoryMB: memObj.rss / 1024 / 1024,
            uptime: process.uptime()
        });
    } catch(err) {
        return res.status(500).json({ status: 'error', detail: err.message });
    }
});

app.get('/debug/recent-errors', async (req, res) => {
    try {
        const since = req.query.since;
        let newErrors = errorBuffer;
        if (since) {
            const sinceTime = parseInt(since, 10);
            newErrors = errorBuffer.filter(e => new Date(e.timestamp).getTime() > sinceTime);
        }
        return res.json({ success: true, errors: newErrors });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Setup Swagger UI (/swagger/teste.html)
setupSwagger(app);

// Rotas públicas formato REST (Evolution API style)
app.use('/', publicRestRoutes);

app.use('/api', apiGateway);
app.use('/api/logs', systemLogger);
app.use('/api/v1/system/logs', systemLogger);

// Middleware global de tratamento de erros (ex: Multer LIMIT_FILE_SIZE, Client Abort)
app.use((err, req, res, next) => {
    // 1) Erro de tamanho de upload do Multer
    if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
        const isKnowledge = req.originalUrl && req.originalUrl.includes('/knowledge');
        const limitMB = isKnowledge ? '100MB' : '500MB';
        return res.status(413).json({
            error: `O arquivo enviado é muito grande. O limite máximo permitido para este recurso é de ${limitMB}.`
        });
    }

    // 2) Erro de requisição abortada prematuramente pelo cliente (ex: raw-body BadRequestError)
    if (err.message === 'request aborted' || err.code === 'ECONNABORTED' || (err.status === 400 && err.message?.includes('abort'))) {
        console.warn(`[Network] Requisição abortada prematuramente pelo cliente: ${err.message}`);
        return res.status(400).json({ error: 'Conexão interrompida pelo cliente antes da conclusão da requisição' });
    }

    // 3) Erros de limite de tamanho do body-parser (Entity too large)
    if (err.status === 413 || err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'O tamanho da requisição excede o limite máximo permitido.' });
    }

    console.error('Erro interno do servidor:', err);

    if (typeof persistSystemLog === 'function') {
        persistSystemLog({
            type: 'Express Global Error',
            message: err.message || 'Erro interno do servidor',
            level: 'error',
            payload: {
                path: req.originalUrl || req.path,
                method: req.method,
                ip: req.ip,
                query: req.query,
                stack_trace: err.stack
            }
        });
    }

    return res.status(500).json({ error: err.message || 'Erro interno no servidor' });
});

async function runMigrations() {
    console.log("[Migration] Iniciando verificação de migrações DDL...");
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.warn("[Migration] DATABASE_URL não configurada no .env. Ignorando migração.");
        return;
    }
    const client = new pg.Client({
        connectionString,
        ssl: connectionString.includes('supabase') ? { rejectUnauthorized: false } : false
    });
    try {
        await client.connect();
        console.log("[Migration] Conectado ao banco de dados via pg client.");
        const migrationSQL = `
          DROP FUNCTION IF EXISTS match_ai_reasoning_adjustments(vector, double precision, integer, uuid);
          DROP FUNCTION IF EXISTS match_ai_reasoning_adjustments(vector, float, int, uuid);
          DROP FUNCTION IF EXISTS match_ai_reasoning_adjustments(vector(384), float, int, uuid);
          ALTER TABLE ai_reasoning_adjustments ADD COLUMN IF NOT EXISTS context_summary text;
          CREATE OR REPLACE FUNCTION match_ai_reasoning_adjustments(
            query_embedding vector(384),
            match_threshold float,
            match_count int,
            p_tenant_id uuid
          )
          RETURNS TABLE (
            id uuid,
            user_query text,
            original_response text,
            corrected_response text,
            context_summary text,
            similarity float
          )
          LANGUAGE plpgsql
          AS $$
          BEGIN
            RETURN QUERY
            SELECT
              ara.id,
              ara.user_query,
              ara.original_response,
              ara.corrected_response,
              ara.context_summary,
              1 - (ara.embedding <=> query_embedding) AS similarity
            FROM ai_reasoning_adjustments ara
            WHERE ara.tenant_id = p_tenant_id
              AND 1 - (ara.embedding <=> query_embedding) > match_threshold
            ORDER BY ara.embedding <=> query_embedding
            LIMIT match_count;
          END;
          $$;

          CREATE TABLE IF NOT EXISTS webhook_triggers (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL,
            name text NOT NULL,
            event_type text NOT NULL,
            action_type text NOT NULL,
            url text NOT NULL,
            headers jsonb DEFAULT '{}'::jsonb,
            body_template text,
            is_active boolean DEFAULT true,
            created_at timestamp with time zone DEFAULT now()
          );

          -- Tabelas do Cardápio (Gastrofood)
          CREATE TABLE IF NOT EXISTS cardapio_grupos (
            id text,
            tenant_id uuid NOT NULL,
            ordem integer DEFAULT 0,
            descricao text NOT NULL,
            ativo boolean DEFAULT true,
            created_at timestamp with time zone DEFAULT now(),
            PRIMARY KEY (tenant_id, id)
          );
          ALTER TABLE cardapio_grupos ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Permitir tudo em cardapio_grupos" ON cardapio_grupos;
          CREATE POLICY "Permitir tudo em cardapio_grupos" ON cardapio_grupos FOR ALL USING (true) WITH CHECK (true);

          CREATE TABLE IF NOT EXISTS cardapio_produtos (
            id text,
            tenant_id uuid NOT NULL,
            grupo_id text,
            name text NOT NULL,
            description text,
            price numeric(10,2) NOT NULL DEFAULT 0.00,
            image text,
            ativo boolean DEFAULT true,
            created_at timestamp with time zone DEFAULT now(),
            PRIMARY KEY (tenant_id, id),
            FOREIGN KEY (tenant_id, grupo_id) REFERENCES cardapio_grupos(tenant_id, id) ON DELETE CASCADE
          );
          ALTER TABLE cardapio_produtos ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Permitir tudo em cardapio_produtos" ON cardapio_produtos;
          CREATE POLICY "Permitir tudo em cardapio_produtos" ON cardapio_produtos FOR ALL USING (true) WITH CHECK (true);

          CREATE TABLE IF NOT EXISTS cardapio_passos (
            id text,
            tenant_id uuid NOT NULL,
            produto_id text,
            pergunta text NOT NULL,
            sub_titulo text,
            qtd_min integer DEFAULT 0,
            qtd_max integer DEFAULT 1,
            ordem integer DEFAULT 0,
            ativo boolean DEFAULT true,
            created_at timestamp with time zone DEFAULT now(),
            PRIMARY KEY (tenant_id, id),
            FOREIGN KEY (tenant_id, produto_id) REFERENCES cardapio_produtos(tenant_id, id) ON DELETE CASCADE
          );
          ALTER TABLE cardapio_passos ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Permitir tudo em cardapio_passos" ON cardapio_passos;
          CREATE POLICY "Permitir tudo em cardapio_passos" ON cardapio_passos FOR ALL USING (true) WITH CHECK (true);

          CREATE TABLE IF NOT EXISTS cardapio_opcoes (
            id text,
            tenant_id uuid NOT NULL,
            passo_id text,
            descricao text NOT NULL,
            preco numeric(10,2) NOT NULL DEFAULT 0.00,
            imagem text,
            ativo boolean DEFAULT true,
            created_at timestamp with time zone DEFAULT now(),
            PRIMARY KEY (tenant_id, id),
            FOREIGN KEY (tenant_id, passo_id) REFERENCES cardapio_passos(tenant_id, id) ON DELETE CASCADE
          );
          ALTER TABLE cardapio_opcoes ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Permitir tudo em cardapio_opcoes" ON cardapio_opcoes;
          CREATE POLICY "Permitir tudo em cardapio_opcoes" ON cardapio_opcoes FOR ALL USING (true) WITH CHECK (true);

          ALTER TABLE bots ADD COLUMN IF NOT EXISTS enabled_endpoints text[] DEFAULT ARRAY['cardapio', 'adicionais', 'cep', 'cliente', 'cadastro', 'pix', 'pedido', 'status'];
        `;
        await client.query(migrationSQL);
        console.log("[Migration] Migração DDL executada com sucesso!");
    } catch (err) {
        console.warn("[Migration] Falha ao executar migração de banco local (conexão direta IPv6 indisponível nesta rede). Erro:", err.message);
    } finally {
        try {
            await client.end();
        } catch(e) {}
    }
}

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Antigravity V2] Node.js Server online na porta ${PORT}`);
    
    const isLocalDev = process.env.IS_LOCAL_DEV === 'true' || process.env.DISABLE_AUTO_START_SESSIONS === 'true';
    if (isLocalDev) {
        console.log("[Worker Boot] Ambiente de Desenvolvimento Local Detectado (IS_LOCAL_DEV/DISABLE_AUTO_START_SESSIONS = true).");
        console.log("[Worker Boot] Registro de release, auto-start de instâncias e todos os serviços de background/realtime foram SUSPENSOS localmente para evitar conflitos de concorrência com o servidor online do Coolify.");
        return;
    }
    
    try {
        await runMigrations();
    } catch(migErr) {
        console.error("[Migration] Erro não impeditivo ao rodar migrações:", migErr.message);
    }
    
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
        if (process.env.DISABLE_AUTO_START_SESSIONS === 'true') {
            console.log("[Worker Boot] Auto-start de instâncias desabilitado via configuração (DISABLE_AUTO_START_SESSIONS=true).");
        } else {
            console.log("[Worker Boot] Buscando instâncias pendentes...");
            const { data: activeLeases } = await supabase
                .from('whatsapp_instances')
                .select('id, tenant_id')
                .in('status', ['connected', 'connecting', 'qr_ready', 'reconnecting', 'reconnecting_local']);
                
            if (activeLeases && activeLeases.length > 0) {
                console.log(`[Worker Boot] Retomando ${activeLeases.length} sockets...`);
                for (const instance of activeLeases) {
                    const startSessionWithRetry = (attempt = 1) => {
                        const forceTakeover = attempt >= 2;
                        sessionManager.createSession(instance.tenant_id, instance.id, forceTakeover).catch(e => {
                             const isLockError = e.message && (e.message.includes('lock ativo') || e.message.includes('Lock negado') || e.message.includes('Conexão negada'));
                             if (isLockError && attempt < 3) {
                                 console.log(`[Worker Boot] Instância ${instance.id} sob lease de outro nó. Agendando retentativa com takeover (${attempt}/3) em 35s...`);
                                 setTimeout(() => startSessionWithRetry(attempt + 1), 35000);
                             } else if (isLockError) {
                                 console.log(`[Worker Boot] Instância ${instance.id} permanece sob responsabilidade de outro nó ativo.`);
                             } else {
                                 console.error(`Falha Auto-Restart (Tentativa ${attempt}): ${instance.id} - ${e.message}`);
                             }
                        });
                    };
                    startSessionWithRetry();
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        }
    } catch(err) {
        console.error("Erro no worker boot", err);
    }

    try {
        console.log("[Worker Boot] Inicializando SnoozeManager...");
        snoozeManager.start();
    } catch(err) {
        console.error("[Worker Boot] Erro ao iniciar SnoozeManager:", err.message);
    }

    try {
        console.log("[Worker Boot] Inicializando QueueProcessor de Mensagens...");
        queueProcessor.start();
    } catch(err) {
        console.error("[Worker Boot] Erro ao iniciar QueueProcessor:", err.message);
    }

    try {
        console.log("[Worker Boot] Inicializando Cardapio Background Sync...");
        AutomationWorker.startCardapioBackgroundSync();
    } catch(err) {
        console.error("[Worker Boot] Erro ao iniciar Cardapio Background Sync:", err.message);
    }

    try {
        if (process.env.ENABLE_WACALLS === 'true') {
            console.log("[Worker Boot] Inicializando WaCalls Background Process...");
            startWaCallsProcess();
        } else {
            console.log("[Worker Boot] Módulo WaCalls (VoIP Go) está ISOLADO/DESATIVADO (ENABLE_WACALLS != true).");
        }
    } catch(err) {
        console.error("[Worker Boot] Erro ao iniciar WaCalls Process:", err.message);
    }

    try {
        if (process.env.ENABLE_WACALLS === 'true') {
            console.log("[Worker Boot] Inicializando WaCalls Background Listener...");
            startWaCallsListener();
        }
    } catch(err) {
        console.error("[Worker Boot] Erro ao iniciar WaCalls Listener:", err.message);
    }

    try {
        console.log("[Worker Boot] Inicializando Realtime Auto-RAG Trainer...");
        const notifiedResolvedConvs = new Set();
        const notifiedAiPausedConvs = new Set();

        supabase.channel('backend_conversations_changes')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, async (payload) => {
              const oldConv = payload.old;
              const newConv = payload.new;
              
              if (newConv && newConv.status === 'resolved') {
                  if (oldConv && oldConv.status !== 'resolved' && !notifiedResolvedConvs.has(newConv.id)) {
                      notifiedResolvedConvs.add(newConv.id);
                      console.log(`[AutoRagTrainer] Conversa ${newConv.id} marcada como RESOLVIDA. (Treinamento automático desativado)`);

                      // Trigger webhook
                      (async () => {
                          try {
                              let phone = '';
                              if (newConv.contact_id) {
                                  const { data: contact } = await supabase.from('contacts').select('phone').eq('id', newConv.contact_id).single();
                                  if (contact) phone = contact.phone || '';
                              }
                              await dispatchWebhookTriggers(newConv.tenant_id, 'ticket_resolved', {
                                  phone,
                                  message: 'Ticket resolved',
                                  conversation_id: newConv.id,
                                  contact_id: newConv.contact_id || ''
                              });
                          } catch (err) {
                              console.error('[WebhookTrigger] Erro ao processar webhook ticket_resolved:', err);
                          }
                      })();
                  }
              } else if (newConv && newConv.status !== 'resolved') {
                  notifiedResolvedConvs.delete(newConv.id);
              }

              if (newConv && newConv.ai_paused === true) {
                  if (oldConv && oldConv.ai_paused === false && !notifiedAiPausedConvs.has(newConv.id)) {
                      notifiedAiPausedConvs.add(newConv.id);
                      console.log(`[WebhookTrigger] Conversa ${newConv.id} teve a IA pausada. Iniciando disparo de webhook.`);
                      (async () => {
                          try {
                              let phone = '';
                              if (newConv.contact_id) {
                                  const { data: contact } = await supabase.from('contacts').select('phone').eq('id', newConv.contact_id).single();
                                  if (contact) phone = contact.phone || '';
                              }
                              await dispatchWebhookTriggers(newConv.tenant_id, 'ai_paused', {
                                  phone,
                                  message: 'AI Paused',
                                  conversation_id: newConv.id,
                                  contact_id: newConv.contact_id || ''
                              });
                          } catch (err) {
                              console.error('[WebhookTrigger] Erro ao processar webhook ai_paused:', err);
                          }
                      })();
                  }
              } else if (newConv && newConv.ai_paused === false) {
                  notifiedAiPausedConvs.delete(newConv.id);
              }
          })
          .subscribe((status) => {
              console.log(`[AutoRagTrainer] Assinatura Realtime de conversas resolvidas: ${status}`);
          });
    } catch(err) {
        console.error("[Worker Boot] Erro ao assinar realtime conversations:", err.message);
    }
});

// Desligamento gracioso: sincroniza as chaves do Baileys pendentes na RAM para o Supabase antes de sair
const gracefulShutdown = async (signal) => {
    console.log(`[Antigravity Boot] Recebido sinal ${signal}. Iniciando desligamento gracioso...`);
    try {
        console.log(`[Antigravity Boot] Liberando locks de instâncias para o NODE_ID: ${NODE_ID}`);
        await supabase.from('whatsapp_instances')
            .update({
                assigned_node_id: null,
                lease_until: null,
                status: 'offline'
            })
            .eq('assigned_node_id', NODE_ID);
            
        const { flushAllPendingWrites } = await import('./session-manager/auth.js');
        await flushAllPendingWrites();
        console.log(`[Antigravity Boot] Sincronização de chaves concluída com sucesso.`);
    } catch (err) {
        console.error(`[Antigravity Boot] Erro durante o desligamento gracioso:`, err.message || err);
    }
    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
