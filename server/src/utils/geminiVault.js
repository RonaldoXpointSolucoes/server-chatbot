import crypto from 'crypto';

const VAULT_PREFIX = 'ENCv1:';
const SHIELD_TOKEN_PREFIX = 'cbshield_v1_';

// Cache em memória RAM de curta duração (60s) para evitar leituras repetitivas no banco
const tenantKeyMemoryCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

// Rate Limiter & Banimento Automático de IPs Abusivos
const ipRateWindows = new Map();
const bannedIps = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQ_PER_MIN = 20;
const BAN_DURATION_MS = 15 * 60 * 1000; // 15 minutos de bloqueio para IPs que tentarem flood/ataque

/**
 * Deriva uma chave de 256 bits (32 bytes) exclusivamente no servidor a partir do segredo privado do ambiente.
 * Mesmo que o banco de dados ou o JSON de companies.settings seja inspecionado no navegador,
 * o valor ENCv1:... é indecifrável fora do servidor Node.js.
 */
function getVaultMasterSecret() {
    const rawSecret =
        process.env.GEMINI_VAULT_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.DATABASE_URL ||
        'xpoint-chatboot-gemini-vault-fallback-secret-key-2026';
    return crypto.createHash('sha256').update(String(rawSecret)).digest();
}

export function sanitizeRawGeminiKey(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw.replace(/['"\s\r\n]+/g, '').trim();
}

export function isEncryptedGeminiKey(val) {
    return typeof val === 'string' && val.trim().startsWith(VAULT_PREFIX);
}

export function isValidPlainGeminiKey(val) {
    const clean = sanitizeRawGeminiKey(val);
    if (!clean || clean.length < 25) return false;
    if (clean.includes('SERVER_MANAGED')) return false;
    return clean.startsWith('AIza') || clean.startsWith('AQ.');
}

/**
 * Extrai metadados seguros (apenas extremidades e tamanho) para exibição visual sem jamais expor o miolo da chave.
 */
export function buildGeminiKeyMeta(plainKey) {
    const clean = sanitizeRawGeminiKey(plainKey);
    if (!isValidPlainGeminiKey(clean)) return null;
    const start = clean.slice(0, 8);
    const end = clean.slice(-5);
    return {
        configured: true,
        start,
        end,
        totalLength: clean.length,
        hiddenCount: Math.max(clean.length - (start.length + end.length), 0),
        isOfficialFormat: clean.startsWith('AIza') || clean.startsWith('AQ.'),
        encrypted: true,
        updatedAt: new Date().toISOString()
    };
}

/**
 * Criptografa uma chave Gemini em texto puro usando AES-256-GCM autenticado.
 */
export function encryptGeminiKey(plainKey) {
    const clean = sanitizeRawGeminiKey(plainKey);
    if (isEncryptedGeminiKey(clean)) return clean;
    if (!isValidPlainGeminiKey(clean)) {
        throw new Error('Chave Gemini inválida para criptografia no cofre.');
    }

    const key = getVaultMasterSecret();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${VAULT_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Descriptografa uma chave ENCv1:... em memória RAM exclusivamente no servidor.
 * Aceita também chaves legadas em texto puro para retrocompatibilidade transparente.
 */
export function decryptGeminiKey(storedValue) {
    if (!storedValue || typeof storedValue !== 'string') return '';
    const trimmed = storedValue.trim();

    if (!isEncryptedGeminiKey(trimmed)) {
        const clean = sanitizeRawGeminiKey(trimmed);
        return isValidPlainGeminiKey(clean) ? clean : '';
    }

    try {
        const payload = trimmed.slice(VAULT_PREFIX.length);
        const [ivB64, tagB64, dataB64] = payload.split(':');
        if (!ivB64 || !tagB64 || !dataB64) return '';

        const key = getVaultMasterSecret();
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(tagB64, 'base64');
        const encrypted = Buffer.from(dataB64, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        return isValidPlainGeminiKey(decrypted) ? decrypted : '';
    } catch (err) {
        console.warn('[GeminiVault] Falha ao descriptografar chave do cofre:', err.message);
        return '';
    }
}

/**
 * Limpa o cache em memória de um tenant quando a chave é alterada no cofre.
 */
export function invalidateTenantGeminiKeyCache(tenantId) {
    if (tenantId) {
        tenantKeyMemoryCache.delete(tenantId);
    } else {
        tenantKeyMemoryCache.clear();
    }
}

/**
 * Resolve a chave Gemini descriptografada na seguinte ordem de prioridade:
 * 1. customKey explícita (se enviada em teste de conexão ou ENCv1)
 * 2. Chave do tenant no cofre Supabase (companies.settings.gemini_api_key descriptografada em RAM)
 * 3. Chave global de ambiente do servidor (process.env.GEMINI_API_KEY)
 */
export async function resolveServerOrTenantGeminiKey(supabaseClient, tenantId = null, customKey = null) {
    if (customKey) {
        const resolvedCustom = decryptGeminiKey(customKey);
        if (resolvedCustom) return resolvedCustom;
    }

    if (tenantId && supabaseClient) {
        const cached = tenantKeyMemoryCache.get(tenantId);
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
            if (cached.key) return cached.key;
        } else {
            try {
                const { data: comp } = await supabaseClient
                    .from('companies')
                    .select('settings')
                    .eq('id', tenantId)
                    .maybeSingle();
                const rawStored = comp?.settings?.gemini_api_key || '';
                const decrypted = decryptGeminiKey(rawStored);
                if (decrypted) {
                    tenantKeyMemoryCache.set(tenantId, { key: decrypted, ts: Date.now() });
                    return decrypted;
                }
            } catch (_) {}
        }
    }

    const envRaw = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
    return decryptGeminiKey(envRaw);
}

/**
 * Firewall Anti-Hacker e Proteção de Orçamento para rotas de Proxy Gemini.
 * Bloqueia origens externas não autorizadas, bots automatizados, modelos caros e ataques de exaustão de cota.
 */
export function verifyGeminiProxySecurity(req, tenantId) {
    const callerIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
    const now = Date.now();

    // 1. Verificar se o IP está temporariamente banido por abuso
    const banUntil = bannedIps.get(callerIp);
    if (banUntil && now < banUntil) {
        return {
            allowed: false,
            status: 429,
            reason: 'IP temporariamente bloqueado pelo escudo Anti-Abuso devido a excesso de requisições.'
        };
    }

    // 2. Validação de Origem / Referer / Assinatura de Cliente
    const origin = String(req.headers.origin || '').toLowerCase();
    const referer = String(req.headers.referer || '').toLowerCase();
    const shieldHeader = String(req.headers['x-chatboot-shield'] || '');
    const userAgent = String(req.headers['user-agent'] || '').toLowerCase();

    const isAllowedDomain = (urlStr) =>
        urlStr.includes('chat-boot-theta.vercel.app') ||
        urlStr.includes('chat-boot-staging.vercel.app') ||
        urlStr.includes('vercel.app') ||
        urlStr.includes('xpointsolucoes.com') ||
        urlStr.includes('localhost') ||
        urlStr.includes('127.0.0.1') ||
        urlStr.includes('sslip.io');

    const hasValidOriginOrReferer = isAllowedDomain(origin) || isAllowedDomain(referer);
    const hasShieldToken = shieldHeader.startsWith(SHIELD_TOKEN_PREFIX);

    // Bloqueia ferramentas de ataque/scraping direto (curl, python-requests, postman, wget, etc.) se não tiverem o token de escudo
    const isSuspiciousBotUa = /curl|wget|python|scrapy|httpclient|postman|insomnia|go-http-client/i.test(userAgent);
    if (isSuspiciousBotUa && !hasShieldToken) {
        return {
            allowed: false,
            status: 403,
            reason: 'Acesso bloqueado pelo Firewall Anti-Bot: clientes automatizados externos não são permitidos.'
        };
    }

    if (!hasValidOriginOrReferer && !hasShieldToken) {
        return {
            allowed: false,
            status: 403,
            reason: 'Acesso negado: origem não autorizada pelo Cofre Gemini.'
        };
    }

    // 3. Rate Limiting por IP + Tenant com auto-banimento em caso de flood (> 3x o limite)
    const rateKey = `${callerIp}:${tenantId || 'anon'}`;
    const entry = ipRateWindows.get(rateKey);
    if (!entry || now - entry.start > RATE_WINDOW_MS) {
        ipRateWindows.set(rateKey, { start: now, count: 1 });
    } else {
        entry.count += 1;
        if (entry.count > MAX_REQ_PER_MIN * 3) {
            bannedIps.set(callerIp, now + BAN_DURATION_MS);
            console.warn(`[GeminiVault Firewall] IP ${callerIp} banido por 15 minutos por tentativa de flood (${entry.count} req/min).`);
        }
        if (entry.count > MAX_REQ_PER_MIN) {
            return {
                allowed: false,
                status: 429,
                reason: 'Limite de segurança de requisições por minuto atingido.'
            };
        }
    }

    return { allowed: true, callerIp };
}

/**
 * Sanitiza e limita o payload enviado ao Gemini para impedir ataques de drenagem de tokens/orçamento.
 */
export function enforceGeminiBudgetGuardrails(requestedModel, payload) {
    const cleanModel = String(requestedModel || 'gemini-2.5-flash').replace(/^models\//, '');
    // Permite exclusivamente modelos da família Flash (rápidos e econômicos); bloqueia Pro/Ultra/Expensive
    const safeModel = cleanModel.includes('flash') ? cleanModel : 'gemini-2.5-flash';

    const safePayload = { ...(payload || {}) };
    const contentsArr = Array.isArray(safePayload.contents) ? safePayload.contents : [];
    let hasInlineData = false;
    let totalTextChars = 0;
    for (const c of contentsArr) {
        if (Array.isArray(c?.parts)) {
            for (const p of c.parts) {
                if (p?.inlineData) hasInlineData = true;
                if (typeof p?.text === 'string') totalTextChars += p.text.length;
            }
        }
    }

    const serialized = JSON.stringify(contentsArr);
    const maxSerializedBytes = hasInlineData ? 15_000_000 : 180_000;
    if (totalTextChars > 150_000 || serialized.length > maxSerializedBytes) {
        throw new Error('Payload excede o limite máximo de segurança permitido pelo escudo Anti-Fraude.');
    }

    // Limita maxOutputTokens com folga para thinking tokens do gemini-2.5-flash sem permitir abuso externo
    safePayload.generationConfig = {
        ...(safePayload.generationConfig || {}),
        maxOutputTokens: Math.min(Number(safePayload.generationConfig?.maxOutputTokens) || 3072, 4096)
    };

    return { safeModel, safePayload };
}

/**
 * Redige qualquer vazamento acidental de chaves AIza... ou AQ.... em strings de erro ou logs.
 */
export function redactGeminiSecrets(text) {
    if (!text || typeof text !== 'string') return text;
    return text
        .replace(/(AIza[A-Za-z0-9_-]{20,})/g, '[GEMINI_KEY_REDACTED]')
        .replace(/(AQ\.[A-Za-z0-9_-]{20,})/g, '[GEMINI_KEY_REDACTED]');
}
