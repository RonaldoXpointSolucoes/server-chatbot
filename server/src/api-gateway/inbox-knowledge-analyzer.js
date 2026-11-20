import { GoogleGenerativeAI } from '@google/generative-ai';
import { pipeline } from '../embeddings/pipeline.js';
import { resolveServerOrTenantGeminiKey } from '../utils/geminiVault.js';
import {
    normalizeForComparison,
    sanitizeRagText,
    detectSensitiveOrNoisyPatterns,
    tokenJaccardSimilarity,
    commitCuratedDocument,
    fetchAllTenantChunks,
    isValidUuid
} from './knowledge-curator.js';

export const ALLOWED_AUTHOR_SENDER_TYPES = new Set(['client', 'human', 'agent']);
export const ACTIVE_RUN_STATUSES = ['queued', 'collecting', 'filtering', 'synthesizing', 'vectorizing'];
export const ORPHAN_RUN_TIMEOUT_MS = 20 * 60 * 1000;
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
        addValue(companySettings.email);

        for (const rawPhone of [companySettings.phone, companySettings.whatsapp]) {
            if (!rawPhone) continue;
            addValue(rawPhone);
            const digits = String(rawPhone).replace(/\D/g, '');
            if (digits.length >= 10 && digits.length <= 11) {
                digitWhitelist.add(`55${digits}`);
            } else if (digits.startsWith('55') && digits.length >= 12) {
                digitWhitelist.add(digits.slice(2));
            }
        }
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

    // 5. Client delivery addresses (street + number / multi-part block + apt)
    maskedText = maskedText.replace(
        /\b(?:rua|av\.?|avenida|travessa|alameda|estrada|rodovia)\s+[^\n,;]{3,55}(?:,?\s*(?:n[º°]?\.?\s*)?\d{1,5})?(?:[,\s-]+(?:bloco|torre|ap(?:to)?\.?|apartamento|casa|lote|quadra|fundos|sala)\s*[a-zA-Z0-9-]+)*/gi,
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
        /\b(?:(?:torre\s*\d+|bloco\s*[a-z0-9]+)(?:[,\s-]+(?:ap(?:to)?\.?|apartamento)\s*\d+[a-z]?)?|(?:ap(?:to)?\.?|apartamento)\s*\d+[a-z]?)\b/gi,
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

    const sectionMatch = text.match(/^#{1,3}\s*(?:\d+\.\s*)?[^\n]*(?:Identidade|Comportamento|Tom de Voz)[^\n]*\r?\n([\s\S]*?)(?=\r?\n#{1,3}\s+|$)/im);
    let body = '';
    if (sectionMatch) {
        body = sectionMatch[1].trim();
    } else if (!/^#{1,3}\s+/m.test(text)) {
        body = text;
    } else {
        return '';
    }
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

// ============================================================================
// CAMADA DE COLETA KEYSET, ORQUESTRAÇÃO GEMINI MAP-REDUCE & WATERMARK ATÔMICO
// ============================================================================

let sharedTransformerPromise = null;
async function getDefaultTransformer() {
    if (!sharedTransformerPromise) {
        sharedTransformerPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true })
            .catch(err => {
                sharedTransformerPromise = null;
                throw err;
            });
    }
    return sharedTransformerPromise;
}

function normalizeCursorTimestamp(ts) {
    return String(ts || '').trim().replace(/\+00:00$/, 'Z');
}

function stripJsonCodeFences(raw = '') {
    return String(raw || '')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

async function retryWithBackoff(fn, { retries = 2, baseDelayMs = 800 } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn(attempt);
        } catch (err) {
            lastError = err;
            const msg = String(err?.message || '').toLowerCase();
            const isTransient = /429|500|502|503|504|overloaded|timeout|econnreset|fetch failed|rate/i.test(msg);
            if (!isTransient || attempt >= retries) {
                throw err;
            }
            const waitMs = baseDelayMs * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }
    throw lastError;
}

function createGeminiCallers(apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const jsonModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
        }
    });
    const textModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0.25
        }
    });

    return {
        callLlmJson: async (prompt) => {
            const result = await retryWithBackoff(() => jsonModel.generateContent(prompt));
            const raw = stripJsonCodeFences(result?.response?.text?.() || '{}');
            return JSON.parse(raw);
        },
        callLlmText: async (prompt) => {
            const result = await retryWithBackoff(() => textModel.generateContent(prompt));
            return sanitizeRagText(result?.response?.text?.() || '');
        }
    };
}

/**
 * Pagina mensagens da caixa via Keyset (timestamp ASC, id ASC) aplicando Camadas 1 e 2 em streaming.
 */
