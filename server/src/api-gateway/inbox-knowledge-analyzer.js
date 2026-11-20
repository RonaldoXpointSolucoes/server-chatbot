import {
    normalizeForComparison,
    sanitizeRagText,
    detectSensitiveOrNoisyPatterns,
    tokenJaccardSimilarity
} from './knowledge-curator.js';

export const ALLOWED_AUTHOR_SENDER_TYPES = new Set(['client', 'human', 'agent']);
export const MAX_MAP_BATCHES = 10;
export const MAX_DISCARDED_SAMPLES = 15;

const PHATIC_EXACT = new Set([
    'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'td bem',
    'tudo bom', 'como vai', 'ok', 'oka', 'okay', 'certo', 'beleza', 'blz',
    'show', 'show de bola', 'top', 'combinado', 'perfeito', 'entendi',
    'ta bom', 'esta bom', 'ta ok', 'obrigado', 'obrigada', 'muito obrigado',
    'muito obrigada', 'obg', 'valeu', 'vlw', 'por nada', 'disponha',
    'de nada', 'igualmente', 'amem', 'sim', 'nao', 'fechado', 'otimo',
    'uhum', 'aham', 'hm', 'hmm', 'kkk', 'kkkk', 'rs', 'rsrs', 'haha'
]);

const PROTOCOL_NOISE_PATTERNS = [
    /^(?:[\p{Extended_Pictographic}\u2600-\u27BF\uFE0F\u200D\s]+)?rea[cç][aã]o\b/iu,
    /^resolvido em lote\b/iu,
    /^✅\uFE0F?\s*resolvido por\b/iu,
    /^(?:ticket|atendimento)\s+(?:resolvido|finalizado|encerrado)\b/iu,
    /^✨\uFE0F?\s*seu pedido est[aá] sendo preparado/iu,
    /^(?:🛵|🚀)\uFE0F?\s*seu pedido saiu para entrega/iu,
    /^[\[(]?\s*(?:📸\uFE0F?\s*)?(?:imagem\s*\/\s*foto|imagem|foto|figurinha|sticker|v[ií]deo|🎥\uFE0F?\s*v[ií]deo|🎵\uFE0F?\s*[aá]udio|[aá]udio|📄\uFE0F?\s*documento|documento|📍\uFE0F?\s*localiza[cç][aã]o|👤\uFE0F?\s*contato|m[ií]dia oculta|media omitted)\s*[\])]?$/iu
];

const OPERATOR_SIGNATURE_PREFIX = /^\*[^*\n]{1,65}:\*\s*(?:\r?\n)+/;

const QUESTION_WORD_PATTERN = /\b(como|qual|quais|quanto|onde|quando|tem|aceita|faz|funciona|prazo|entrega|pix|garantia|horario|pagamento|taxa|frete|cartao)\b/i;

const MENU_FOOD_KEYWORDS = /\b(x-?bacon|x-?salada|x-?tudo|x-?burguer|hamburguer|hambúrguer|cheese|combo|lanche|pizza|refrigerante|coca|guarana|batata\s*frita|milkshake|marmita|marmitex|porcao|porção|sobremesa|esfiha|pastel|acai|açaí)\b/i;
const FEE_CONTEXT_KEYWORDS = /\b(taxa\s+de\s+entrega|frete|pedido\s+minimo|pedido\s+mínimo|troco|multa|mensalidade|setup|implantacao|implantação)\b/i;

/**
 * Calcula a janela temporal [windowStart, windowEnd] conforme watermark salvo e modo escolhido.
 */
export function computeAnalysisWindow({ mode = 'incremental', lastKnowledgeAnalyzedAt = null, nowIso = new Date().toISOString() } = {}) {
    const windowEnd = new Date(nowIso).toISOString();
    if (mode === 'full' || !lastKnowledgeAnalyzedAt) {
        return { windowStart: null, windowEnd, effectiveMode: 'full' };
    }
    const parsed = new Date(lastKnowledgeAnalyzedAt);
    if (Number.isNaN(parsed.getTime())) {
        return { windowStart: null, windowEnd, effectiveMode: 'full' };
    }
    return {
        windowStart: parsed.toISOString(),
        windowEnd,
        effectiveMode: 'incremental'
    };
}

