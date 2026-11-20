export const INBOX_ANALYSIS_STAGES = [
    { stage: 1, title: 'Recorte de Autoria & Canal', desc: 'Filtra somente mensagens cliente/atendente humano (ignora bot e sistema)' },
    { stage: 2, title: 'Higiene de Protocolo', desc: 'Remove assinaturas *Nome:*, reações e mídias sem conteúdo' },
    { stage: 3, title: 'Entropia & Micro-Conversas', desc: 'Descarta cumprimentos fáticos e conversas vazias' },
    { stage: 4, title: 'Deduplicação & Recorrência', desc: 'Ranqueia padrões frequentes e recentes (até 10 lotes)' },
    { stage: 5, title: 'Escudo LGPD Corporativo', desc: 'Mascara CPFs/endereços de clientes preservando dados oficiais da loja' },
    { stage: 6, title: 'Extração Semântica Map', desc: 'Gemini 2.5 Flash destila tom de voz, regras, FAQs e vendas' },
    { stage: 7, title: 'Reescrita & Síntese Reduce', desc: 'Consolida contradições e reescreve em Markdown estratégico' },
    { stage: 8, title: 'Anti-Conflito ERP & RAG', desc: 'Protege cardápio ERP e evita duplicidade com documentos existentes' },
    { stage: 9, title: 'Auditoria Pós-LLM', desc: 'Segunda barreira determinística contra lixo residual e PII' },
    { stage: 10, title: 'Merge & Vetorização 384-d', desc: 'Grava na base isolada da caixa e avança checkpoint temporal' }
];

const ACTIVE_STATUS_SET = new Set(['queued', 'collecting', 'filtering', 'synthesizing', 'vectorizing']);

export function isActiveRunStatus(status) {
    return typeof status === 'string' && ACTIVE_STATUS_SET.has(status);
}

export function formatInboxCheckpointSummary({
    lastKnowledgeAnalyzedAt = null,
    pendingEligibleCount = 0,
    timeZone = 'America/Sao_Paulo'
} = {}) {
    const safePending = Math.max(0, Number(pendingEligibleCount || 0));
    const formattedPending = safePending.toLocaleString('pt-BR');

    if (!lastKnowledgeAnalyzedAt) {
        return {
            hasPreviousRun: false,
            headline: 'Primeira análise da caixa',
            detail: `Irá minerar todo o histórico humano/cliente disponível (${formattedPending} mensagens elegíveis no banco).`,
            primaryButtonLabel: 'Iniciar 1ª Análise Profunda'
        };
    }

    const dt = new Date(lastKnowledgeAnalyzedAt);
    const validDate = !Number.isNaN(dt.getTime());
    const formattedDate = validDate
        ? new Intl.DateTimeFormat('pt-BR', {
            timeZone,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(dt).replace(', ', ' às ')
        : String(lastKnowledgeAnalyzedAt);

    return {
        hasPreviousRun: true,
        headline: `Última análise concluída em ${formattedDate}`,
        detail: safePending > 0
            ? `Próximas análises processarão apenas as ${formattedPending} novas mensagens cliente/atendente posteriores a essa data.`
            : 'Nenhuma mensagem nova cliente/atendente pendente desde a última execução.',
        primaryButtonLabel: 'Analisar Dados Novos e Implantar na Base'
    };
}

export function normalizeRunStats(raw = null) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const droppedProtocolNoise = Number(s.droppedProtocolNoise || 0);
    const droppedLowEntropyTurns = Number(s.droppedLowEntropyTurns || 0);
    const postLlmRejectedItems = Number(s.postLlmRejectedItems || 0);

    return {
        rawMessagesRead: Number(s.rawMessagesRead || 0),
        keptAuthoredMessages: Number(s.keptAuthoredMessages || 0),
        droppedProtocolNoise,
        totalConversations: Number(s.totalConversations || 0),
        keptSubstantiveConversations: Number(s.keptSubstantiveConversations || 0),
        droppedLowEntropyTurns,
        droppedEmptyConversations: Number(s.droppedEmptyConversations || 0),
        deduplicatedPatternsCount: Number(s.deduplicatedPatternsCount || 0),
        selectedConversationsForLlm: Number(s.selectedConversationsForLlm || 0),
        maskedPiiCount: Number(s.maskedPiiCount || 0),
        mapBatchesTotal: Number(s.mapBatchesTotal || 0),
        mapBatchesCompleted: Number(s.mapBatchesCompleted || 0),
        mapExtractedFactsCount: Number(s.mapExtractedFactsCount || 0),
        deduplicatedAgainstExistingRag: Number(s.deduplicatedAgainstExistingRag || 0),
        postLlmRejectedItems,
        finalChunksCount: Number(s.finalChunksCount || 0),
        skippedDuplicateChunks: Number(s.skippedDuplicateChunks || 0),
        totalNoiseBlocked: droppedProtocolNoise + droppedLowEntropyTurns + postLlmRejectedItems
    };
}
