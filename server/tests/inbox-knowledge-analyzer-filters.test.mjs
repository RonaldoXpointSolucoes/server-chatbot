import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeAnalysisWindow,
    isEligibleAuthoredMessage,
    cleanProtocolAndNoise,
    groupAndFilterConversations,
    collectRepeatedCompanyTokens,
    scoreAndPackMapBatches,
    maskPiiPreservingCompanyData,
    auditAndCleanSynthesizedMarkdown,
    extractBehaviorProfileSummary
} from '../src/api-gateway/inbox-knowledge-analyzer.js';

test('computeAnalysisWindow handles first-time incremental, subsequent incremental, and forced full modes', () => {
    const nowIso = '2026-11-19T23:00:00.000Z';
    const w1 = computeAnalysisWindow({ mode: 'incremental', lastKnowledgeAnalyzedAt: null, nowIso });
    assert.deepEqual(w1, { windowStart: null, windowEnd: nowIso, effectiveMode: 'full' });

    const prevTs = '2026-11-10T10:00:00.000Z';
    const w2 = computeAnalysisWindow({ mode: 'incremental', lastKnowledgeAnalyzedAt: prevTs, nowIso });
    assert.deepEqual(w2, { windowStart: prevTs, windowEnd: nowIso, effectiveMode: 'incremental' });

    const w3 = computeAnalysisWindow({ mode: 'full', lastKnowledgeAnalyzedAt: prevTs, nowIso });
    assert.deepEqual(w3, { windowStart: null, windowEnd: nowIso, effectiveMode: 'full' });
});

test('Layer 1: isEligibleAuthoredMessage accepts client/human/agent + valid audio transcriptions and rejects bot/system/automation', () => {
    assert.equal(isEligibleAuthoredMessage({ sender_type: 'bot', text_content: 'Olá! Sou a Luna.' }).eligible, false);
    assert.equal(isEligibleAuthoredMessage({ sender_type: 'system', text_content: 'Ticket reaberto automaticamente' }).eligible, false);
    assert.equal(isEligibleAuthoredMessage({ sender_type: 'automation', text_content: 'Campanha disparo em massa' }).eligible, false);

    const c = isEligibleAuthoredMessage({ sender_type: 'client', text_content: 'Qual o prazo de entrega hoje?' });
    assert.equal(c.eligible, true);
    assert.equal(c.role, 'Cliente');

    const h = isEligibleAuthoredMessage({ sender_type: 'human', text_content: 'Nosso prazo médio é de 40 minutos.' });
    assert.equal(h.eligible, true);
    assert.equal(h.role, 'Atendente');

    const a = isEligibleAuthoredMessage({
        sender_type: 'client',
        message_type: 'audio',
        text_content: '🎵 Áudio',
        transcription: 'Quero saber se vocês aceitam vale refeição Alelo na entrega.'
    });
    assert.equal(a.eligible, true);
    assert.match(a.text, /vale refeição Alelo/i);
});

test('Layer 2: cleanProtocolAndNoise strips operator signature prefix and rejects reactions, empty placeholders, and resolution logs', () => {
    const signed = cleanProtocolAndNoise('*Ronaldo Clemente:*\n\nTrabalhamos com PIX e cartão na maquininha.');
    assert.equal(signed.keep, true);
    assert.equal(signed.cleaned, 'Trabalhamos com PIX e cartão na maquininha.');

    assert.equal(cleanProtocolAndNoise('❤️ Reação: gostei').keep, false);
    assert.equal(cleanProtocolAndNoise('📸 Imagem / Foto').keep, false);
    assert.equal(cleanProtocolAndNoise('🎵 Áudio').keep, false);
    assert.equal(cleanProtocolAndNoise('✅ Resolvido por Bruno em 18/11').keep, false);
    assert.equal(cleanProtocolAndNoise('Resolvido em lote').keep, false);
    assert.equal(cleanProtocolAndNoise('✨ SEU PEDIDO ESTÁ SENDO PREPARADO!').keep, false);
});

