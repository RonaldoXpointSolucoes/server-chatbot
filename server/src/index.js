import { config } from 'dotenv';
config({ path: '../.env' });
import pg from 'pg';
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
import snoozeManager from './snooze-manager.js';
import autoRagTrainer from './automation-worker/auto-rag-trainer.js';
import { dispatchWebhookTriggers } from './event-processor/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-agent-id', 'apikey', 'x-asts-test', 'X-Asts-Test']
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
    return res.json({ status: 'ok', errors: [] });
});

// Setup Swagger UI (/swagger/teste.html)
setupSwagger(app);

// Rotas públicas formato REST (Evolution API style)
app.use('/', publicRestRoutes);

app.use('/api', apiGateway);
app.use('/api/v1/system/logs', systemLogger);

// Middleware global de tratamento de erros (ex: Multer LIMIT_FILE_SIZE)
app.use((err, req, res, next) => {
    if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
        const isKnowledge = req.originalUrl && req.originalUrl.includes('/knowledge');
        const limitMB = isKnowledge ? '100MB' : '500MB';
        return res.status(413).json({
            error: `O arquivo enviado é muito grande. O limite máximo permitido para este recurso é de ${limitMB}.`
        });
    }
    console.error('Erro interno do servidor:', err);
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
            id text PRIMARY KEY,
            tenant_id uuid NOT NULL,
            ordem integer DEFAULT 0,
            descricao text NOT NULL,
            ativo boolean DEFAULT true,
            created_at timestamp with time zone DEFAULT now()
          );
          ALTER TABLE cardapio_grupos ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Permitir tudo em cardapio_grupos" ON cardapio_grupos;
          CREATE POLICY "Permitir tudo em cardapio_grupos" ON cardapio_grupos FOR ALL USING (true) WITH CHECK (true);

          CREATE TABLE IF NOT EXISTS cardapio_produtos (
            id text PRIMARY KEY,
            tenant_id uuid NOT NULL,
            grupo_id text REFERENCES cardapio_grupos(id) ON DELETE CASCADE,
            name text NOT NULL,
            description text,
            price numeric(10,2) NOT NULL DEFAULT 0.00,
            image text,
            ativo boolean DEFAULT true,
            created_at timestamp with time zone DEFAULT now()
          );
          ALTER TABLE cardapio_produtos ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Permitir tudo em cardapio_produtos" ON cardapio_produtos;
          CREATE POLICY "Permitir tudo em cardapio_produtos" ON cardapio_produtos FOR ALL USING (true) WITH CHECK (true);

          CREATE TABLE IF NOT EXISTS cardapio_passos (
            id text PRIMARY KEY,
            tenant_id uuid NOT NULL,
            produto_id text REFERENCES cardapio_produtos(id) ON DELETE CASCADE,
            pergunta text NOT NULL,
            sub_titulo text,
            qtd_min integer DEFAULT 0,
            qtd_max integer DEFAULT 1,
            ordem integer DEFAULT 0,
            ativo boolean DEFAULT true,
            created_at timestamp with time zone DEFAULT now()
          );
          ALTER TABLE cardapio_passos ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Permitir tudo em cardapio_passos" ON cardapio_passos;
          CREATE POLICY "Permitir tudo em cardapio_passos" ON cardapio_passos FOR ALL USING (true) WITH CHECK (true);

          CREATE TABLE IF NOT EXISTS cardapio_opcoes (
            id text PRIMARY KEY,
            tenant_id uuid NOT NULL,
            passo_id text REFERENCES cardapio_passos(id) ON DELETE CASCADE,
            descricao text NOT NULL,
            preco numeric(10,2) NOT NULL DEFAULT 0.00,
            imagem text,
            ativo boolean DEFAULT true,
            created_at timestamp with time zone DEFAULT now()
          );
          ALTER TABLE cardapio_opcoes ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Permitir tudo em cardapio_opcoes" ON cardapio_opcoes;
          CREATE POLICY "Permitir tudo em cardapio_opcoes" ON cardapio_opcoes FOR ALL USING (true) WITH CHECK (true);
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
    await runMigrations();
    
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
        console.log("[Worker Boot] Inicializando Realtime Auto-RAG Trainer...");
        supabase.channel('backend_conversations_changes')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, async (payload) => {
              const oldConv = payload.old;
              const newConv = payload.new;
              
              if (newConv && newConv.status === 'resolved' && (!oldConv || oldConv.status !== 'resolved')) {
                  console.log(`[AutoRagTrainer] Conversa ${newConv.id} marcada como RESOLVIDA. Iniciando análise assíncrona.`);
                  autoRagTrainer.trainFromResolvedConversation(newConv.tenant_id, newConv.id).catch(err => {
                      console.error(`[AutoRagTrainer] Erro ao treinar conversa ${newConv.id}:`, err);
                  });

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

              if (newConv && newConv.ai_paused === true && (!oldConv || !oldConv.ai_paused)) {
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
          })
          .subscribe((status) => {
              console.log(`[AutoRagTrainer] Assinatura Realtime de conversas resolvidas: ${status}`);
          });
    } catch(err) {
        console.error("[Worker Boot] Erro ao assinar realtime conversations:", err.message);
    }
});