/**
 * Camada 1: Filtra apenas mensagens de autoria real (cliente ou atendente humano) e aproveita transcrições de áudio.
 */
export function isEligibleAuthoredMessage(msg) {
    if (!msg || typeof msg !== 'object') return { eligible: false, text: '', role: null };
    const senderType = String(msg.sender_type || '').toLowerCase().trim();
    if (!ALLOWED_AUTHOR_SENDER_TYPES.has(senderType)) {
        return { eligible: false, text: '', role: null };
    }

    const role = senderType === 'client' ? 'Cliente' : 'Atendente';
    const msgType = String(msg.message_type || '').toLowerCase().trim();
    const rawTranscription = typeof msg.transcription === 'string' ? msg.transcription.trim() : '';
    const rawText = typeof msg.text_content === 'string' ? msg.text_content.trim() : '';

    let text = '';
    if (msgType === 'audio' && rawTranscription.length >= 4) {
        text = rawTranscription;
    } else {
        text = rawText || rawTranscription;
    }

    if (!text) return { eligible: false, text: '', role: null };
    return { eligible: true, text, role };
}

/**
 * Camada 2: Remove assinaturas de atendente e descarta ruídos de protocolo, reações e mídias vazias.
 */
export function cleanProtocolAndNoise(rawText = '') {
    let cleaned = String(rawText || '')
        .replace(OPERATOR_SIGNATURE_PREFIX, '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!cleaned) {
        return { keep: false, cleaned: '', reason: 'empty_after_signature_strip' };
    }
    if (!/[\p{L}\p{N}]/u.test(cleaned)) {
        return { keep: false, cleaned: '', reason: 'emoji_or_punctuation_only' };
    }
    for (const pattern of PROTOCOL_NOISE_PATTERNS) {
        if (pattern.test(cleaned)) {
            return { keep: false, cleaned: '', reason: 'protocol_or_empty_media_noise' };
        }
    }
    return { keep: true, cleaned, reason: null };
}

function isLowEntropyPhaticTurn(text = '') {
    const trimmed = String(text || '').trim();
    if (trimmed.length < 6 && !/\d/.test(trimmed)) return true;

    const norm = normalizeForComparison(trimmed);
    if (!norm) return true;
    if (PHATIC_EXACT.has(norm)) return true;

    const words = norm.split(' ').filter(Boolean);
    if (words.length <= 2 && !trimmed.includes('?') && !/\d/.test(trimmed)) {
        const allShortOrPhatic = words.every(w => PHATIC_EXACT.has(w) || w.length <= 3);
        if (allShortOrPhatic) return true;
    }
    return false;
}

/**
 * Camada 3: Agrupa por conversa, descarta turnos fáticos e elimina diálogos sem substância humana/técnica.
 */
export function groupAndFilterConversations(messages = []) {
    const seenConvIds = new Set();
    const grouped = new Map();
    let droppedLowEntropyTurns = 0;

    for (const msg of messages) {
        const convId = msg.conversation_id || msg.conversationId || 'unknown';
        seenConvIds.add(convId);
        if (isLowEntropyPhaticTurn(msg.text)) {
            droppedLowEntropyTurns++;
            continue;
        }
        if (!grouped.has(convId)) {
            grouped.set(convId, []);
        }
        grouped.get(convId).push({
            role: msg.role,
            text: msg.text,
            timestamp: msg.timestamp || ''
        });
    }

    const conversations = [];

    for (const [conversationId, turns] of grouped.entries()) {
        turns.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

        const hasSubstantiveOperatorReply = turns.some(
            t => t.role === 'Atendente' && t.text.length >= 20
        );
        const hasSubstantiveClientQuestion = turns.some(
            t => t.role === 'Cliente' && t.text.length >= 18 && (t.text.includes('?') || QUESTION_WORD_PATTERN.test(t.text))
        );

        if (!hasSubstantiveOperatorReply && !hasSubstantiveClientQuestion) {
            continue;
        }

        conversations.push({
            conversationId,
            lastTimestamp: turns[turns.length - 1]?.timestamp || '',
            turns
        });
    }

    const droppedEmptyConversations = Math.max(0, seenConvIds.size - conversations.length);

    return {
        conversations,
        stats: {
            totalConversations: seenConvIds.size,
            keptSubstantiveConversations: conversations.length,
            droppedLowEntropyTurns,
            droppedEmptyConversations
        }
    };
}

