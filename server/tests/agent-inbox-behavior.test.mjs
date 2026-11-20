import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getInboxBehaviorProfile,
    invalidateInboxBehaviorCache,
    formatInboxBehaviorPromptSection
} from '../src/automation-worker/inbox-behavior-cache.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INST_COMERCIAL = '22222222-2222-4222-8222-222222222222';

function createBehaviorSupabaseMock(docs = []) {
    let queryCount = 0;
    const seenFilters = [];

    const supabase = {
        getQueryCount: () => queryCount,
        getSeenFilters: () => seenFilters,
        from(table) {
            const q = { filters: [] };
            const builder = {
                select() { return builder; },
                eq(c, v) { q.filters.push(['eq', c, v]); seenFilters.push([c, v]); return builder; },
                in(c, v) { q.filters.push(['in', c, v]); return builder; },
                is(c, v) { q.filters.push(['is', c, v]); seenFilters.push([c, v]); return builder; },
                or(expr) { q.filters.push(['or', expr]); seenFilters.push(['or', expr]); return builder; },
                order() { return builder; },
                limit() { return builder; },
                then(resolve, reject) {
                    queryCount++;
                    const filtered = docs.filter(d => q.filters.every(([kind, col, val]) => {
                        if (kind === 'eq') {
                            if (col === 'metadata->>source') return d?.metadata?.source === val;
                            return d[col] === val;
                        }
                        if (kind === 'in') return Array.isArray(val) && val.includes(d[col]);
                        if (kind === 'is') return d[col] === val;
                        if (kind === 'or' && String(col).includes('instance_id.eq.')) {
                            const id = String(col).split('instance_id.eq.')[1]?.split(',')[0];
                            return d.instance_id == null || d.instance_id === id;
                        }
                        return true;
                    }));
                    return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
                }
            };
            return builder;
        }
    };
    return supabase;
}

test('getInboxBehaviorProfile prioritizes inbox-specific playbook over global and truncates <= 1000 chars', async () => {
    invalidateInboxBehaviorCache(TENANT_ID);
    const longBehavior = 'A'.repeat(1150);
    const supabase = createBehaviorSupabaseMock([
        {
            id: 'd-global',
            tenant_id: TENANT_ID,
            instance_id: null,
            status: 'ready',
            metadata: { source: 'inbox_deep_analyzer', behavior_profile: 'Comportamento Global Genérico' },
            created_at: '2026-11-19T12:00:00Z'
        },
        {
            id: 'd-inbox',
            tenant_id: TENANT_ID,
            instance_id: INST_COMERCIAL,
            status: 'ready',
            metadata: { source: 'inbox_deep_analyzer', behavior_profile: longBehavior },
            created_at: '2026-11-19T11:00:00Z'
        }
    ]);

    const profile = await getInboxBehaviorProfile({ supabase, tenantId: TENANT_ID, instanceId: INST_COMERCIAL });
    assert.ok(profile && profile.length <= 1000);
    assert.ok(profile.startsWith('AAAA'));

    const section = formatInboxBehaviorPromptSection(profile);
    assert.match(section, /### PLAYBOOK DE COMPORTAMENTO E TOM DE VOZ DESTA CAIXA ###/);
});

test('getInboxBehaviorProfile safely handles non-UUID simulator without sending invalid UUID string to SQL', async () => {
    invalidateInboxBehaviorCache(TENANT_ID);
    const supabase = createBehaviorSupabaseMock([
        {
            id: 'd-global',
            tenant_id: TENANT_ID,
            instance_id: null,
            status: 'ready',
            metadata: { source: 'inbox_deep_analyzer', behavior_profile: 'Tom cordial oficial global' },
            created_at: '2026-11-19T12:00:00Z'
        }
    ]);

    const profile = await getInboxBehaviorProfile({ supabase, tenantId: TENANT_ID, instanceId: 'simulador' });
    assert.equal(profile, 'Tom cordial oficial global');
    const serialized = JSON.stringify(supabase.getSeenFilters());
    assert.doesNotMatch(serialized, /simulador/, 'Non-UUID simulator must never reach SQL filter');
});

test('invalidateInboxBehaviorCache forces fresh DB fetch when document or scope changes', async () => {
    invalidateInboxBehaviorCache(TENANT_ID);
    const docs = [
        {
            id: 'd-inbox',
            tenant_id: TENANT_ID,
            instance_id: INST_COMERCIAL,
            status: 'ready',
            metadata: { source: 'inbox_deep_analyzer', behavior_profile: 'Versão 1 do tom de voz' },
            created_at: '2026-11-19T12:00:00Z'
        }
    ];
    const supabase = createBehaviorSupabaseMock(docs);

    const p1 = await getInboxBehaviorProfile({ supabase, tenantId: TENANT_ID, instanceId: INST_COMERCIAL, ttlMs: 60000 });
    assert.equal(p1, 'Versão 1 do tom de voz');
    const p2 = await getInboxBehaviorProfile({ supabase, tenantId: TENANT_ID, instanceId: INST_COMERCIAL, ttlMs: 60000 });
    assert.equal(p2, 'Versão 1 do tom de voz');
    assert.equal(supabase.getQueryCount(), 1, 'Second read inside TTL must hit RAM cache');

    docs[0].metadata.behavior_profile = 'Versão 2 atualizada em /knowledge';
    invalidateInboxBehaviorCache(TENANT_ID, INST_COMERCIAL);

    const p3 = await getInboxBehaviorProfile({ supabase, tenantId: TENANT_ID, instanceId: INST_COMERCIAL, ttlMs: 60000 });
    assert.equal(p3, 'Versão 2 atualizada em /knowledge');
    assert.equal(supabase.getQueryCount(), 2);
});
