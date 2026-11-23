import vm from 'node:vm';

/**
 * Substitui placeholders {{chave}} ou {chave} por valores das variáveis do fluxo.
 */
export function interpolateFlowVars(text, variables = {}) {
    if (text === undefined || text === null) return '';
    let result = String(text);
    const vars = variables && typeof variables === 'object' ? variables : {};
    for (const [k, v] of Object.entries(vars)) {
        const val = v !== undefined && v !== null ? String(v) : '';
        const escapedKey = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'gi'), val);
        result = result.replace(new RegExp(`\\{${escapedKey}\\}`, 'gi'), val);
    }
    return result;
}

/**
 * Avalia uma única expressão condicional de forma case-insensitive e tolerante a tipos.
 */
export function evaluateConditionExpression(actualValue, operator = 'equal', targetValue = '') {
    const actual = actualValue !== undefined && actualValue !== null ? String(actualValue).trim() : '';
    const target = targetValue !== undefined && targetValue !== null ? String(targetValue).trim() : '';
    const op = String(operator || 'equal').trim().toLowerCase();

    switch (op) {
        case 'equal':
        case 'equals':
        case '=':
        case '==':
        case 'is':
            return actual.toLowerCase() === target.toLowerCase();
        case 'not_equal':
        case 'is_not':
        case '≠':
        case '!=':
        case '<>':
            return actual.toLowerCase() !== target.toLowerCase();
        case 'contains':
        case 'contem':
        case 'contém':
            return target.length > 0 && actual.toLowerCase().includes(target.toLowerCase());
        case 'not_contains':
        case 'nao_contem':
            return !target.length || !actual.toLowerCase().includes(target.toLowerCase());
        case 'starts_with':
            return actual.toLowerCase().startsWith(target.toLowerCase());
        case 'ends_with':
            return actual.toLowerCase().endsWith(target.toLowerCase());
        case 'greater':
        case '>': {
            const aNum = Number(actual.replace(',', '.'));
            const tNum = Number(target.replace(',', '.'));
            return actual !== '' && target !== '' && !Number.isNaN(aNum) && !Number.isNaN(tNum) && aNum > tNum;
        }
        case 'less':
        case '<': {
            const aNum = Number(actual.replace(',', '.'));
            const tNum = Number(target.replace(',', '.'));
            return actual !== '' && target !== '' && !Number.isNaN(aNum) && !Number.isNaN(tNum) && aNum < tNum;
        }
        case 'exists':
        case 'is_set':
        case 'not_empty':
            return actual.length > 0;
        case 'is_empty':
        case 'not_exists':
        case 'empty':
            return actual.length === 0;
        case 'regex':
            try {
                return new RegExp(target, 'i').test(actual);
            } catch {
                return false;
            }
        default:
            return actual.toLowerCase() === target.toLowerCase();
    }
}

/**
 * Avalia um bloco de condição completo suportando lista moderna block.items[] e fallback legado.
 * Retorna os sourceHandle IDs candidatos na ordem de prioridade.
 */
export function evaluateConditionBlock(block = {}, variables = {}) {
    const vars = variables && typeof variables === 'object' ? variables : {};
    const items = Array.isArray(block.items) ? block.items : [];

    if (items.length > 0) {
        for (let idx = 0; idx < items.length; idx++) {
            const item = items[idx] || {};
            const varName = item.varName || item.variable || block.variable || '';
            const actualVal = varName ? vars[varName] : '';
            const resolvedTarget = interpolateFlowVars(item.value ?? '', vars);
            const passed = evaluateConditionExpression(actualVal, item.operator || 'equal', resolvedTarget);
            if (passed) {
                const handleIds = [];
                if (item.id) handleIds.push(item.id);
                if (block.id) handleIds.push(`${block.id}-cond-${idx}`);
                handleIds.push('true');
                return { matched: true, item, itemIndex: idx, handleIds };
            }
        }
        return {
            matched: false,
            item: null,
            itemIndex: -1,
            handleIds: [block.id ? `${block.id}-else` : null, 'false'].filter(Boolean),
        };
    }

    const legacyVar = block.variable || '';
    const actualVal = legacyVar ? vars[legacyVar] : '';
    const resolvedTarget = interpolateFlowVars(block.value ?? '', vars);
    const passed = evaluateConditionExpression(actualVal, block.operator || 'equal', resolvedTarget);

    if (passed) {
        return {
            matched: true,
            item: { id: 'true', varName: legacyVar, operator: block.operator, value: resolvedTarget },
            itemIndex: 0,
            handleIds: ['true', block.id ? `${block.id}-cond-0` : null].filter(Boolean),
        };
    }
    return {
        matched: false,
        item: null,
        itemIndex: -1,
        handleIds: ['false', block.id ? `${block.id}-else` : null].filter(Boolean),
    };
}