/**
 * Identifica CNPJs, chaves numéricas de 14 dígitos e e-mails corporativos repetidos pelos atendentes (>= 2 conversas)
 * para protegê-los contra mascaramento excessivo na Camada 5.
 */
export function collectRepeatedCompanyTokens(conversations = []) {
    const tokenConvSets = new Map();

    const recordToken = (convKey, token) => {
        if (!token) return;
        const clean = String(token).trim().toLowerCase();
        if (!clean) return;
        if (!tokenConvSets.has(clean)) tokenConvSets.set(clean, new Set());
        tokenConvSets.get(clean).add(convKey);
    };

    conversations.forEach((conv, idx) => {
        const convKey = conv.conversationId || `idx-${idx}`;
        for (const turn of (conv.turns || [])) {
            if (turn.role !== 'Atendente') continue;
            const text = String(turn.text || '');

            const digits14 = text.match(/\b\d{14}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g) || [];
            for (const d of digits14) {
                recordToken(convKey, d.replace(/\D/g, ''));
            }
            const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
            for (const em of emails) {
                recordToken(convKey, em);
            }
        }
    });

    const repeated = new Set();
    for (const [token, convSet] of tokenConvSets.entries()) {
        if (convSet.size >= 2) repeated.add(token);
    }
    return repeated;
}

/**
 * Camada 4: Calcula score de recorrência + densidade + recência e empacota em no máximo 10 lotes Map.
 */
export function scoreAndPackMapBatches(conversations = [], options = {}) {
    const maxBatches = options.maxBatches ?? MAX_MAP_BATCHES;
    const maxCharsPerBatch = options.maxCharsPerBatch ?? 32000;
    const maxConvsPerBatch = options.maxConvsPerBatch ?? 42;

    const patternFreq = new Map();
    let totalOperatorTurns = 0;

    for (const conv of conversations) {
        for (const turn of conv.turns) {
            if (turn.role !== 'Atendente') continue;
            totalOperatorTurns++;
            const norm = normalizeForComparison(turn.text);
            if (!norm) continue;
            patternFreq.set(norm, (patternFreq.get(norm) || 0) + 1);
        }
    }

    const deduplicatedPatternsCount = Math.max(0, totalOperatorTurns - patternFreq.size);

    const scored = conversations.map((conv, index) => {
        let freqWeight = 0;
        let operatorChars = 0;
        const operatorSignatures = [];

        for (const turn of conv.turns) {
            if (turn.role === 'Atendente') {
                operatorChars += turn.text.length;
                const norm = normalizeForComparison(turn.text);
                if (norm) {
                    operatorSignatures.push(norm);
                    freqWeight += Math.min(patternFreq.get(norm) || 1, 15);
                }
            }
        }

        const primarySig = operatorSignatures[0] || `conv-${index}`;
        const depthScore = Math.min(conv.turns.length, 10) * 2;
        const densityScore = Math.min(operatorChars / 80, 12);
        const recencyMs = conv.lastTimestamp ? Date.parse(conv.lastTimestamp) || 0 : 0;

        return {
            conv,
            primarySig,
            recencyMs,
            score: freqWeight + depthScore + densityScore
        };
    });

    // Balance diversity (cap exact same opening pattern) + high score + recency
    scored.sort((a, b) => (b.score - a.score) || (b.recencyMs - a.recencyMs));

    const maxBudgetConvs = maxBatches * maxConvsPerBatch;
    const picked = [];
    const seenSigCount = new Map();
    const deferred = [];

    for (const item of scored) {
        if (picked.length >= maxBudgetConvs) break;
        const cnt = seenSigCount.get(item.primarySig) || 0;
        if (cnt < 3) {
            picked.push(item.conv);
            seenSigCount.set(item.primarySig, cnt + 1);
        } else {
            deferred.push(item.conv);
        }
    }

    for (const extra of deferred) {
        if (picked.length >= maxBudgetConvs) break;
        picked.push(extra);
    }

    const batches = [];
    let currentBatch = [];
    let currentChars = 0;

    for (const conv of picked) {
        const formattedText = formatConversationForLlm(conv);
        const convChars = formattedText.length + 20;

        const exceedsBatch = currentBatch.length >= maxConvsPerBatch ||
            (currentBatch.length > 0 && currentChars + convChars > maxCharsPerBatch);

        if (exceedsBatch) {
            batches.push(currentBatch);
            if (batches.length >= maxBatches) {
                currentBatch = [];
                break;
            }
            currentBatch = [];
            currentChars = 0;
        }

        currentBatch.push({ ...conv, formattedText });
        currentChars += convChars;
    }

    if (currentBatch.length > 0 && batches.length < maxBatches) {
        batches.push(currentBatch);
    }

    return {
        batches,
        stats: {
            deduplicatedPatternsCount,
            selectedConversationsForLlm: batches.reduce((acc, b) => acc + b.length, 0)
        }
    };
}

