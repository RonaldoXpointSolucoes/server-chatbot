import { isValidUuid, normalizeUuidOrNull } from '../api-gateway/knowledge-curator.js';

const behaviorProfileCache = new Map();
const DEFAULT_TTL_MS = 60 * 1000;
const MAX_BEHAVIOR_CHARS = 1000;

function truncateBehaviorProfile(raw = '') {
    const clean = String(raw || '').trim();
    if (!clean) return null;
    if (clean.length <= MAX_BEHAVIOR_CHARS) return clean;
    return `${clean.slice(0, MAX_BEHAVIOR_CHARS - 3).trim()}...`;
}

/**
 * Busca o Playbook comportamental consolidado da caixa (ou fallback Global da empresa),
 * com cache em RAM de 60s invalidado sempre que um documento é editado, excluído ou re-analisado.
 */
export async function getInboxBehaviorProfile({ supabase, tenantId, instanceId = null, ttlMs = DEFAULT_TTL_MS }) {
    if (!supabase || !isValidUuid(tenantId)) return null;

    const safeInstanceId = normalizeUuidOrNull(instanceId);
    const cacheKey = `${tenantId}:${safeInstanceId || 'global'}`;
    const cached = behaviorProfileCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < ttlMs) {
        return cached.value;
    }

    let query = supabase
        .from('knowledge_documents')
        .select('id, instance_id, metadata, created_at')
        .eq('tenant_id', tenantId)
        .in('status', ['ready', 'processed'])
        .eq('metadata->>source', 'inbox_deep_analyzer');

    if (safeInstanceId) {
        query = query.or(`instance_id.is.null,instance_id.eq.${safeInstanceId}`);
    } else {
        query = query.is('instance_id', null);
    }

    const { data: docs, error } = await query
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.warn('[InboxBehaviorCache] Erro ao consultar behavior_profile:', error.message);
        return null;
    }

    const candidates = (docs || [])
        .filter(d => typeof d?.metadata?.behavior_profile === 'string' && d.metadata.behavior_profile.trim().length > 0)
        .sort((a, b) => {
            const aExact = safeInstanceId && a.instance_id === safeInstanceId ? 1 : 0;
            const bExact = safeInstanceId && b.instance_id === safeInstanceId ? 1 : 0;
            if (bExact !== aExact) return bExact - aExact;
            const aTime = String(a.metadata?.updated_at || a.created_at || '');
            const bTime = String(b.metadata?.updated_at || b.created_at || '');
            return bTime.localeCompare(aTime);
        });

    const value = truncateBehaviorProfile(candidates[0]?.metadata?.behavior_profile || '');
    behaviorProfileCache.set(cacheKey, { value, ts: Date.now() });
    return value;
}

/**
 * Invalida o cache comportamental do tenant (ou apenas de uma caixa específica se necessário).
 */
export function invalidateInboxBehaviorCache(tenantId, instanceId = null) {
    if (!tenantId) return;
    if (instanceId && isValidUuid(instanceId)) {
        behaviorProfileCache.delete(`${tenantId}:${instanceId}`);
        behaviorProfileCache.delete(`${tenantId}:global`);
        return;
    }
    const prefix = `${tenantId}:`;
    for (const key of behaviorProfileCache.keys()) {
        if (key.startsWith(prefix)) {
            behaviorProfileCache.delete(key);
        }
    }
}

/**
 * Formata o bloco compacto a ser injetado no System Prompt do AutomationWorker.
 */
export function formatInboxBehaviorPromptSection(behaviorProfile) {
    if (!behaviorProfile || typeof behaviorProfile !== 'string' || !behaviorProfile.trim()) {
        return '';
    }
    return (
        `\n\n### PLAYBOOK DE COMPORTAMENTO E TOM DE VOZ DESTA CAIXA ###\n` +
        `Adapte sua postura, abordagem e estilo de atendimento às diretrizes reais consolidadas para este canal:\n` +
        `${behaviorProfile.trim()}\n`
    );
}