export async function collectEligibleInboxMessages({
    supabase,
    tenantId,
    instanceId,
    windowStart = null,
    windowEnd,
    pageSize = 2000,
    onProgress = null
}) {
    const seenIds = new Set();
    const eligibleMessages = [];
    const discardedSamples = [];
    let rawMessagesRead = 0;
    let droppedProtocolNoise = 0;
    let lastTs = null;
    let lastId = null;

    while (true) {
        let query = supabase
            .from('messages')
            .select('id, conversation_id, sender_type, message_type, text_content, transcription, timestamp')
            .eq('tenant_id', tenantId)
            .eq('instance_id', instanceId)
            .in('sender_type', [...ALLOWED_AUTHOR_SENDER_TYPES])
            .lte('timestamp', windowEnd)
            .order('timestamp', { ascending: true })
            .order('id', { ascending: true })
            .limit(pageSize);

        if (lastTs && lastId) {
            const safeTs = normalizeCursorTimestamp(lastTs);
            query = query.or(`timestamp.gt.${safeTs},and(timestamp.eq.${safeTs},id.gt.${lastId})`);
        } else if (windowStart) {
            query = query.gt('timestamp', windowStart);
        }

        const { data: rows, error } = await query;
        if (error) throw error;
        if (!rows || rows.length === 0) break;

        for (const row of rows) {
            if (!row || seenIds.has(row.id)) continue;
            seenIds.add(row.id);
            rawMessagesRead++;

            lastTs = row.timestamp;
            lastId = row.id;

            const layer1 = isEligibleAuthoredMessage(row);
            if (!layer1.eligible) continue;

            const layer2 = cleanProtocolAndNoise(layer1.text);
            if (!layer2.keep) {
                droppedProtocolNoise++;
                if (discardedSamples.length < 5) {
                    discardedSamples.push({
                        reason: `Ruído de protocolo (${layer2.reason})`,
                        sample: String(layer1.text).slice(0, 120)
                    });
                }
                continue;
            }

            eligibleMessages.push({
                id: row.id,
                conversation_id: row.conversation_id,
                role: layer1.role,
                text: layer2.cleaned,
                timestamp: row.timestamp
            });
        }

        if (onProgress) {
            await onProgress({ rawMessagesRead, keptAuthoredMessages: eligibleMessages.length, droppedProtocolNoise });
        }

        if (rows.length < pageSize) break;
    }

    return {
        rawMessagesRead,
        keptAuthoredMessages: eligibleMessages.length,
        droppedProtocolNoise,
        discardedSamples,
        eligibleMessages
    };
}

/**
 * Camada 6 (Map): Extrai JSON estruturado com comportamento, regras, FAQs e objeções de um lote anonimizado.
 */
export async function extractMapBatchWithGemini({
    callLlmJson,
    batch,
    inboxName,
    companyName,
    companySettings = {},
    batchIndex = 0,
    totalBatches = 1
}) {
    const batchDialogue = (batch || []).map(c => c.formattedText || '').join('\n\n');
    const truncatedDialogue = batchDialogue.length > 42000 ? batchDialogue.slice(0, 42000) : batchDialogue;
    const hasMenuErp = Boolean(companySettings?.link_cardapio);

    const prompt = `Você é um Arquiteto Sênior de Atendimento, Vendas e Curadoria de Base de Conhecimento (RAG).
Analise o lote ${batchIndex + 1}/${totalBatches} de conversas reais entre Cliente e Atendente Humano da empresa "${companyName}" na caixa de entrada "${inboxName}".

OBJETIVO:
Entender profundamente como esta caixa específica atende, qual é o comportamento/tom de voz real do atendente nesta caixa e extrair APENAS conhecimento duradouro e útil para a IA atender e vender melhor.

REGRAS CRÍTICAS DE FILTRAGEM (OBRIGATÓRIO):
1. PROIBIDO incluir saudações vazias, casos individuais pontuais ("entreguei no portão azul do cliente X"), dados pessoais (nome/CPF/endereço de cliente) ou gírias/erros ortográficos sem correção.
2. ${hasMenuErp ? 'PROIBIDO extrair nomes ou preços de pratos/produtos de cardápio (o cardápio oficial vem em tempo real do ERP).' : 'Evite listas voláteis ou preços promocionais passageiros.'}
3. PROIBIDO copiar diálogos brutos: sintetize cada insight em regra ou orientação clara em Português do Brasil.
4. Preserve apenas políticas da empresa (ex.: formas de pagamento aceitas, CNPJ/PIX oficial da loja se confirmado pelos atendentes, prazos, garantia, suporte, contorno de objeções).

RETORNE EXCLUSIVAMENTE JSON VÁLIDO NO FORMATO:
{
  "behavior_signals": ["diretrizes reais de tom de voz, postura, empatia e estilo de condução desta caixa"],
  "business_rules": ["regras operacionais, pagamentos, entrega, prazos, compatibilidades ou políticas duradouras"],
  "faq_solutions": [{"question": "pergunta generalizada do cliente", "answer": "resposta oficial reescrita de forma clara e polida"}],
  "sales_objections": ["objeção recorrente do cliente e como o atendente contornou para fechar/ajudar"],
  "rejected_items": ["exemplos breves de ruídos descartados neste lote"]
}

DIÁLOGOS ANONIMIZADOS DA CAIXA "${inboxName}":
${truncatedDialogue}`;

    const parsed = await callLlmJson(prompt);
    return {
        behavior_signals: Array.isArray(parsed?.behavior_signals) ? parsed.behavior_signals : [],
        business_rules: Array.isArray(parsed?.business_rules) ? parsed.business_rules : [],
        faq_solutions: Array.isArray(parsed?.faq_solutions) ? parsed.faq_solutions : [],
        sales_objections: Array.isArray(parsed?.sales_objections) ? parsed.sales_objections : [],
        rejected_items: Array.isArray(parsed?.rejected_items) ? parsed.rejected_items : []
    };
}

