import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haveTenantFieldsChanged,
  haveInstanceVisualFieldsChanged,
  haveInstanceListsChanged,
  shouldFetchTenantOnAuthEvent,
  shouldResetModalForm,
  shouldHydrateTenantForm,
  mergeLeadRealtimeSafely
} from './realtimeEditStability.mjs';

test('haveTenantFieldsChanged ignora nova referência de objeto com mesmos valores ou ordem diferente em settings', () => {
  const prev = {
    id: 't1',
    name: 'Burguer Plus',
    email: 'a@b.com',
    status: 'active',
    plan_id: 'pro',
    global_ai_enabled: true,
    evolution_api_instance: 'inst-1',
    settings: { nome_ia: 'Luna', nested: { a: 1, b: 2 } },
    updated_at: '2026-11-24T01:00:00Z'
  };
  const nextSameWithDiffOrderAndTs = {
    id: 't1',
    name: 'Burguer Plus',
    email: 'a@b.com',
    status: 'active',
    plan_id: 'pro',
    global_ai_enabled: true,
    evolution_api_instance: 'inst-1',
    settings: { nested: { b: 2, a: 1 }, nome_ia: 'Luna' },
    updated_at: '2026-11-24T02:00:00Z'
  };

  assert.equal(haveTenantFieldsChanged(prev, nextSameWithDiffOrderAndTs), false);
  assert.equal(haveTenantFieldsChanged(prev, { ...nextSameWithDiffOrderAndTs, name: 'Outra' }), true);
  assert.equal(
    haveTenantFieldsChanged(prev, {
      ...nextSameWithDiffOrderAndTs,
      settings: { nome_ia: 'Luna 2', nested: { a: 1, b: 2 } }
    }),
    true
  );
  assert.equal(haveTenantFieldsChanged(null, prev), true);
});

test('haveInstanceVisualFieldsChanged ignora batimentos cardíacos sem REPLICA IDENTITY FULL quando cache confere', () => {
  const cached = {
    id: 'inst-1',
    display_name: 'FoodNext',
    status: 'connected',
    color: '#10b981',
    phone_number: '5511947758860',
    api_key: 'k1',
    ticket_mode: false,
    hide_ticket_modal: false,
    settings: { bot_active: true, bot_delay: 5 }
  };

  // Supabase realtime UPDATE onde payload.old contém apenas { id }
  const heartbeatUpdate = haveInstanceVisualFieldsChanged({
    eventType: 'UPDATE',
    oldRecord: { id: 'inst-1' },
    newRecord: {
      ...cached,
      last_heartbeat_at: '2026-11-24T02:30:17Z',
      updated_at: '2026-11-24T02:30:17Z',
      settings: { bot_delay: 5, bot_active: true }
    },
    cachedRecord: cached
  });
  assert.equal(heartbeatUpdate, false);

  // Mudança real de status deve retornar true imediatamente
  assert.equal(
    haveInstanceVisualFieldsChanged({
      eventType: 'UPDATE',
      oldRecord: { id: 'inst-1' },
      newRecord: { ...cached, status: 'offline' },
      cachedRecord: cached
    }),
    true
  );

  // Mudança em settings (ex: bot_active) deve retornar true
  assert.equal(
    haveInstanceVisualFieldsChanged({
      eventType: 'UPDATE',
      oldRecord: { id: 'inst-1' },
      newRecord: { ...cached, settings: { bot_active: false, bot_delay: 5 } },
      cachedRecord: cached
    }),
    true
  );

  // Sem cache e sem colunas em oldRecord -> sincroniza por segurança
  assert.equal(
    haveInstanceVisualFieldsChanged({
      eventType: 'UPDATE',
      oldRecord: { id: 'inst-1' },
      newRecord: { ...cached },
      cachedRecord: null
    }),
    true
  );

  assert.equal(haveInstanceVisualFieldsChanged({ eventType: 'INSERT', newRecord: cached }), true);
});

test('haveInstanceListsChanged detecta lista estruturalmente idêntica', () => {
  const a = [{ id: '1', display_name: 'FoodNext', status: 'connected', color: '#00a884', settings: { bot_active: true } }];
  const b = [{ id: '1', display_name: 'FoodNext', status: 'connected', color: '#00a884', settings: { bot_active: true } }];
  assert.equal(haveInstanceListsChanged(a, b), false);
  assert.equal(haveInstanceListsChanged(a, [{ ...b[0], status: 'offline' }]), true);
});