function normalizeChoiceText(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

/**
 * Localiza o índice (0-based) da opção escolhida via número (1-based) ou texto aproximado.
 * Retorna -1 quando a entrada não corresponde a nenhuma opção válida.
 */
export function resolveMatchedOptionIndex(textMessage, options = []) {
    if (!Array.isArray(options) || options.length === 0) return -1;
    const raw = String(textMessage || '').trim();
    if (!raw) return -1;

    // 1. Correspondência numérica (ex: "1", "2.", "1)", "2 - Suporte")
    const leadingNumMatch = raw.match(/^(\d+)(?:[\s.)-]|$)/);
    if (leadingNumMatch) {
        const idx = parseInt(leadingNumMatch[1], 10) - 1;
        if (idx >= 0 && idx < options.length) return idx;
    }

    // 2. Correspondência textual exata ou aproximada normalizada (sem acento / caixa)
    const normalizedInput = normalizeChoiceText(raw);
    if (!normalizedInput) return -1;

    const labels = options.map((opt, idx) =>
        normalizeChoiceText(typeof opt === 'string' ? opt : opt?.label || opt?.title || `Opcao ${idx + 1}`)
    );

    const exactIdx = labels.findIndex((lbl) => lbl === normalizedInput);
    if (exactIdx !== -1) return exactIdx;

    if (normalizedInput.length >= 2) {
        const startsIdx = labels.findIndex((lbl) => lbl.startsWith(normalizedInput));
        if (startsIdx !== -1) return startsIdx;

        const includesIdx = labels.findIndex((lbl) => lbl.includes(normalizedInput));
        if (includesIdx !== -1) return includesIdx;
    }

    return -1;
}

/**
 * Lista de sourceHandle IDs candidatos para uma opção escolhida em buttons/poll/pic_choice.
 */
export function buildChoiceHandleCandidates(blockId, optionIdx, optionItem) {
    const candidates = [];
    if (optionItem && typeof optionItem === 'object' && optionItem.id) {
        candidates.push(String(optionItem.id));
    }
    if (blockId) {
        candidates.push(`${blockId}-opt-${optionIdx}`);
        candidates.push(`${blockId}-${optionIdx}`);
    }
    return candidates;
}

function parseStrictDate(rawText) {
    const clean = String(rawText || '').trim();
    // DD/MM/YYYY or DD-MM-YYYY
    const brMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (brMatch) {
        const day = Number(brMatch[1]);
        const month = Number(brMatch[2]);
        const year = Number(brMatch[3]);
        const dt = new Date(year, month - 1, day);
        if (dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day) {
            return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
        }
        return null;
    }
    // YYYY-MM-DD
    const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);
        const dt = new Date(year, month - 1, day);
        if (dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return null;
    }
    return null;
}

/**
 * Valida e normaliza a resposta recebida de acordo com o tipo de bloco de entrada.
 */