function formatConversationForLlm(conv) {
    const dateTag = conv.lastTimestamp ? String(conv.lastTimestamp).slice(0, 10) : 'histórico';
    const lines = conv.turns.map(t => `${t.role}: ${t.text}`);
    return `--- Conversa (${dateTag}) ---\n${lines.join('\n')}`;
}

function buildCompanyWhitelist(companySettings = {}, repeatedCompanyTokens = new Set()) {
    const digitWhitelist = new Set();
    const textWhitelist = new Set();

    const addValue = (val) => {
        if (!val) return;
        const str = String(val).trim().toLowerCase();
        if (!str) return;
        textWhitelist.add(str);
        const digits = str.replace(/\D/g, '');
        if (digits.length >= 8) digitWhitelist.add(digits);
    };

    for (const tok of (repeatedCompanyTokens || [])) {
        addValue(tok);
    }
    if (companySettings && typeof companySettings === 'object') {
        addValue(companySettings.cnpj);
        addValue(companySettings.pix_key);
        addValue(companySettings.chave_pix);
        addValue(companySettings.zipCode);
        addValue(companySettings.cep);
        addValue(companySettings.phone);
        addValue(companySettings.whatsapp);
        addValue(companySettings.email);
    }

    let storeStreetCore = '';
    if (companySettings?.endereco) {
        const streetMatch = String(companySettings.endereco).match(/(?:rua|av\.?|avenida|travessa|alameda|estrada|rodovia)\s+([a-zA-ZÀ-ÿ0-9\s]{3,40})/i);
        if (streetMatch) {
            storeStreetCore = normalizeForComparison(streetMatch[1]).split(' ').slice(0, 3).join(' ');
        }
    }

    return { digitWhitelist, textWhitelist, storeStreetCore };
}

/**
 * Camada 5: Escudo LGPD & anonimização pré-LLM preservando dados corporativos oficiais da empresa.
 */