test('shouldFetchTenantOnAuthEvent evita reload em TOKEN_REFRESHED e SIGNED_IN redundante ao voltar foco', () => {
  assert.deepEqual(
    shouldFetchTenantOnAuthEvent({
      event: 'TOKEN_REFRESHED',
      storedTenantId: 't1',
      currentStoreTenantId: 't1',
      hasCompaniesLoaded: true
    }),
    { refetchTenant: false, refetchCompanies: false }
  );

  // SIGNED_IN disparado no recovery de foco quando tenant já está hidratado
  assert.deepEqual(
    shouldFetchTenantOnAuthEvent({
      event: 'SIGNED_IN',
      storedTenantId: 't1',
      currentStoreTenantId: 't1',
      hasCompaniesLoaded: true
    }),
    { refetchTenant: false, refetchCompanies: false }
  );

  // SIGNED_IN quando store ainda não carregou tenant
  assert.deepEqual(
    shouldFetchTenantOnAuthEvent({
      event: 'SIGNED_IN',
      storedTenantId: 't1',
      currentStoreTenantId: undefined,
      hasCompaniesLoaded: false
    }),
    { refetchTenant: true, refetchCompanies: true }
  );
});

test('shouldResetModalForm só reinicializa ao abrir ou trocar de registro alvo (nunca por nova mensagem no chat)', () => {
  assert.equal(shouldResetModalForm({ wasOpen: false, isOpen: false, prevTargetKey: 'c1', nextTargetKey: 'c1' }), false);
  assert.equal(shouldResetModalForm({ wasOpen: false, isOpen: true, prevTargetKey: null, nextTargetKey: 'c1' }), true);
  // Nova mensagem chegou atualizando objeto contactData do mesmo c1 -> NÃO resetar!
  assert.equal(shouldResetModalForm({ wasOpen: true, isOpen: true, prevTargetKey: 'c1', nextTargetKey: 'c1' }), false);
  // Novo contato sem ID ({} recriado) continua sendo mesmo alvo '__new__' -> NÃO resetar!
  assert.equal(shouldResetModalForm({ wasOpen: true, isOpen: true, prevTargetKey: '__new__', nextTargetKey: '__new__' }), false);
  // Trocou de c1 para c2 com modal aberto -> reinicializa para c2
  assert.equal(shouldResetModalForm({ wasOpen: true, isOpen: true, prevTargetKey: 'c1', nextTargetKey: 'c2' }), true);
});

test('shouldHydrateTenantForm não sobrescreve formulário alterado pelo usuário quando tenantInfo atualiza', () => {
  const tenant = { id: 't1', settings: { nome_ia: 'Luna' } };
  // Carga inicial -> hidrata
  assert.equal(
    shouldHydrateTenantForm({ prevHydratedTenantId: null, nextTenant: tenant, isDirty: false }),
    true
  );
  // Mesma empresa já hidratada e usuário digitando -> NÃO sobrescreve!
  assert.equal(
    shouldHydrateTenantForm({ prevHydratedTenantId: 't1', nextTenant: { ...tenant }, isDirty: true }),
    false
  );
  // Mesma empresa já hidratada e sem dirty flag -> evita reset desnecessário
  assert.equal(
    shouldHydrateTenantForm({ prevHydratedTenantId: 't1', nextTenant: { ...tenant }, isDirty: false }),
    false
  );
  // Troca de empresa -> hidrata nova empresa mesmo se estava editando outra antes
  assert.equal(
    shouldHydrateTenantForm({ prevHydratedTenantId: 't1', nextTenant: { id: 't2', settings: {} }, isDirty: true }),
    true
  );
});

test('mergeLeadRealtimeSafely preserva campo editado localmente contra eco desatualizado', () => {
  const current = {
    id: 'lead-1',
    title: 'Titulo sendo digitado agora',
    notes: 'Texto em edição',
    estimated_revenue: 500,
    status: 'analysis',
    position: 1000,
    history: [{ at: '1' }]
  };
  const staleEcho = {
    id: 'lead-1',
    title: 'Tit',
    notes: 'Texto antigo',
    estimated_revenue: 0,
    status: 'development',
    position: 2000,
    history: [{ at: '1' }, { at: '2' }]
  };

  const merged = mergeLeadRealtimeSafely({
    currentSelected: current,
    incomingLead: staleEcho,
    isProtectedEditActive: true,
    dirtyFields: new Set(['title', 'notes', 'estimated_revenue'])
  });

  assert.equal(merged.title, 'Titulo sendo digitado agora');
  assert.equal(merged.notes, 'Texto em edição');
  assert.equal(merged.estimated_revenue, 500);
  // Campos não editados localmente (ex: coluna movida ou timeline) recebem atualização realtime
  assert.equal(merged.status, 'development');
  assert.equal(merged.history.length, 2);
});