export function validateAndFormatBlockInput(block = {}, incoming = {}) {
    const type = block.flowType;
    const text = incoming.textMessage !== undefined && incoming.textMessage !== null ? String(incoming.textMessage).trim() : '';
    const mediaUrl = incoming.mediaUrl ? String(incoming.mediaUrl).trim() : '';
    const shouldValidate = block.validate !== false;

    switch (type) {
        case 'text_input': {
            const val = text || mediaUrl;
            if (!val) {
                return { valid: false, value: '', errorMessage: 'Por favor, digite uma resposta de texto para continuar.' };
            }
            return { valid: true, value: val };
        }
        case 'number_input': {
            const normalized = text.replace(/\s+/g, '').replace(',', '.');
            const parsed = Number(normalized);
            if (shouldValidate && (!normalized || Number.isNaN(parsed))) {
                return { valid: false, value: '', errorMessage: 'Por favor, digite apenas um número válido (ex: 10 ou 25.50).' };
            }
            return { valid: true, value: normalized && !Number.isNaN(parsed) ? String(parsed) : text };
        }
        case 'email_input': {
            const candidate = text.toLowerCase();
            if (shouldValidate && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(candidate)) {
                return { valid: false, value: '', errorMessage: 'Por favor, digite um e-mail válido (ex: nome@empresa.com).' };
            }
            return { valid: true, value: candidate };
        }
        case 'phone_input': {
            const digits = text.replace(/\D/g, '');
            if (shouldValidate && (digits.length < 8 || digits.length > 15)) {
                return { valid: false, value: '', errorMessage: 'Por favor, digite um telefone válido com DDD (ex: 11 99999-9999).' };
            }
            return { valid: true, value: digits || text };
        }
        case 'website_input': {
            const candidate = text.trim();
            if (shouldValidate && (!candidate.includes('.') || /\s/.test(candidate))) {
                return { valid: false, value: '', errorMessage: 'Por favor, digite um endereço de site válido (ex: https://seusite.com.br).' };
            }
            const formatted = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
            return { valid: true, value: formatted };
        }
        case 'date_input': {
            const parsed = parseStrictDate(text);
            if (shouldValidate && !parsed) {
                return { valid: false, value: '', errorMessage: 'Por favor, informe uma data válida no formato DD/MM/AAAA (ex: 25/12/2026).' };
            }
            return { valid: true, value: parsed || text };
        }
        case 'rating': {
            const maxStars = Number(block.maxRating || 5) || 5;
            const starCount = (text.match(/⭐|★/g) || []).length;
            const num = starCount > 0 ? starCount : Number(text);
            if (!Number.isInteger(num) || num < 1 || num > maxStars) {
                return { valid: false, value: '', errorMessage: `Por favor, responda com uma nota numérica de 1 a ${maxStars}.` };
            }
            return { valid: true, value: String(num) };
        }
        case 'file_input': {
            if (mediaUrl) {
                return { valid: true, value: mediaUrl };
            }
            if (/^https?:\/\/\S+$/i.test(text)) {
                return { valid: true, value: text };
            }
            return { valid: false, value: '', errorMessage: 'Por favor, envie o arquivo, foto, áudio ou documento anexado aqui no chat.' };
        }
        case 'buttons':
        case 'poll':
        case 'pic_choice': {
            const options = Array.isArray(block.options) ? block.options : [];
            if (options.length === 0) {
                if (!text && !mediaUrl) {
                    return { valid: false, value: '', matchedIndex: -1, errorMessage: 'Por favor, envie uma resposta para continuar.' };
                }
                return { valid: true, value: text || mediaUrl, matchedIndex: 0 };
            }
            const matchedIndex = resolveMatchedOptionIndex(text, options);
            if (matchedIndex === -1) {
                return {
                    valid: false,
                    value: '',
                    matchedIndex: -1,
                    errorMessage: 'Opção não reconhecida. Por favor, responda apenas com o número ou o nome exato de uma das opções listadas.'
                };
            }
            const optObj = options[matchedIndex];
            const label = typeof optObj === 'string' ? optObj : optObj?.label || optObj?.title || String(matchedIndex + 1);
            return { valid: true, value: label, matchedIndex, optionItem: optObj };
        }
        default:
            return { valid: true, value: text || mediaUrl };
    }
}

/**
 * Verifica se um fluxo está autorizado a disparar para a instância WhatsApp atual.
 * Fluxos sem __META__.allowedInstanceIds (ou array vazio) permanecem liberados para todas as caixas do tenant.
 */
export function isFlowAllowedForInstance(flow, instanceId) {
    if (!flow || !instanceId) return true;
    const rules = Array.isArray(flow.trigger_rules) ? flow.trigger_rules : [];
    const meta = rules.find((r) => r && (r.type === '__META__' || r.keyword === '__META__'));
    if (!meta || !Array.isArray(meta.allowedInstanceIds) || meta.allowedInstanceIds.length === 0) {
        return true;
    }
    return meta.allowedInstanceIds.includes(instanceId);
}

