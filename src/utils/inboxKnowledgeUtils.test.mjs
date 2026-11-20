import test from 'node:test';
import assert from 'node:assert/strict';
import {
    INBOX_ANALYSIS_STAGES,
    formatInboxCheckpointSummary,
    normalizeRunStats,
    isActiveRunStatus
} from './inboxKnowledgeUtils.mjs';

test('INBOX_ANALYSIS_STAGES covers all 10 numbered pipeline layers', () => {
    assert.equal(INBOX_ANALYSIS_STAGES.length, 10);
    assert.equal(INBOX_ANALYSIS_STAGES[0].stage, 1);
    assert.equal(INBOX_ANALYSIS_STAGES[9].stage, 10);
});

test('formatInboxCheckpointSummary formats first-time run vs subsequent incremental watermark in pt-BR', () => {
    const first = formatInboxCheckpointSummary({
        lastKnowledgeAnalyzedAt: null,
        pendingEligibleCount: 1420
    });
    assert.equal(first.hasPreviousRun, false);
    assert.match(first.headline, /Primeira análise da caixa/i);
    assert.match(first.detail, /1\.420/);
    assert.equal(first.primaryButtonLabel, 'Iniciar 1ª Análise Profunda');

    const inc = formatInboxCheckpointSummary({
        lastKnowledgeAnalyzedAt: '2026-11-19T18:30:00.000Z',
        pendingEligibleCount: 37,
        timeZone: 'America/Sao_Paulo'
    });
    assert.equal(inc.hasPreviousRun, true);
    assert.match(inc.headline, /19\/11\/2026.*15:30/);
    assert.match(inc.detail, /37 novas mensagens/i);
    assert.equal(inc.primaryButtonLabel, 'Analisar Dados Novos e Implantar na Base');
});

test('normalizeRunStats fills safe zero defaults and tracks discarded noise', () => {
    const empty = normalizeRunStats(null);
    assert.equal(empty.rawMessagesRead, 0);
    assert.equal(empty.finalChunksCount, 0);

    const filled = normalizeRunStats({
        rawMessagesRead: 1200,
        keptAuthoredMessages: 300,
        droppedProtocolNoise: 45,
        droppedLowEntropyTurns: 180,
        maskedPiiCount: 19,
        mapBatchesTotal: 3,
        mapBatchesCompleted: 3,
        postLlmRejectedItems: 4,
        finalChunksCount: 14
    });
    assert.equal(filled.totalNoiseBlocked, 45 + 180 + 4);
    assert.equal(isActiveRunStatus('synthesizing'), true);
    assert.equal(isActiveRunStatus('completed'), false);
    assert.equal(isActiveRunStatus('no_new_data'), false);
});