test('Layer 3: groupAndFilterConversations drops phatic micro-turns and conversations lacking substantive content', () => {
    const baseMsgs = [
        // Conversation 1: pure phatic noise -> dropped
        { id: '1', conversation_id: 'c1', role: 'Cliente', text: 'oi', timestamp: '2026-11-18T10:00:00Z' },
        { id: '2', conversation_id: 'c1', role: 'Atendente', text: 'Bom dia', timestamp: '2026-11-18T10:01:00Z' },
        { id: '3', conversation_id: 'c1', role: 'Cliente', text: 'ok obrigado', timestamp: '2026-11-18T10:02:00Z' },
        // Conversation 2: substantive dialogue with phatic opener stripped
        { id: '4', conversation_id: 'c2', role: 'Cliente', text: 'boa noite', timestamp: '2026-11-18T11:00:00Z' },
        { id: '5', conversation_id: 'c2', role: 'Cliente', text: 'Qual a chave pix para confirmar o pagamento adiantado?', timestamp: '2026-11-18T11:01:00Z' },
        { id: '6', conversation_id: 'c2', role: 'Atendente', text: 'No momento aceitamos PIX antecipado pelo CNPJ 59.075.836/0001-06 ou cartão na entrega.', timestamp: '2026-11-18T11:02:00Z' },
        { id: '7', conversation_id: 'c2', role: 'Cliente', text: 'blz', timestamp: '2026-11-18T11:03:00Z' }
    ];

    const res = groupAndFilterConversations(baseMsgs);
    assert.equal(res.conversations.length, 1);
    assert.equal(res.conversations[0].conversationId, 'c2');
    assert.equal(res.conversations[0].turns.length, 2, 'Phatic micro-turns "boa noite" and "blz" must be dropped');
    assert.ok(res.stats.droppedEmptyConversations >= 1);
    assert.ok(res.stats.droppedLowEntropyTurns >= 2);
});

test('Layer 4: scoreAndPackMapBatches caps high-volume history cleanly at <= 10 batches prioritizing frequency and recency', () => {
    const manyConversations = [];
    for (let i = 0; i < 460; i++) {
        const ts = new Date(Date.UTC(2026, 10, 1 + (i % 19), i % 24, 0, 0)).toISOString();
        const repeatedText = i < 200
            ? 'Aceitamos PIX e cartão de crédito ou débito diretamente na maquininha do motoboy.'
            : `Orientação exclusiva detalhada número ${i} para atendimento consultivo ao cliente final.`;
        manyConversations.push({
            conversationId: `conv-${i}`,
            lastTimestamp: ts,
            turns: [
                { role: 'Cliente', text: `Dúvida detalhada do atendimento ${i}: como funciona a cobrança e o prazo?`, timestamp: ts },
                { role: 'Atendente', text: repeatedText, timestamp: ts }
            ]
        });
    }

    const packed = scoreAndPackMapBatches(manyConversations, { maxBatches: 10, maxCharsPerBatch: 18000, maxConvsPerBatch: 40 });
    assert.ok(packed.batches.length <= 10 && packed.batches.length > 0);
    assert.ok(packed.stats.deduplicatedPatternsCount >= 100);
    assert.ok(packed.stats.selectedConversationsForLlm <= 400);
});