/**
 * Infere tipo de envio Baileys e mimetype a partir da extensão da URL.
 */
export function inferMediaMimeAndType(url, fallbackCategory = 'embed') {
    const cleanPath = String(url || '').split('?')[0].split('#')[0].toLowerCase();
    const extMatch = cleanPath.match(/\.([a-z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : '';

    const map = {
        pdf: { mediaKind: 'document', mimetype: 'application/pdf', fileName: 'documento.pdf' },
        doc: { mediaKind: 'document', mimetype: 'application/msword', fileName: 'documento.doc' },
        docx: { mediaKind: 'document', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileName: 'documento.docx' },
        xls: { mediaKind: 'document', mimetype: 'application/vnd.ms-excel', fileName: 'planilha.xls' },
        xlsx: { mediaKind: 'document', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: 'planilha.xlsx' },
        csv: { mediaKind: 'document', mimetype: 'text/csv', fileName: 'dados.csv' },
        txt: { mediaKind: 'document', mimetype: 'text/plain', fileName: 'arquivo.txt' },
        png: { mediaKind: 'image', mimetype: 'image/png', fileName: 'imagem.png' },
        jpg: { mediaKind: 'image', mimetype: 'image/jpeg', fileName: 'imagem.jpg' },
        jpeg: { mediaKind: 'image', mimetype: 'image/jpeg', fileName: 'imagem.jpg' },
        webp: { mediaKind: 'image', mimetype: 'image/webp', fileName: 'imagem.webp' },
        mp4: { mediaKind: 'video', mimetype: 'video/mp4', fileName: 'video.mp4' },
        mp3: { mediaKind: 'audio', mimetype: 'audio/mpeg', fileName: 'audio.mp3' },
        ogg: { mediaKind: 'audio', mimetype: 'audio/ogg; codecs=opus', fileName: 'audio.ogg' },
        opus: { mediaKind: 'audio', mimetype: 'audio/ogg; codecs=opus', fileName: 'audio.opus' },
        wav: { mediaKind: 'audio', mimetype: 'audio/wav', fileName: 'audio.wav' },
        m4a: { mediaKind: 'audio', mimetype: 'audio/mp4', fileName: 'audio.m4a' },
    };

    if (ext && map[ext]) return map[ext];
    if (fallbackCategory === 'audio') return { mediaKind: 'audio', mimetype: 'audio/mpeg', fileName: 'audio.mp3' };
    if (fallbackCategory === 'image') return { mediaKind: 'image', mimetype: 'image/jpeg', fileName: 'imagem.jpg' };
    if (fallbackCategory === 'video') return { mediaKind: 'video', mimetype: 'video/mp4', fileName: 'video.mp4' };
    return { mediaKind: 'document', mimetype: 'application/octet-stream', fileName: 'arquivo' };
}

/**
 * Monta URL interpolada, headers e fetchOptions garantindo que GET/HEAD nunca enviem body.
 */
export function buildWebhookFetchOptions(block = {}, variables = {}, extraMeta = {}) {
    const rawUrl = block.url || block.text || '';
    const url = interpolateFlowVars(rawUrl, variables).trim();
    const method = String(block.method || 'POST').trim().toUpperCase();

    let headers = { 'Content-Type': 'application/json' };
    if (block.headers) {
        if (typeof block.headers === 'object' && !Array.isArray(block.headers)) {
            for (const [hk, hv] of Object.entries(block.headers)) {
                headers[hk] = interpolateFlowVars(hv, variables);
            }
        } else if (typeof block.headers === 'string' && block.headers.trim()) {
            try {
                const parsedHeaders = JSON.parse(interpolateFlowVars(block.headers, variables));
                if (parsedHeaders && typeof parsedHeaders === 'object') {
                    headers = { ...headers, ...parsedHeaders };
                }
            } catch {
                // Ignora header JSON malformado sem abortar chamada
            }
        }
    }

    const fetchOptions = { method, headers };

    if (method !== 'GET' && method !== 'HEAD') {
        if (typeof block.body === 'string' && block.body.trim()) {
            const interpolatedBody = interpolateFlowVars(block.body, variables);
            try {
                fetchOptions.body = JSON.stringify(JSON.parse(interpolatedBody));
            } catch {
                fetchOptions.body = interpolatedBody;
            }
        } else if (block.body && typeof block.body === 'object') {
            fetchOptions.body = JSON.stringify(block.body);
        } else {
            fetchOptions.body = JSON.stringify({
                ...extraMeta,
                variables,
            });
        }
    }

    return {
        url,
        fetchOptions,
        responsePath: block.response_path ? String(block.response_path).trim() : '',
    };
}

/**
 * Extrai campo aninhado via notação ponto (ex: "data.cliente.nome").
 */
export function extractJsonPath(data, path) {
    if (!path || data === undefined || data === null) return data;
    const parts = String(path).split('.').map((p) => p.trim()).filter(Boolean);
    let current = data;
    for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
    }
    return current;
}

/**
 * Executa código JavaScript em sandbox node:vm com timeout rígido para impedir travamentos ou loops infinitos.
 */
export function executeSandboxedScript(code, inputVars = {}, timeoutMs = 150) {
    const safeCode = String(code || '').trim();
    const clonedVars = JSON.parse(JSON.stringify(inputVars && typeof inputVars === 'object' ? inputVars : {}));
    if (!safeCode) {
        return { success: true, variables: clonedVars, logs: [] };
    }

    const logs = [];
    const sandbox = {
        variables: clonedVars,
        setVar: (key, val) => {
            if (key) clonedVars[String(key)] = val;
        },
        getVar: (key) => clonedVars[String(key)],
        console: {
            log: (...args) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
        },
        JSON,
        Math,
        Date,
        Number,
        String,
        Boolean,
        Array,
        Object,
    };

    try {
        const wrapped = `(function() {\n${safeCode}\n})();`;
        vm.runInNewContext(wrapped, sandbox, { timeout: timeoutMs });
        return { success: true, variables: clonedVars, logs };
    } catch (err) {
        return {
            success: false,
            variables: clonedVars,
            logs,
            error: err?.message || 'Erro ao executar Script',
        };
    }
}

/**
 * Sorteia ramificação do Teste A/B respeitando splitA (0-100) e devolve os sourceHandles candidatos.
 */
export function resolveAbTestBranch(block = {}) {
    const rawPct = block.splitA ?? block.percentageA ?? 50;
    const pct = Math.max(0, Math.min(100, Number.isFinite(Number(rawPct)) ? Number(rawPct) : 50));
    const isA = Math.random() * 100 < pct;
    const variant = isA ? 'a' : 'b';
    const handleIds = isA
        ? [block.id ? `${block.id}-a` : null, 'a', block.id ? `${block.id}-opt-0` : null].filter(Boolean)
        : [block.id ? `${block.id}-b` : null, 'b', block.id ? `${block.id}-opt-1` : null].filter(Boolean);
    return { variant, splitA: pct, handleIds };
}

/**
 * Cria guarda anti-loop para um tick de execução sem pausas:
 * impede que o mesmo bloco seja visitado em ciclo no mesmo processamento síncrono.
 */
export function createTickLoopGuard(maxConsecutiveBlocks = 30, maxSameBlockRepeats = 2) {
    let steps = 0;
    const visitCounts = new Map();

    return {
        recordVisit(groupId, blockIndex) {
            steps += 1;
            const key = `${groupId}:${blockIndex}`;
            const nextCount = (visitCounts.get(key) || 0) + 1;
            visitCounts.set(key, nextCount);

            if (nextCount > maxSameBlockRepeats) {
                return {
                    aborted: true,
                    reason: `Loop detectado no bloco ${key} (${nextCount} visitas consecutivas sem pausa)`,
                    steps,
                };
            }
            if (steps > maxConsecutiveBlocks) {
                return {
                    aborted: true,
                    reason: `Limite máximo de ${maxConsecutiveBlocks} passos consecutivos atingido sem entrada do usuário`,
                    steps,
                };
            }
            return { aborted: false, steps, keyCount: nextCount };
        },
        getSteps() {
            return steps;
        },
    };
}