/**
 * Camada 7 (Reduce & Reescrita): Consolida todos os lotes Map em Markdown estratégico de elite (+ merge incremental).
 */
export async function reduceSynthesizedKnowledgeWithGemini({
    callLlmText,
    mapResults = [],
    existingDocMarkdown = '',
    mode = 'incremental',
    targetScope = 'inbox',
    inboxName,
    companyName,
    companySettings = {}
}) {
    const consolidated = {
        behavior_signals: [],
        business_rules: [],
        faq_solutions: [],
        sales_objections: []
    };

    for (const item of mapResults) {
        if (!item) continue;
        consolidated.behavior_signals.push(...(item.behavior_signals || []));
        consolidated.business_rules.push(...(item.business_rules || []));
        consolidated.faq_solutions.push(...(item.faq_solutions || []));
        consolidated.sales_objections.push(...(item.sales_objections || []));
    }

    const existingBlock = (mode === 'incremental' && existingDocMarkdown && existingDocMarkdown.trim().length > 20)
        ? `\nDOCUMENTO VIVO ANTERIOR DA CAIXA "${inboxName}" (MODO INCREMENTAL — PRESERVE O QUE CONTINUA VÁLIDO, EVOLUA/ATUALIZE REGRAS NOVAS SEM DUPLICAR):\n"""\n${existingDocMarkdown.slice(0, 18000)}\n"""\n`
        : '';

    const officialConfigLines = [];
    if (companySettings?.link_cardapio) officialConfigLines.push(`- Link Oficial do Cardápio (Fonte da Verdade): ${companySettings.link_cardapio}`);
    if (companySettings?.cnpj) officialConfigLines.push(`- CNPJ Oficial da Empresa: ${companySettings.cnpj}`);
    if (companySettings?.endereco) officialConfigLines.push(`- Endereço Comercial Oficial: ${companySettings.endereco}`);
    if (companySettings?.horario_funcionamento) officialConfigLines.push(`- Horário Oficial: ${companySettings.horario_funcionamento}`);

    const scopeInstruction = targetScope === 'global'
        ? `Base RAG GLOBAL de toda a empresa "${companyName}" (consolidando aprendizados reais coletados da caixa "${inboxName}" para todas as caixas da empresa)`
        : `Playbook & Base RAG definitiva da caixa de entrada "${inboxName}" da empresa "${companyName}"`;

    const prompt = `Você é um Engenheiro de Conhecimento Sênior criando a ${scopeInstruction}.
${officialConfigLines.length > 0 ? `\nCONFIGURAÇÕES OFICIAIS DA EMPRESA (SOBERANAS CONTRA CONTRADIÇÕES):\n${officialConfigLines.join('\n')}\n` : ''}
${existingBlock}
NOVOS DADOS DESTILADOS DO HISTÓRICO REAL:
${JSON.stringify(consolidated, null, 2).slice(0, 28000)}

TAREFA OBRIGATÓRIA DE TRANSFORMAÇÃO & REESCRITA:
1. Reescreva tudo com Português impecável, estratégico e direto para orientar a IA a atender e vender melhor ${targetScope === 'global' ? `globalmente em toda a empresa "${companyName}"` : `nesta caixa específica ("${inboxName}")`}.
2. Elimine contradições internas, remova qualquer dado pessoal de cliente (CPF/nome/endereço de entrega) e não invente itens ou preços de cardápio.
3. Organize EXATAMENTE nas 4 seções Markdown abaixo (use frases completas e auto-suficientes por bullet):

# 1. Identidade, Comportamento & Tom de Voz da Caixa
- (Postura, estilo de escrita, nível de formalidade, empatia e forma como esta caixa conduz o cliente)

# 2. Regras Operacionais, Políticas & Pagamentos
- (Pagamentos, PIX oficial se aplicável, prazos, garantia, condições comerciais e regras claras)

# 3. Perguntas Frequentes (FAQ) & Soluções Validadas
- (Pergunta do cliente + resposta oficial completa em cada bullet)

# 4. Playbook de Vendas & Contorno de Objeções
- (Como responder objeções, converter interessados e gerar segurança na compra)

Responda APENAS com o Markdown final limpo, sem introduções fora dos títulos.`;

    const markdown = await callLlmText(prompt);
    return {
        markdown,
        behaviorSummary: extractBehaviorProfileSummary(markdown)
    };
}

