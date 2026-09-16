import { monitorEventLoopDelay } from 'perf_hooks';
import sessionManager from '../session-manager/index.js';

// Monitor nativo de Event Loop do Node.js (resolução de 10ms)
let eldMonitor = null;
try {
    eldMonitor = monitorEventLoopDelay({ resolution: 10 });
    eldMonitor.enable();
} catch (e) {
    console.warn('[Telemetry] monitorEventLoopDelay não disponível:', e.message);
}

// Histórico circular de snapshots e eventos (últimos 100 registros)
const MAX_HISTORY = 100;
const snapshotHistory = [];
const eventHistory = [];

// Contadores de instâncias para detecção de tempestade de reconexões
const instanceReconnectStats = new Map();

/**
 * Registra um evento de conexão/desconexão para rastreamento de reconnect storm
 */
export function recordConnectionEvent(instanceId, eventType, details = {}) {
    const now = Date.now();
    let stats = instanceReconnectStats.get(instanceId);
    if (!stats) {
        stats = {
            totalConnects: 0,
            totalDisconnects: 0,
            totalReconnects: 0,
            recentEvents: []
        };
        instanceReconnectStats.set(instanceId, stats);
    }

    if (eventType === 'connect') stats.totalConnects++;
    if (eventType === 'disconnect') stats.totalDisconnects++;
    if (eventType === 'reconnect') stats.totalReconnects++;

    // Mantém eventos do último minuto
    stats.recentEvents.push({ timestamp: now, eventType, details });
    stats.recentEvents = stats.recentEvents.filter(e => now - e.timestamp <= 60000);

    // Registra no histórico geral de eventos
    recordStructuredEvent({
        event: `BAILEYS_${eventType.toUpperCase()}`,
        instanceId,
        details
    });
}

/**
 * Registra um log estruturado sanitizado (sem tokens nem credenciais)
 */
export function recordStructuredEvent(entry) {
    const timestamp = new Date().toISOString();
    const cleanEntry = {
        timestamp,
        traceId: entry.traceId || null,
        event: entry.event || 'UNKNOWN_EVENT',
        instanceId: entry.instanceId || null,
        conversationId: entry.conversationId || null,
        direction: entry.direction || null,
        whatsappMessageId: entry.whatsappMessageId || null,
        durationMs: entry.durationMs !== undefined ? entry.durationMs : null,
        details: sanitizeDetails(entry.details)
    };

    // Buffer circular
    if (eventHistory.length >= MAX_HISTORY) {
        eventHistory.shift();
    }
    eventHistory.push(cleanEntry);

    // Emite no console com prefixo padronizado
    console.log(`[TELEMETRY] ${cleanEntry.event} | traceId=${cleanEntry.traceId || 'N/A'} | inst=${cleanEntry.instanceId || 'N/A'} | msgId=${cleanEntry.whatsappMessageId || 'N/A'} | dur=${cleanEntry.durationMs ? cleanEntry.durationMs + 'ms' : 'N/A'}`);

    return cleanEntry;
}

/**
 * Remove qualquer campo sensível de objetos de detalhes
 */
function sanitizeDetails(details) {
    if (!details || typeof details !== 'object') return details;
    const sanitized = {};
    for (const [k, v] of Object.entries(details)) {
        const lower = k.toLowerCase();
        if (lower.includes('token') || lower.includes('key') || lower.includes('secret') || lower.includes('auth') || lower.includes('pass') || lower.includes('jwt')) {
            sanitized[k] = '[REDACTED]';
        } else if (typeof v === 'object' && v !== null) {
            sanitized[k] = sanitizeDetails(v);
        } else {
            sanitized[k] = v;
        }
    }
    return sanitized;
}

/**
 * Coleta métricas completas do processo, Event Loop, instâncias e listeners Baileys
 */
