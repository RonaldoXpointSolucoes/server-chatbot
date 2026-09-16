const https = require('https');
const http = require('http');
const WebSocket = require('ws');

// Configurações do Ambiente e Argumentos da CLI
const args = process.argv.slice(2);
const isAlpha = args.includes('--env') && args[args.indexOf('--env') + 1] === 'alpha';
const levelArg = args.includes('--level') ? parseInt(args[args.indexOf('--level') + 1], 10) : 1;

const ENGINE_URL = isAlpha 
  ? 'https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io' 
  : 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';

const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

// Caixas Oficiais
const FOODNEXT = {
  name: 'FoodNext',
  phone: '5511947758860',
  jid: '5511947758860@s.whatsapp.net',
  instanceId: 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6'
};

const RONALDO_WEB = {
  name: 'Ronaldo-Web',
  phone: '5511975960999',
  jid: '5511975960999@s.whatsapp.net',
  instanceId: '5c78d358-d449-41c4-b396-a04ab20a39e4'
};

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function request(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      ...options,
      rejectUnauthorized: false
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * Cliente Supabase Realtime via WebSocket para registrar o timestamp exato de entrega
 */
class RealtimeSubscriber {
  constructor(supabaseUrl, serviceKey, tenantId) {
    this.supabaseUrl = supabaseUrl;
    this.serviceKey = serviceKey;
    this.tenantId = tenantId;
    this.ws = null;
    this.listeners = new Map(); // msgId -> resolveCallback
    this.connected = false;
    this.heartbeatTimer = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.supabaseUrl.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${this.serviceKey}&vsn=1.0.0`;
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.connected = true;
        // Ingressa no canal postgres_changes de messages
        const joinMsg = {
          topic: `realtime:public:messages:tenant_id=eq.${this.tenantId}`,
          event: 'phx_join',
          payload: {
            config: {
              postgres_changes: [
                { event: 'INSERT', schema: 'public', table: 'messages' },
                { event: 'UPDATE', schema: 'public', table: 'messages' }
              ]
            }
          },
          ref: '1'
        };
        this.ws.send(JSON.stringify(joinMsg));

        // Heartbeat periódico (30s)
        this.heartbeatTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }));
          }
        }, 25000);

        resolve(true);
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.event === 'postgres_changes') {
            const record = msg.payload?.data?.record;
            const waId = record?.whatsapp_message_id;
            if (waId && this.listeners.has(waId)) {
              const callback = this.listeners.get(waId);
              this.listeners.delete(waId);
              callback({
                record,
                event: msg.payload?.data?.type || 'INSERT',
                receivedAtMs: Date.now()
              });
            }
          }
        } catch (e) {}
      });

      this.ws.on('error', (err) => {
        if (!this.connected) reject(err);
      });

      this.ws.on('close', () => {
        this.connected = false;
        clearInterval(this.heartbeatTimer);
      });
    });
  }

  waitForMessage(whatsappMessageId, timeoutMs = 25000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.listeners.delete(whatsappMessageId);
        resolve(null);
      }, timeoutMs);

      this.listeners.set(whatsappMessageId, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  close() {
    clearInterval(this.heartbeatTimer);
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
  }
}

/**
 * Consulta a Telemetria em tempo real do Node.js
 */
async function fetchServerTelemetry() {
  try {
    const res = await request(`${ENGINE_URL}/api/v1/diagnostics/telemetry`);
    if (res.status === 200 && res.data?.ok) {
      return res.data.telemetry;
    }
  } catch (e) {}
  return null;
}

/**
 * Dispara snapshot de anomalia caso ocorra erro ou timeout
 */
async function triggerAnomalySnapshot(reason, metadata = {}) {
  try {
    await request(`${ENGINE_URL}/api/v1/diagnostics/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, metadata })
    });
  } catch (e) {}
}

/**
 * Executa o envio de uma mensagem com Trace ID e mede todos os estágios
 */
