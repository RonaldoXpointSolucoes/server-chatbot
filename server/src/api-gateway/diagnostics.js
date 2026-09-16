import express from 'express';
import { getSystemTelemetry, captureAnomalySnapshot, getSnapshotHistory, getRecentEvents } from '../diagnostics/telemetry.js';

const router = express.Router();

/**
 * GET /api/v1/diagnostics/telemetry
 * Retorna telemetria em tempo real: Event Loop Lag, Memória, Processo, Instâncias Baileys e Listeners
 */
router.get('/diagnostics/telemetry', (req, res) => {
    try {
        const telemetry = getSystemTelemetry();
        res.json({ ok: true, telemetry });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/v1/diagnostics/snapshots
 * Retorna os snapshots de anomalia recentes
 */
router.get('/diagnostics/snapshots', (req, res) => {
    try {
        const snapshots = getSnapshotHistory();
        res.json({ ok: true, count: snapshots.length, snapshots });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/v1/diagnostics/snapshot
 * Dispara a captura de um snapshot de diagnóstico sob demanda
 */
router.post('/diagnostics/snapshot', (req, res) => {
    try {
        const { reason = 'MANUAL_REQUEST', metadata = {} } = req.body || {};
        const snapshot = captureAnomalySnapshot(reason, metadata);
        res.json({ ok: true, snapshot });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/v1/diagnostics/events
 * Retorna os últimos eventos estruturados de telemetria
 */
router.get('/diagnostics/events', (req, res) => {
    try {
        const limit = parseInt(req.query.limit || '50', 10);
        const events = getRecentEvents(limit);
        res.json({ ok: true, count: events.length, events });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

export default router;