async function updateRunRecord(supabase, runId, patch) {
    const { error } = await supabase
        .from('inbox_knowledge_runs')
        .update({
            ...patch,
            updated_at: new Date().toISOString()
        })
        .eq('id', runId);
    if (error) {
        console.warn(`[InboxAnalyzer] Falha ao atualizar run ${runId}:`, error.message);
    }
}

async function loadExistingInboxLivingDoc(supabase, tenantId, instanceId, preferredDocId = null) {
    let doc = null;

    if (preferredDocId) {
        const { data: byIdDoc } = await supabase
            .from('knowledge_documents')
            .select('id, name, metadata, instance_id')
            .eq('id', preferredDocId)
            .eq('tenant_id', tenantId)
            .maybeSingle();
        if (byIdDoc) doc = byIdDoc;
    }

    if (!doc) {
        const { data: scopedDoc } = await supabase
            .from('knowledge_documents')
            .select('id, name, metadata, instance_id')
            .eq('tenant_id', tenantId)
            .eq('metadata->>source', 'inbox_deep_analyzer')
            .or(`instance_id.eq.${instanceId},metadata->>source_instance_id.eq.${instanceId}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        doc = scopedDoc || null;
    }

    if (!doc) return { doc: null, markdown: '' };

    const { data: chunks } = await supabase
        .from('knowledge_chunks')
        .select('content, chunk_index')
        .eq('document_id', doc.id)
        .eq('tenant_id', tenantId)
        .order('chunk_index', { ascending: true });

    const markdown = (chunks || [])
        .map(c => String(c.content || '').replace(/^\[[^\]]+\]\s*/g, '').trim())
        .filter(Boolean)
        .join('\n\n');

    return { doc, markdown };
}

/**
 * Executa o job em background da análise profunda da caixa e só avança o watermark se 100% concluído.
 */
export async function runInboxDeepAnalysisJob({
    supabase,
    run,
    instance,
    company,
    deps = {}
}) {
    const tenantId = run.tenant_id;
    const instanceId = run.instance_id;
    const runId = run.id;
    const windowStart = run.window_start || null;
    const windowEnd = run.window_end;
    const effectiveMode = run.mode || 'incremental';
    const targetScope = run?.stats?.targetScope === 'global' ? 'global' : 'inbox';
    const commitInstanceId = targetScope === 'global' ? null : instanceId;
    const inboxName = instance.display_name || 'Caixa';
    const companyName = company?.name || 'Empresa';
    const companySettings = company?.settings || {};

    const stats = {
        targetScope,
        rawMessagesRead: 0,
        keptAuthoredMessages: 0,
        droppedProtocolNoise: 0,
        totalConversations: 0,
        keptSubstantiveConversations: 0,
        droppedLowEntropyTurns: 0,
        droppedEmptyConversations: 0,
        deduplicatedPatternsCount: 0,
        selectedConversationsForLlm: 0,
        maskedPiiCount: 0,
        mapBatchesTotal: 0,
        mapBatchesCompleted: 0,
        mapExtractedFactsCount: 0,
        reduceSynthesizedSections: 4,
        deduplicatedAgainstExistingRag: 0,
        postLlmRejectedItems: 0,
        finalChunksCount: 0,
        skippedDuplicateChunks: 0
    };
    const discardedSamples = [];

    try {
        // Estágio 1-2: Coleta paginada + Higiene de Autoria e Protocolo
        await updateRunRecord(supabase, runId, {
            status: 'collecting',
            progress_pct: 10,
            current_stage: 1,
            current_step_label: 'Camadas 1–2: Lendo histórico cliente/atendente no banco e descartando robôs/sistema...'
        });

        const collected = await collectEligibleInboxMessages({
            supabase,
            tenantId,
            instanceId,
            windowStart,
            windowEnd,
            onProgress: async (p) => {
                stats.rawMessagesRead = p.rawMessagesRead;
                stats.keptAuthoredMessages = p.keptAuthoredMessages;
                stats.droppedProtocolNoise = p.droppedProtocolNoise;
                await updateRunRecord(supabase, runId, { stats });
            }
        });

        stats.rawMessagesRead = collected.rawMessagesRead;
        stats.keptAuthoredMessages = collected.keptAuthoredMessages;
        stats.droppedProtocolNoise = collected.droppedProtocolNoise;
        discardedSamples.push(...collected.discardedSamples);

        if (collected.keptAuthoredMessages === 0) {
            await supabase
                .from('whatsapp_instances')
                .update({
                    last_knowledge_analyzed_at: windowEnd,
                    last_knowledge_run_id: runId
                })
                .eq('id', instanceId)
                .eq('tenant_id', tenantId);

            await updateRunRecord(supabase, runId, {
                status: 'no_new_data',
                progress_pct: 100,
                current_stage: 10,
                current_step_label: 'Nenhuma mensagem nova de cliente ou atendente humano encontrada desde a última análise.',
                stats,
                discarded_samples: discardedSamples.slice(0, MAX_DISCARDED_SAMPLES),
                completed_at: new Date().toISOString()
            });
            return;
        }

        // Estágio 3-5: Entropia, Deduplicação & Escudo LGPD
        await updateRunRecord(supabase, runId, {
            status: 'filtering',
            progress_pct: 30,
            current_stage: 3,
            current_step_label: 'Camadas 3–5: Filtrando cumprimentos vazios, ranqueando recorrência e aplicando Escudo LGPD...',
            stats
        });

        const grouped = groupAndFilterConversations(collected.eligibleMessages);
        stats.totalConversations = grouped.stats.totalConversations;
        stats.keptSubstantiveConversations = grouped.stats.keptSubstantiveConversations;
        stats.droppedLowEntropyTurns = grouped.stats.droppedLowEntropyTurns;
        stats.droppedEmptyConversations = grouped.stats.droppedEmptyConversations;

        if (grouped.conversations.length === 0) {
            await supabase
                .from('whatsapp_instances')
                .update({
                    last_knowledge_analyzed_at: windowEnd,
                    last_knowledge_run_id: runId
                })
                .eq('id', instanceId)
                .eq('tenant_id', tenantId);

            await updateRunRecord(supabase, runId, {
                status: 'no_new_data',
                progress_pct: 100,
                current_stage: 10,
                current_step_label: 'As mensagens novas continham apenas cumprimentos ou confirmações curtas sem conteúdo relevante para a base.',
                stats,
                discarded_samples: discardedSamples.slice(0, MAX_DISCARDED_SAMPLES),
                completed_at: new Date().toISOString()
            });
            return;
        }

        const repeatedCompanyTokens = collectRepeatedCompanyTokens(grouped.conversations);
        const packed = scoreAndPackMapBatches(grouped.conversations);
        stats.deduplicatedPatternsCount = packed.stats.deduplicatedPatternsCount;
        stats.selectedConversationsForLlm = packed.stats.selectedConversationsForLlm;
        stats.mapBatchesTotal = packed.batches.length;

        const maskedBatches = packed.batches.map(batch =>
            batch.map(conv => {
                const { maskedText, maskedCount } = maskPiiPreservingCompanyData(
                    conv.formattedText,
                    companySettings,
                    repeatedCompanyTokens
                );
                stats.maskedPiiCount += maskedCount;
                return { ...conv, formattedText: maskedText };
            })
        );

        // Estágio 6-7: Resolver Gemini Key & Executar Map-Reduce
        const resolveApiKeyFn = deps.resolveApiKey || (() => resolveServerOrTenantGeminiKey(supabase, tenantId));
        const apiKey = await resolveApiKeyFn();
        if (!apiKey && (!deps.callLlmJson || !deps.callLlmText)) {
            throw new Error('Nenhuma chave Gemini configurada no cofre da empresa ou do servidor.');
        }

        const geminiCallers = (!deps.callLlmJson || !deps.callLlmText) ? createGeminiCallers(apiKey) : null;
        const callLlmJson = deps.callLlmJson || geminiCallers.callLlmJson;
        const callLlmText = deps.callLlmText || geminiCallers.callLlmText;

        await updateRunRecord(supabase, runId, {
            status: 'synthesizing',
            progress_pct: 45,
            current_stage: 6,
            current_step_label: `Camada 6: Analisando ${packed.batches.length} lote(s) estratégicos de diálogos com Gemini 2.5 Flash...`,
            stats
        });

        const mapResults = [];
        for (let i = 0; i < maskedBatches.length; i++) {
            const batchOut = await extractMapBatchWithGemini({
                callLlmJson,
                batch: maskedBatches[i],
                inboxName,
                companyName,
                companySettings,
                batchIndex: i,
                totalBatches: maskedBatches.length
            });
            mapResults.push(batchOut);
            stats.mapBatchesCompleted = i + 1;
            stats.mapExtractedFactsCount +=
                batchOut.behavior_signals.length +
                batchOut.business_rules.length +
                batchOut.faq_solutions.length +
                batchOut.sales_objections.length;

            for (const rej of (batchOut.rejected_items || [])) {
                if (discardedSamples.length < MAX_DISCARDED_SAMPLES) {
                    discardedSamples.push({ reason: 'Descartado na extração semântica (IA)', sample: String(rej).slice(0, 120) });
                }
            }

            const batchPct = 45 + Math.round(((i + 1) / Math.max(maskedBatches.length, 1)) * 25);
            await updateRunRecord(supabase, runId, {
                progress_pct: batchPct,
                current_stage: 6,
                current_step_label: `Camada 6: Lote ${i + 1}/${maskedBatches.length} destilado (${stats.mapExtractedFactsCount} aprendizados extraídos)...`,
                stats
            });
        }

        await updateRunRecord(supabase, runId, {
            progress_pct: 75,
            current_stage: 7,
            current_step_label: 'Camada 7: Reescrevendo, eliminando contradições e consolidando Playbook + Conhecimento...',
            stats
        });

        const { doc: existingLivingDoc, markdown: existingDocMarkdown } = await loadExistingInboxLivingDoc(
            supabase,
            tenantId,
            instanceId,
            instance?.last_knowledge_document_id || null
        );

        const synthesized = await reduceSynthesizedKnowledgeWithGemini({
            callLlmText,
            mapResults,
            existingDocMarkdown,
            mode: effectiveMode,
            targetScope,
            inboxName,
            companyName,
            companySettings
        });

        // Estágio 8-9: Auditoria anti-conflito & anti-lixo pós-LLM
        await updateRunRecord(supabase, runId, {
            progress_pct: 84,
            current_stage: 8,
            current_step_label: 'Camadas 8–9: Auditoria anti-lixo, proteção de cardápio ERP e desduplicação semântica...'
        });

        const existingTenantChunks = await fetchAllTenantChunks(supabase, tenantId, false, commitInstanceId);
        const audited = auditAndCleanSynthesizedMarkdown({
            markdown: synthesized.markdown,
            companySettings,
            existingChunks: existingTenantChunks,
            instanceId: commitInstanceId
        });

        stats.deduplicatedAgainstExistingRag = audited.stats.deduplicatedAgainstExistingRag;
        stats.postLlmRejectedItems = audited.stats.postLlmRejectedItems;
        for (const s of audited.discardedSamples) {
            if (discardedSamples.length < MAX_DISCARDED_SAMPLES) discardedSamples.push(s);
        }

        if (!audited.cleanedMarkdown || audited.cleanedMarkdown.trim().length < 20) {
            await supabase
                .from('whatsapp_instances')
                .update({
                    last_knowledge_analyzed_at: windowEnd,
                    last_knowledge_run_id: runId
                })
                .eq('id', instanceId)
                .eq('tenant_id', tenantId);

            await updateRunRecord(supabase, runId, {
                status: 'no_new_data',
                progress_pct: 100,
                current_stage: 10,
                current_step_label: 'Nenhum conhecimento líquido inédito restou após filtragem anti-lixo e proteção anti-duplicação.',
                stats,
                discarded_samples: discardedSamples.slice(0, MAX_DISCARDED_SAMPLES),
                completed_at: new Date().toISOString()
            });
            return;
        }

        // Estágio 10: Vetorização & Commit na Base RAG (Exclusivo da Caixa ou Global da Empresa)
        await updateRunRecord(supabase, runId, {
            status: 'vectorizing',
            progress_pct: 90,
            current_stage: 10,
            current_step_label: targetScope === 'global'
                ? 'Camada 10: Gerando vetores semânticos (384-d) e implantando no RAG Global da Empresa...'
                : 'Camada 10: Gerando vetores semânticos (384-d) e implantando na Base da Caixa...',
            stats
        });

        const transformer = deps.getTransformer ? await deps.getTransformer() : await getDefaultTransformer();
        const behaviorProfile = audited.behaviorProfile || synthesized.behaviorSummary;
        const docTitle = targetScope === 'global'
            ? `Playbook & Conhecimento Global — via ${inboxName}`
            : `Playbook & Conhecimento — Caixa ${inboxName}`;
        const docCategory = targetScope === 'global'
            ? `Global (${companyName})`
            : `Caixa: ${inboxName}`;

        const commitRes = await commitCuratedDocument({
            supabase,
            transformer,
            tenantId,
            agentId: null,
            instanceId: commitInstanceId,
            mode: existingLivingDoc ? 'replace' : 'create',
            targetDocumentId: existingLivingDoc?.id || null,
            title: docTitle,
            type: 'text/markdown',
            category: docCategory,
            content: audited.cleanedMarkdown,
            qualityScore: 95,
            source: 'inbox_deep_analyzer',
            behaviorProfile,
            extraMetadata: {
                inbox_name: inboxName,
                source_instance_id: instanceId,
                scope: targetScope,
                last_run_id: runId,
                last_window_end: windowEnd,
                behavior_profile: behaviorProfile
            },
            yieldMs: 0
        });

        stats.finalChunksCount = commitRes.insertedChunks;
        stats.skippedDuplicateChunks = commitRes.skippedDuplicates;

        // Somente avança watermark após commit 100% pronto!
        await supabase
            .from('whatsapp_instances')
            .update({
                last_knowledge_analyzed_at: windowEnd,
                last_knowledge_document_id: commitRes.document.id,
                last_knowledge_run_id: runId
            })
            .eq('id', instanceId)
            .eq('tenant_id', tenantId);

        if (typeof deps.invalidateCache === 'function') {
            deps.invalidateCache(tenantId, commitInstanceId === null ? undefined : instanceId);
        }

        await updateRunRecord(supabase, runId, {
            status: 'completed',
            progress_pct: 100,
            current_stage: 10,
            current_step_label: targetScope === 'global'
                ? 'Sincronização RAG concluída e aplicada globalmente para toda a empresa!'
                : 'Sincronização RAG concluída e aplicada exclusivamente nesta caixa!',
            stats,
            discarded_samples: discardedSamples.slice(0, MAX_DISCARDED_SAMPLES),
            extracted_behavior_summary: behaviorProfile,
            result_markdown: audited.cleanedMarkdown,
            document_id: commitRes.document.id,
            completed_at: new Date().toISOString()
        });
    } catch (err) {
        console.error(`[InboxAnalyzer] Falha no job ${runId}:`, err);
        await updateRunRecord(supabase, runId, {
            status: 'failed',
            error_message: err?.message || 'Erro inesperado durante a análise profunda da caixa.',
            current_step_label: `Falha na etapa atual: ${err?.message || 'Erro desconhecido'}`,
            stats,
            discarded_samples: discardedSamples.slice(0, MAX_DISCARDED_SAMPLES),
            completed_at: new Date().toISOString()
        });
    }
}

/**
 * Inicia (com lock de concorrência por caixa) uma nova análise profunda em background.
 */
export async function startInboxDeepAnalysis({
    supabase,
    tenantId,
    instanceId,
    mode = 'incremental',
    targetScope = 'inbox',
    nowIso = new Date().toISOString(),
    deps = {}
}) {
    if (!isValidUuid(tenantId) || !isValidUuid(instanceId)) {
        const err = new Error('tenantId e instanceId válidos (UUID) são obrigatórios.');
        err.statusCode = 400;
        throw err;
    }

    const { data: instance, error: instErr } = await supabase
        .from('whatsapp_instances')
        .select('id, tenant_id, display_name, status, phone_number, last_knowledge_analyzed_at, last_knowledge_document_id, last_knowledge_run_id')
        .eq('id', instanceId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

    if (instErr) throw instErr;
    if (!instance) {
        const err = new Error('Caixa de entrada não encontrada para esta empresa.');
        err.statusCode = 404;
        throw err;
    }

    const { data: existingActiveRuns } = await supabase
        .from('inbox_knowledge_runs')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('instance_id', instanceId)
        .in('status', ACTIVE_RUN_STATUSES)
        .order('created_at', { ascending: false })
        .limit(5);

    const nowMs = Date.now();
    let activeRun = null;
    for (const candidateRun of (existingActiveRuns || [])) {
        const refTs = Date.parse(candidateRun.updated_at || candidateRun.created_at || '') || 0;
        if (refTs > 0 && (nowMs - refTs) > ORPHAN_RUN_TIMEOUT_MS) {
            await updateRunRecord(supabase, candidateRun.id, {
                status: 'failed',
                error_message: 'Execução anterior expirada (reinício ou timeout do servidor).',
                completed_at: new Date().toISOString()
            });
        } else if (!activeRun) {
            activeRun = candidateRun;
        }
    }

    if (activeRun) {
        return { conflict: true, activeRun };
    }

    const { windowStart, windowEnd, effectiveMode } = computeAnalysisWindow({
        mode: mode === 'full' ? 'full' : 'incremental',
        lastKnowledgeAnalyzedAt: instance.last_knowledge_analyzed_at,
        nowIso
    });

    const { data: company } = await supabase
        .from('companies')
        .select('id, name, settings')
        .eq('id', tenantId)
        .maybeSingle();

    const safeTargetScope = targetScope === 'global' ? 'global' : 'inbox';

    const { data: run, error: insErr } = await supabase
        .from('inbox_knowledge_runs')
        .insert([{
            tenant_id: tenantId,
            instance_id: instanceId,
            status: 'queued',
            mode: effectiveMode,
            window_start: windowStart,
            window_end: windowEnd,
            progress_pct: 5,
            current_stage: 1,
            current_step_label: safeTargetScope === 'global'
                ? 'Preparando varredura do histórico para aplicação Global no RAG da empresa...'
                : 'Preparando varredura incremental do histórico da caixa...',
            stats: { targetScope: safeTargetScope }
        }])
        .select('*')
        .single();

    if (insErr) {
        if (insErr.code === '23505') {
            const { data: racedRun } = await supabase
                .from('inbox_knowledge_runs')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('instance_id', instanceId)
                .in('status', ACTIVE_RUN_STATUSES)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            return { conflict: true, activeRun: racedRun || null };
        }
        throw insErr;
    }

    const completionPromise = runInboxDeepAnalysisJob({
        supabase,
        run,
        instance,
        company,
        deps
    });

    return { ok: true, run, completionPromise };
}

/**
 * Retorna checkpoint temporal, estimativa de mensagens pendentes e histórico recente da caixa.
 */
export async function getInboxAnalysisStatus({ supabase, tenantId, instanceId }) {
    if (!isValidUuid(tenantId) || !isValidUuid(instanceId)) {
        const err = new Error('tenantId e instanceId válidos (UUID) são obrigatórios.');
        err.statusCode = 400;
        throw err;
    }

    const { data: instance, error: instErr } = await supabase
        .from('whatsapp_instances')
        .select('id, tenant_id, display_name, status, phone_number, last_knowledge_analyzed_at, last_knowledge_document_id, last_knowledge_run_id')
        .eq('id', instanceId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

    if (instErr) throw instErr;
    if (!instance) {
        const err = new Error('Caixa de entrada não encontrada para esta empresa.');
        err.statusCode = 404;
        throw err;
    }

    let pendingCountQuery = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('instance_id', instanceId)
        .in('sender_type', [...ALLOWED_AUTHOR_SENDER_TYPES]);

    if (instance.last_knowledge_analyzed_at) {
        pendingCountQuery = pendingCountQuery.gt('timestamp', instance.last_knowledge_analyzed_at);
    }

    let linkedDocQuery = null;
    if (instance.last_knowledge_document_id) {
        linkedDocQuery = supabase
            .from('knowledge_documents')
            .select('id, name, instance_id, status, metadata, created_at')
            .eq('id', instance.last_knowledge_document_id)
            .eq('tenant_id', tenantId)
            .maybeSingle();
    } else {
        linkedDocQuery = supabase
            .from('knowledge_documents')
            .select('id, name, instance_id, status, metadata, created_at')
            .eq('tenant_id', tenantId)
            .eq('metadata->>source', 'inbox_deep_analyzer')
            .or(`instance_id.eq.${instanceId},metadata->>source_instance_id.eq.${instanceId}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
    }

    const [
        { count: pendingEligibleCount },
        { data: recentRuns },
        { data: linkedDocument }
    ] = await Promise.all([
        pendingCountQuery,
        supabase
            .from('inbox_knowledge_runs')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('instance_id', instanceId)
            .order('created_at', { ascending: false })
            .limit(10),
        linkedDocQuery
    ]);

    const runsList = recentRuns || [];
    const activeRun = runsList.find(r => ACTIVE_RUN_STATUSES.includes(r.status)) || null;
    const lastCompletedRun = runsList.find(r => r.status === 'completed' || r.status === 'no_new_data') || null;

    return {
        instance,
        pendingEligibleCount: Number(pendingEligibleCount || 0),
        activeRun,
        lastCompletedRun,
        linkedDocument: linkedDocument || null,
        recentRuns: runsList
    };
}

/**
 * Consulta o detalhe ao vivo de um run garantindo isolamento de tenant.
 */
export async function getInboxAnalysisRun({ supabase, tenantId, runId }) {
    if (!isValidUuid(tenantId) || !isValidUuid(runId)) {
        const err = new Error('tenantId e runId válidos (UUID) são obrigatórios.');
        err.statusCode = 400;
        throw err;
    }

    const { data: run, error } = await supabase
        .from('inbox_knowledge_runs')
        .select('*')
        .eq('id', runId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

    if (error) throw error;
    return run || null;
}