export function maskPiiPreservingCompanyData(text = '', companySettings = {}, repeatedCompanyTokens = new Set()) {
    let maskedText = String(text || '');
    let maskedCount = 0;
    const { digitWhitelist, textWhitelist, storeStreetCore } = buildCompanyWhitelist(companySettings, repeatedCompanyTokens);

    const isCorporateMatch = (raw) => {
        const lower = String(raw || '').trim().toLowerCase();
        if (textWhitelist.has(lower)) return true;
        const digits = lower.replace(/\D/g, '');
        return digits.length >= 8 && digitWhitelist.has(digits);
    };

    const replaceChecked = (regex, replacer) => {
        maskedText = maskedText.replace(regex, (...args) => {
            const match = args[0];
            if (isCorporateMatch(match)) return match;
            const replaced = typeof replacer === 'function' ? replacer(...args) : replacer;
            if (replaced !== match) maskedCount++;
            return replaced;
        });
    };

    // 1. Formatted CPFs
    replaceChecked(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF_PROTEGIDO]');
    // Unformatted 11-digit CPFs explicitly labeled as CPF
    replaceChecked(/\b(cpf\s*[:=]?\s*)(\d{11})\b/gi, (m, prefix, digits) => (
        digitWhitelist.has(digits) ? m : `${prefix}[CPF_PROTEGIDO]`
    ));

    // 2. Non-corporate CNPJs (formatted or 14-digit CNPJ)
    replaceChecked(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ_TERCEIRO]');
    replaceChecked(/\b\d{14}\b/g, '[DOC_TERCEIRO]');

    // 3. Personal emails
    replaceChecked(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_PROTEGIDO]');

    // 4. Client residential CEPs
    replaceChecked(/\b\d{5}-\d{3}\b/g, '[CEP_PROTEGIDO]');
    replaceChecked(/\b(cep\s*[:=]?\s*)(\d{8})\b/gi, (m, prefix, digits) => (
        digitWhitelist.has(digits) ? m : `${prefix}[CEP_PROTEGIDO]`
    ));

    // 5. Client delivery addresses (street + number / block + apt)
    maskedText = maskedText.replace(
        /\b(?:rua|av\.?|avenida|travessa|alameda|estrada|rodovia)\s+[^\n,;]{3,55}(?:,?\s*(?:n[º°]?\.?\s*)?\d{1,5})?(?:[^\n.]{0,45}?(?:bloco|torre|ap(?:to)?\.?|apartamento|casa)\s*[a-zA-Z0-9-]+)?/gi,
        (match) => {
            const normMatch = normalizeForComparison(match);
            if (storeStreetCore && normMatch.includes(storeStreetCore)) {
                return match;
            }
            maskedCount++;
            return '[ENDERECO_PROTEGIDO]';
        }
    );

    maskedText = maskedText.replace(
        /\b(?:torre\s*\d+|bloco\s*[a-z0-9]+)\s*[-,]?\s*(?:ap(?:to)?\.?|apartamento)\s*\d+\b/gi,
        () => {
            maskedCount++;
            return '[COMPLEMENTO_PROTEGIDO]';
        }
    );

    // 6. Brazilian mobile/WhatsApp personal phones
    replaceChecked(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)9\d{4}[-\s]?\d{4}\b/g, '[TELEFONE_PROTEGIDO]');
    replaceChecked(/\b55\d{10,11}\b/g, '[TELEFONE_PROTEGIDO]');

    // 7. Ephemeral order IDs
    replaceChecked(/(?:pedido\s*(?:n[º°]?\s*)?#?|n[º°]\s*#?)(\d{4,7})\b|#[0-9]{4,7}\b/gi, '[PEDIDO_ID]');

    return { maskedText, maskedCount };
}

/**
 * Extrai a seção de comportamento/tom de voz em formato enxuto (<= 900 chars) para injeção em runtime.
 */
export function extractBehaviorProfileSummary(markdown = '', maxLength = 900) {
    const text = String(markdown || '').trim();
    if (!text) return '';

    const sectionMatch = text.match(/#\s*(?:\d+\.\s*)?[^\n]*(?:Identidade|Comportamento|Tom de Voz)[^\n]*\n([\s\S]*?)(?=\n#\s+|$)/i);
    const body = (sectionMatch ? sectionMatch[1] : text).trim();
    if (!body) return '';

    if (body.length <= maxLength) return body;
    return `${body.slice(0, maxLength - 3).trim()}...`;
}

/**
 * Camadas 8 e 9: Anti-conflito ERP/RAG existente, auditoria pós-LLM anti-lixo/LGPD e coleta de amostras descartadas.
 */
export function auditAndCleanSynthesizedMarkdown({
    markdown = '',
    companySettings = {},
    existingChunks = [],
    instanceId = null
}) {
    const cleanedBase = sanitizeRagText(markdown);
    const lines = cleanedBase.split('\n');
    const hasErpMenuLink = Boolean(companySettings?.link_cardapio && String(companySettings.link_cardapio).trim());

    const compatibleChunks = (existingChunks || [])
        .filter(c => c?.metadata?.source !== 'inbox_deep_analyzer')
        .filter(c => !instanceId ? !c.instance_id : (!c.instance_id || c.instance_id === instanceId))
        .map(c => String(c.content || '').replace(/^\[[^\]]+\]\s*/, ''));

    const { digitWhitelist } = buildCompanyWhitelist(companySettings, new Set());
    const outputLines = [];
    const discardedSamples = [];
    let deduplicatedAgainstExistingRag = 0;
    let postLlmRejectedItems = 0;

    const pushDiscarded = (reason, sampleText) => {
        postLlmRejectedItems++;
        if (discardedSamples.length < MAX_DISCARDED_SAMPLES) {
            discardedSamples.push({
                reason,
                sample: String(sampleText || '').slice(0, 140)
            });
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
                outputLines.push('');
            }
            continue;
        }

        if (/^#{1,4}\s+/.test(line)) {
            outputLines.push(line);
            continue;
        }

        const plainLine = line.replace(/^[-*•]\s*/, '').trim();

        // Short / low-value item filter
        if (plainLine.length < 25) {
            pushDiscarded('Regra muito curta ou genérica (< 25 chars)', plainLine);
            continue;
        }

        // Guard against ERP menu prices leaked from chat history
        if (hasErpMenuLink && /R\$\s*\d+/i.test(plainLine) && MENU_FOOD_KEYWORDS.test(plainLine) && !FEE_CONTEXT_KEYWORDS.test(plainLine)) {
            pushDiscarded('Preço/produto de cardápio proibido (fonte oficial é o ERP Gastrofood)', plainLine);
            continue;
        }

        // Guard against residual LGPD PII or test junk (ignoring corporate whitelisted CNPJs)
        const alerts = detectSensitiveOrNoisyPatterns(plainLine);
        const criticalAlert = alerts.find(a => {
            if (a.severity !== 'critical') return false;
            if (a.type === 'lgpd') {
                const digits = plainLine.match(/\b\d{14}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g) || [];
                const onlyCorporate = digits.length > 0 &&
                    !/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(plainLine) &&
                    !/ap(?:to)?\.?\s*\d+/i.test(plainLine) &&
                    digits.every(d => digitWhitelist.has(d.replace(/\D/g, '')));
                return !onlyCorporate;
            }
            return true;
        });

        if (criticalAlert) {
            pushDiscarded(criticalAlert.description || 'Padrão LGPD ou lixo detectado', plainLine);
            continue;
        }

        // Anti-duplication against pre-existing compatible RAG chunks (>= 0.90 similarity)
        const isDuplicateInOtherDoc = compatibleChunks.some(chunkText => tokenJaccardSimilarity(plainLine, chunkText) >= 0.90);
        if (isDuplicateInOtherDoc) {
            deduplicatedAgainstExistingRag++;
            pushDiscarded('Conhecimento já existente na Base RAG (similaridade >= 90%)', plainLine);
            continue;
        }

        outputLines.push(line);
    }

    // Remove trailing headers with empty bodies
    const prunedLines = [];
    for (let i = 0; i < outputLines.length; i++) {
        const curr = outputLines[i];
        if (/^#{1,4}\s+/.test(curr)) {
            let hasContentAhead = false;
            for (let j = i + 1; j < outputLines.length; j++) {
                const nxt = outputLines[j];
                if (!nxt) continue;
                if (/^#{1,4}\s+/.test(nxt)) break;
                hasContentAhead = true;
                break;
            }
            if (!hasContentAhead) continue;
        }
        prunedLines.push(curr);
    }

    const cleanedMarkdown = sanitizeRagText(prunedLines.join('\n'));
    const behaviorProfile = extractBehaviorProfileSummary(cleanedMarkdown);

    return {
        cleanedMarkdown,
        discardedSamples,
        behaviorProfile,
        stats: {
            deduplicatedAgainstExistingRag,
            postLlmRejectedItems
        }
    };
}