async function executeE2EMessageTrace({
  testRunId,
  cycle,
  origin,
  target,
  realtimeSub
}) {
  const traceId = `E2E-${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)}-${Date.now().toString().slice(-4)}-C${cycle}-${origin.name.slice(0,2)}-${target.name.slice(0,2)}`;
  const text = `[${origin.name} ➔ ${target.name}] Teste E2E (${traceId})`;

  const timeline = {
    traceId,
    cycle,
    direction: `${origin.name}_TO_${target.name}`,
    origin: origin.name,
    target: target.name,
    text,
    timestamps: {},
    durationsMs: {},
    stages: {},
    success: false,
    error: null
  };

  // 1. FRONTEND_SEND / TEST_CREATED
  const t0 = Date.now();
  timeline.timestamps.FRONTEND_SEND = t0;

  // 2. NODE_REQUEST_RECEIVED & BAILEYS_SEND
  try {
    const invokeRes = await request(`${ENGINE_URL}/api/v1/instances/${origin.instanceId}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID,
        'x-trace-id': traceId
      },
      body: JSON.stringify({
        method: 'sendMessage',
        args: [target.jid, { text }]
      })
    });

    const t1 = Date.now();
    timeline.timestamps.BAILEYS_SEND_RETURN = t1;
    timeline.durationsMs.HTTP_ROUNDTRIP = t1 - t0;

    if (invokeRes.status !== 200 || !invokeRes.data?.ok) {
      timeline.error = `HTTP Invoke falhou (Status: ${invokeRes.status}): ${JSON.stringify(invokeRes.data || invokeRes.text)}`;
      await triggerAnomalySnapshot('E2E_INVOKE_FAILED', { traceId, error: timeline.error });
      return timeline;
    }

    const whatsappMessageId = invokeRes.data?.result?.key?.id;
    if (!whatsappMessageId) {
      timeline.error = 'Baileys não retornou whatsappMessageId oficial!';
      await triggerAnomalySnapshot('E2E_NO_MESSAGE_ID', { traceId });
      return timeline;
    }

    timeline.whatsappMessageId = whatsappMessageId;
    timeline.stages.BAILEYS_SEND_SUCCESS = true;

    // 3. Aguarda o Supabase Realtime registrar a chegada da mensagem
    const realtimePromise = realtimeSub.waitForMessage(whatsappMessageId, 25000);

    // 4. Checa em paralelo a persistência no Supabase (wa_outgoing_messages e messages)
    let outboundPersisted = false;
    let inboundPersisted = false;
    const startDbPoll = Date.now();

    for (let attempt = 0; attempt < 12; attempt++) {
      if (!outboundPersisted) {
        const outRes = await request(`${SUPABASE_URL}/rest/v1/wa_outgoing_messages?instance_id=eq.${origin.instanceId}&body=eq.${encodeURIComponent(text)}&select=id,status,sent_at&limit=1`, {
          headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
        });
        if (outRes.data && outRes.data.length > 0 && outRes.data[0].status === 'sent') {
          outboundPersisted = true;
          timeline.timestamps.SUPABASE_OUTBOUND_PERSISTED = Date.now();
          timeline.supabaseOutboundId = outRes.data[0].id;
        }
      }

      if (!inboundPersisted) {
        const inRes = await request(`${SUPABASE_URL}/rest/v1/messages?whatsapp_message_id=eq.${whatsappMessageId}&select=id,created_at,sender_type,status&limit=1`, {
          headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
        });
        if (inRes.data && inRes.data.length > 0) {
          inboundPersisted = true;
          timeline.timestamps.SUPABASE_INBOUND_PERSISTED = Date.now();
          timeline.supabaseInboundId = inRes.data[0].id;
        }
      }

      if (outboundPersisted && inboundPersisted) break;
      await delay(1000);
    }

    const realtimeResult = await realtimePromise;
    if (realtimeResult) {
      timeline.timestamps.SUPABASE_REALTIME_RECEIVED = realtimeResult.receivedAtMs;
      timeline.stages.SUPABASE_REALTIME_RECEIVED = true;
    }

    const tEnd = Date.now();
    timeline.timestamps.E2E_FINISHED = tEnd;
    timeline.durationsMs.TOTAL_E2E = tEnd - t0;

    // Validação de sucesso integral
    if (timeline.stages.BAILEYS_SEND_SUCCESS && (inboundPersisted || realtimeResult)) {
      timeline.success = true;
    } else {
      timeline.error = `Timeout aguardando persistência ou realtime (Outbound: ${outboundPersisted}, Inbound: ${inboundPersisted}, Realtime: ${!!realtimeResult})`;
      await triggerAnomalySnapshot('E2E_MESSAGE_TIMEOUT', { traceId, whatsappMessageId, outboundPersisted, inboundPersisted });
    }

  } catch (err) {
    timeline.error = `Exceção durante execução E2E: ${err.message}`;
    await triggerAnomalySnapshot('E2E_EXCEPTION', { traceId, error: err.message });
  }

  return timeline;
}

/**
 * Calcula métricas estatísticas de um array de números
 */
function calculateStats(values) {
  if (!values || values.length === 0) return { min: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const p = (pct) => sorted[Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length))];
  return {
    min: sorted[0],
    mean: Number(mean.toFixed(1)),
    p50: p(50),
    p95: p(95),
    p99: p(99),
    max: sorted[sorted.length - 1]
  };
}

/**
 * Runner Principal
 */
async function runE2EDiagnosticSuite() {
  console.log(`\n======================================================`);
  console.log(`🚀 INICIANDO SUÍTE DIAGNÓSTICA E2E DE ALTO NÍVEL`);
  console.log(`Ambiente Alvo: ${isAlpha ? '🔴 ALFA (Homologação)' : '🟢 PRODUÇÃO'}`);
  console.log(`URL do Motor: ${ENGINE_URL}`);
  console.log(`Nível de Teste Selecionado: NÍVEL ${levelArg}`);
  console.log(`======================================================\n`);

  // Conecta ao Supabase Realtime
  console.log(`[Realtime] Estabelecendo conexão WebSocket com Supabase Realtime...`);
  const realtimeSub = new RealtimeSubscriber(SUPABASE_URL, SERVICE_KEY, TENANT_ID);
  try {
    await realtimeSub.connect();
    console.log(`[Realtime] ✅ Conexão WebSocket estabelecida e canal 'messages' assinado com sucesso!\n`);
  } catch (e) {
    console.warn(`[Realtime] ⚠️ Não foi possível conectar ao WebSocket do Realtime: ${e.message}. Prosseguindo com fallback via HTTP REST polling.\n`);
  }

  // Telemetria Inicial
  const initialTelemetry = await fetchServerTelemetry();
  console.log(`[Telemetria Inicial do Servidor Node]`);
  if (initialTelemetry) {
    console.log(`• Uptime: ${initialTelemetry.uptimeSeconds}s | Memória RSS: ${initialTelemetry.memory.rssMb}MB | Heap: ${initialTelemetry.memory.heapUsedMb}/${initialTelemetry.memory.heapTotalMb}MB`);
    console.log(`• Event Loop Lag P95: ${initialTelemetry.eventLoop.p95Ms}ms | Sessões Ativas: ${initialTelemetry.baileys.activeSessionsCount} | Listeners Totais: ${initialTelemetry.baileys.totalListeners}\n`);
  } else {
    console.log(`• Endpoint de telemetria indisponível ou antigo.\n`);
  }

  const allTraces = [];
  const startTime = Date.now();

  // =========================================================================
  // EXECUÇÃO CONFORME O NÍVEL
  // =========================================================================

  if (levelArg === 1) {
    // NÍVEL 1: Funcional (3 Ciclos Bidirecionais = 6 Mensagens)
    console.log(`>>> EXECUTANDO NÍVEL 1: TESTE FUNCIONAL (3 Ciclos Bidirecionais) <<<`);
    for (let cycle = 1; cycle <= 3; cycle++) {
      console.log(`\n------------------------------------------------------`);
      console.log(`Ciclo ${cycle}/3 - Passo A: FoodNext ➔ Ronaldo-Web`);
      const traceA = await executeE2EMessageTrace({ testRunId: 'RUN-LV1', cycle, origin: FOODNEXT, target: RONALDO_WEB, realtimeSub });
      console.log(`[Ciclo ${cycle}/3 - Passo A] ${traceA.success ? '✅ SUCESSO' : '❌ FALHA'} | TraceId: ${traceA.traceId} | MsgId: ${traceA.whatsappMessageId} | E2E: ${traceA.durationsMs.TOTAL_E2E}ms`);
      allTraces.push(traceA);

      await delay(2500);

      console.log(`Ciclo ${cycle}/3 - Passo B: Ronaldo-Web ➔ FoodNext`);
      const traceB = await executeE2EMessageTrace({ testRunId: 'RUN-LV1', cycle, origin: RONALDO_WEB, target: FOODNEXT, realtimeSub });
      console.log(`[Ciclo ${cycle}/3 - Passo B] ${traceB.success ? '✅ SUCESSO' : '❌ FALHA'} | TraceId: ${traceB.traceId} | MsgId: ${traceB.whatsappMessageId} | E2E: ${traceB.durationsMs.TOTAL_E2E}ms`);
      allTraces.push(traceB);

      await delay(2500);
    }
  } else if (levelArg === 2) {
    // NÍVEL 2: Estabilidade (1 msg a cada 5s por 5 minutos = ~60 msgs)
    console.log(`>>> EXECUTANDO NÍVEL 2: ESTABILIDADE (1 msg a cada 5s por 5 minutos) <<<`);
    const totalMessages = 60;
    for (let i = 1; i <= totalMessages; i++) {
      const isEven = i % 2 === 0;
      const origin = isEven ? RONALDO_WEB : FOODNEXT;
      const target = isEven ? FOODNEXT : RONALDO_WEB;

      console.log(`[Estabilidade ${i}/${totalMessages}] Envio de ${origin.name} ➔ ${target.name}...`);
      const trace = await executeE2EMessageTrace({ testRunId: 'RUN-LV2', cycle: i, origin, target, realtimeSub });
      console.log(`[Estabilidade ${i}/${totalMessages}] ${trace.success ? '✅' : '❌'} | MsgId: ${trace.whatsappMessageId} | E2E: ${trace.durationsMs.TOTAL_E2E}ms`);
      allTraces.push(trace);

      await delay(5000);
    }
  } else if (levelArg === 3) {
    // NÍVEL 3: Concorrente Bidirecional (Disparos Simultâneos)
    console.log(`>>> EXECUTANDO NÍVEL 3: CONCORRENTE BIDIRECIONAL (Disparos Simultâneos) <<<`);
    for (let cycle = 1; cycle <= 5; cycle++) {
      console.log(`\n[Concorrência Ciclo ${cycle}/5] Disparando FoodNext ➔ Ronaldo-Web E Ronaldo-Web ➔ FoodNext simultaneamente...`);
      const [traceA, traceB] = await Promise.all([
        executeE2EMessageTrace({ testRunId: 'RUN-LV3', cycle, origin: FOODNEXT, target: RONALDO_WEB, realtimeSub }),
        executeE2EMessageTrace({ testRunId: 'RUN-LV3', cycle, origin: RONALDO_WEB, target: FOODNEXT, realtimeSub })
      ]);

      console.log(`[Concorrência Ciclo ${cycle}/5] FN➔RW: ${traceA.success ? '✅' : '❌'} (${traceA.durationsMs.TOTAL_E2E}ms) | RW➔FN: ${traceB.success ? '✅' : '❌'} (${traceB.durationsMs.TOTAL_E2E}ms)`);
      allTraces.push(traceA, traceB);

      await delay(3000);
    }
  } else if (levelArg === 4) {
    // NÍVEL 4: Rajada Controlada (10 mensagens com intervalo de 500ms)
    console.log(`>>> EXECUTANDO NÍVEL 4: RAJADA CONTROLADA (10 msgs em rajada de 500ms) <<<`);
    for (let i = 1; i <= 10; i++) {
      const trace = await executeE2EMessageTrace({ testRunId: 'RUN-LV4', cycle: i, origin: FOODNEXT, target: RONALDO_WEB, realtimeSub });
      console.log(`[Rajada ${i}/10] ${trace.success ? '✅' : '❌'} | E2E: ${trace.durationsMs.TOTAL_E2E}ms`);
      allTraces.push(trace);
      await delay(500);
    }
  }

  // Telemetria Final
  const finalTelemetry = await fetchServerTelemetry();
  realtimeSub.close();
  const totalDurationSeconds = Math.floor((Date.now() - startTime) / 1000);

  // =========================================================================
  // RELATÓRIO ESTATÍSTICO AUTOMATIZADO
  // =========================================================================
  const successfulTraces = allTraces.filter(t => t.success);
  const failedTraces = allTraces.filter(t => !t.success);
  const totalE2ELatencies = successfulTraces.map(t => t.durationsMs.TOTAL_E2E).filter(Boolean);
  const httpLatencies = successfulTraces.map(t => t.durationsMs.HTTP_ROUNDTRIP).filter(Boolean);

  const e2eStats = calculateStats(totalE2ELatencies);
  const httpStats = calculateStats(httpLatencies);

  console.log(`\n\n======================================================`);
  console.log(`📊 RELATÓRIO DIAGNÓSTICO E2E CONSOLIDADO (NÍVEL ${levelArg})`);
  console.log(`======================================================`);
  console.log(`Duração Total da Suíte: ${totalDurationSeconds}s`);
  console.log(`Total de Mensagens Enviadas: ${allTraces.length}`);
  console.log(`Mensagens Entregues com Sucesso: ${successfulTraces.length} (${allTraces.length > 0 ? ((successfulTraces.length / allTraces.length) * 100).toFixed(1) : 0}%)`);
  console.log(`Mensagens Falhadas/Timeout: ${failedTraces.length}`);

  console.log(`\n--- LATÊNCIA TOTAL E2E (WhatsApp Real + Banco + Realtime) ---`);
  console.log(`Mínimo: ${e2eStats.min}ms | Médio: ${e2eStats.mean}ms | P50: ${e2eStats.p50}ms | P95: ${e2eStats.p95}ms | P99: ${e2eStats.p99}ms | Máximo: ${e2eStats.max}ms`);

  console.log(`\n--- LATÊNCIA HTTP ROUNDTRIP (Node ➔ Baileys Meta Send) ---`);
  console.log(`Mínimo: ${httpStats.min}ms | Médio: ${httpStats.mean}ms | P50: ${httpStats.p50}ms | P95: ${httpStats.p95}ms | P99: ${httpStats.p99}ms | Máximo: ${httpStats.max}ms`);

  if (initialTelemetry && finalTelemetry) {
    console.log(`\n--- SAÚDE DO SERVIDOR NODE.JS (INICIAL ➔ FINAL) ---`);
    console.log(`• Memória RSS: ${initialTelemetry.memory.rssMb}MB ➔ ${finalTelemetry.memory.rssMb}MB (Variação: ${(finalTelemetry.memory.rssMb - initialTelemetry.memory.rssMb).toFixed(2)}MB)`);
    console.log(`• Heap Used: ${initialTelemetry.memory.heapUsedMb}MB ➔ ${finalTelemetry.memory.heapUsedMb}MB`);
    console.log(`• Event Loop Lag P95 Final: ${finalTelemetry.eventLoop.p95Ms}ms (Máx: ${finalTelemetry.eventLoop.maxMs}ms)`);
    console.log(`• Listeners Baileys: ${initialTelemetry.baileys.totalListeners} ➔ ${finalTelemetry.baileys.totalListeners} (${initialTelemetry.baileys.totalListeners === finalTelemetry.baileys.totalListeners ? '✅ Zero Vazamento' : '⚠️ Variação Detectada'})`);
    console.log(`• Reconnect Storm Detectado: ${finalTelemetry.baileys.anyReconnectStorm ? '🚨 SIM' : '✅ NÃO (Estável)'}`);
  }

  if (failedTraces.length > 0) {
    console.log(`\n🚨 RELATÓRIO DE FALHAS DETALHADAS:`);
    failedTraces.forEach((f, idx) => {
      console.log(`\n[Falha #${idx + 1}] TraceId: ${f.traceId} | Direção: ${f.direction}`);
      console.log(`• Erro: ${f.error}`);
      console.log(`• Timestamps:`, JSON.stringify(f.timestamps));
    });
    process.exit(1);
  } else {
    console.log(`\n✅ RESULTADO FINAL: APROVADO COM 100% DE SUCESSO!`);
    process.exit(0);
  }
}

runE2EDiagnosticSuite().catch((err) => {
  console.error('Falha fatal na execução da suíte E2E:', err);
  process.exit(1);
});