export function getSystemTelemetry() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const now = Date.now();

    // Event Loop Lag (ms)
    let eventLoop = {
        minMs: 0,
        maxMs: 0,
        meanMs: 0,
        p50Ms: 0,
        p90Ms: 0,
        p95Ms: 0,
        p99Ms: 0
    };

    if (eldMonitor) {
        eventLoop = {
            minMs: Number((eldMonitor.min / 1e6).toFixed(2)),
            maxMs: Number((eldMonitor.max / 1e6).toFixed(2)),
            meanMs: Number((eldMonitor.mean / 1e6).toFixed(2)),
            p50Ms: Number((eldMonitor.percentile(50) / 1e6).toFixed(2)),
            p90Ms: Number((eldMonitor.percentile(90) / 1e6).toFixed(2)),
            p95Ms: Number((eldMonitor.percentile(95) / 1e6).toFixed(2)),
            p99Ms: Number((eldMonitor.percentile(99) / 1e6).toFixed(2))
        };
        // Reset periódico das estatísticas para capturar variações recentes
        eldMonitor.reset();
    }

    // Métricas das instâncias Baileys
    const instances = [];
    let totalListeners = 0;
    let anyReconnectStorm = false;

    if (sessionManager && sessionManager.sessions) {
        for (const [instanceId, session] of sessionManager.sessions.entries()) {
            const sock = session?.sock;
            const ev = sock?.ev;

            // Contagem segura de listeners
            let listeners = {
                'messages.upsert': 0,
                'messages.update': 0,
                'connection.update': 0,
                'creds.update': 0
            };

            if (ev && typeof ev.listenerCount === 'function') {
                listeners['messages.upsert'] = ev.listenerCount('messages.upsert') || 0;
                listeners['messages.update'] = ev.listenerCount('messages.update') || 0;
                listeners['connection.update'] = ev.listenerCount('connection.update') || 0;
                listeners['creds.update'] = ev.listenerCount('creds.update') || 0;
            }

            const instListenersCount = Object.values(listeners).reduce((a, b) => a + b, 0);
            totalListeners += instListenersCount;

            // Estatísticas de reconexão do último minuto
            const stats = instanceReconnectStats.get(instanceId);
            const eventsLastMin = stats?.recentEvents?.filter(e => now - e.timestamp <= 60000) || [];
            const reconnectsLastMin = eventsLastMin.filter(e => e.eventType === 'reconnect').length;
            const disconnectsLastMin = eventsLastMin.filter(e => e.eventType === 'disconnect').length;
            const isReconnectStorm = reconnectsLastMin >= 3;
            if (isReconnectStorm) anyReconnectStorm = true;

            instances.push({
                instanceId,
                status: session?.status || (sock?.ws?.isOpen ? 'connected' : 'disconnected'),
                wsOpen: !!sock?.ws?.isOpen,
                wsReadyState: sock?.ws?.readyState ?? null,
                listeners,
                totalListeners: instListenersCount,
                reconnectsLastMin,
                disconnectsLastMin,
                isReconnectStorm
            });
        }
    }

    // Handles e Requests ativos
    let activeHandlesCount = -1;
    let activeRequestsCount = -1;
    try {
        if (typeof process._getActiveHandles === 'function') {
            activeHandlesCount = process._getActiveHandles().length;
        }
        if (typeof process._getActiveRequests === 'function') {
            activeRequestsCount = process._getActiveRequests().length;
        }
    } catch (e) {}

    const telemetry = {
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
            rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
            heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(2)),
            heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
            externalMb: Number((mem.external / (1024 * 1024)).toFixed(2)),
            heapUtilizationPercent: Number(((mem.heapUsed / mem.heapTotal) * 100).toFixed(1))
        },
        cpu: {
            userUs: cpu.user,
            systemUs: cpu.system
        },
        eventLoop,
        process: {
            activeHandles: activeHandlesCount,
            activeRequests: activeRequestsCount
        },
        baileys: {
            activeSessionsCount: instances.length,
            totalListeners,
            anyReconnectStorm,
            instances
        }
    };

    return telemetry;
}

/**
 * Captura um snapshot completo do estado do servidor para diagnóstico de anomalias
 */
export function captureAnomalySnapshot(reason, extraMetadata = {}) {
    const telemetry = getSystemTelemetry();
    const snapshot = {
        snapshotId: `SNAP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        reason,
        timestamp: new Date().toISOString(),
        telemetry,
        recentEvents: eventHistory.slice(-30),
        extraMetadata: sanitizeDetails(extraMetadata)
    };

    if (snapshotHistory.length >= MAX_HISTORY) {
        snapshotHistory.shift();
    }
    snapshotHistory.push(snapshot);

    console.warn(`[TELEMETRY SNAPSHOT] ⚠️ Snapshot de Anomalia capturado (${snapshot.snapshotId}): Razão="${reason}" | Memória=${telemetry.memory.rssMb}MB | EventLoopP95=${telemetry.eventLoop.p95Ms}ms`);

    return snapshot;
}

/**
 * Retorna o histórico recente de snapshots de anomalia
 */
export function getSnapshotHistory() {
    return snapshotHistory;
}

/**
 * Retorna os últimos eventos registrados
 */
export function getRecentEvents(limit = 50) {
    return eventHistory.slice(-limit);
}