test('Layer 5: maskPiiPreservingCompanyData redacts client PII while preserving official company PIX/CNPJ and store address', () => {
    const companySettings = {
        cnpj: '59.075.836/0001-06',
        pix_key: '59075836000106',
        endereco: 'Rua Maria Antonia 402 - Taboao da Serra',
        zipCode: '06754-100'
    };
    const repeatedTokens = collectRepeatedCompanyTokens([
        { turns: [{ role: 'Atendente', text: 'Nossa chave Pix CNPJ é 59075836000106 em nome da Burguer Plus.' }] },
        { turns: [{ role: 'Atendente', text: 'Envie o comprovante do Pix 59075836000106 por favor.' }] },
        { turns: [{ role: 'Atendente', text: 'Chave Pix oficial: 59075836000106.' }] }
    ]);

    const dialogue = [
        'Cliente: Meu CPF é 123.456.789-00, meu telefone 5511988887777 e e-mail joao.silva@gmail.com.',
        'Cliente: Entrega no CEP 06787-500, Rua Padre Cícero, nº 145, Bloco B apto 32, pedido #13130.',
        'Atendente: Perfeito! Nossa chave Pix oficial CNPJ é 59075836000106 (ou 59.075.836/0001-06) e para retirada ficamos na Rua Maria Antonia 402.'
    ].join('\n');

    const { maskedText, maskedCount } = maskPiiPreservingCompanyData(dialogue, companySettings, repeatedTokens);
    assert.ok(maskedCount >= 5);
    assert.doesNotMatch(maskedText, /123\.456\.789-00/);
    assert.doesNotMatch(maskedText, /5511988887777/);
    assert.doesNotMatch(maskedText, /joao\.silva@gmail\.com/);
    assert.doesNotMatch(maskedText, /06787-500/);
    assert.doesNotMatch(maskedText, /Padre Cícero/);
    assert.doesNotMatch(maskedText, /#13130/);
    assert.match(maskedText, /59075836000106/, 'Company official PIX CNPJ must stay intact');
    assert.match(maskedText, /59\.075\.836\/0001-06/, 'Formatted official company CNPJ must stay intact');
    assert.match(maskedText, /Rua Maria Antonia 402/i, 'Official store address must stay intact');
});

test('Layers 8 & 9: auditAndCleanSynthesizedMarkdown strips ERP menu prices, PII leaks, and short/junk bullets while extracting behaviorProfile', () => {
    const rawMd = `# 1. Identidade, Comportamento & Tom de Voz da Caixa
- Acolha o cliente sempre pelo primeiro nome com linguagem próxima, acolhedora e objetiva.
- Evite gírias excessivas, mantendo agilidade no esclarecimento de pagamento e prazo.

# 2. Regras Operacionais, Políticas & Pagamentos
- X-Bacon Duplo artesanal custa R$ 34,90 com batata frita.
- Para pedidos com pagamento antecipado, o atendimento envia a chave PIX CNPJ oficial da loja e solicita o comprovante antes da liberação.
- ok teste rapido
- Entrega no CPF 123.456.789-00 na Rua X apto 12.

# 3. Perguntas Frequentes (FAQ) & Soluções Validadas
- Quando o cliente pergunta sobre nota fiscal paulista, orientar que ela é emitida junto ao despacho do pedido.`;

    const res = auditAndCleanSynthesizedMarkdown({
        markdown: rawMd,
        companySettings: { link_cardapio: 'https://pedir.site/burguerplus' },
        existingChunks: [],
        instanceId: '22222222-2222-4222-8222-222222222222'
    });

    assert.doesNotMatch(res.cleanedMarkdown, /X-Bacon Duplo artesanal custa R\$ 34,90/i);
    assert.doesNotMatch(res.cleanedMarkdown, /ok teste rapido/i);
    assert.doesNotMatch(res.cleanedMarkdown, /123\.456\.789-00/);
    assert.match(res.cleanedMarkdown, /chave PIX CNPJ oficial da loja/i);
    assert.match(res.cleanedMarkdown, /nota fiscal paulista/i);
    assert.ok(res.discardedSamples.length >= 2);
    assert.ok(res.behaviorProfile.length > 30 && res.behaviorProfile.length <= 950);
    assert.match(res.behaviorProfile, /primeiro nome/i);
});

test('Layer 5 redacts multi-part complement apto 32 after Bloco B and extractBehaviorProfileSummary handles ## headings safely', () => {
    const dialogue = 'Cliente: Entrega no CEP 06787-500, Rua Padre Cícero, nº 145, Bloco B apto 32 e meu outro ap 14.';
    const { maskedText } = maskPiiPreservingCompanyData(dialogue, {}, new Set());
    assert.doesNotMatch(maskedText, /apto?\s*32/i, 'apt number after Bloco B must NOT leak');
    assert.doesNotMatch(maskedText, /ap\s*14/i, 'standalone ap number must NOT leak');

    const mdSub = `## 1. Identidade, Comportamento & Tom de Voz
- Adote linguagem direta, acolhedora e objetiva.

## 2. Regras Operacionais
- Pagamentos via PIX somente no CNPJ oficial.`;
    const extracted = extractBehaviorProfileSummary(mdSub);
    assert.match(extracted, /linguagem direta/i);
    assert.doesNotMatch(extracted, /Pagamentos via PIX/i, 'Must stop before ## 2 heading');

    const mdWithoutBehavior = `# 2. Regras Operacionais
- Apenas regras financeiras aqui sem seção de comportamento.`;
    assert.equal(extractBehaviorProfileSummary(mdWithoutBehavior), '', 'Must return empty when explicit heading omits behavior section');
});
