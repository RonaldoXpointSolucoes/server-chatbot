import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMasterWorkspaceAdmin,
  normalizeAllowedCompanyIds,
  mergeAndSortWorkspaces,
  filterWorkspacesByQuery
} from './workspaceSwitcher.mjs';

test('isMasterWorkspaceAdmin identifica apenas Ronaldo ou sessão explícita saas_admin + admin_token', () => {
  assert.equal(isMasterWorkspaceAdmin({ email: 'Ronaldo.XpointSolucoes@gmail.com' }), true);
  assert.equal(isMasterWorkspaceAdmin({ email: 'outro@cliente.com', adminToken: 'true', saasAdmin: 'true' }), true);
  assert.equal(isMasterWorkspaceAdmin({ email: 'david@xpointsolucoes.com.br', adminToken: null, saasAdmin: null }), false);
  assert.equal(isMasterWorkspaceAdmin({ email: 'mancini@gmail.com', adminToken: 'true', saasAdmin: null }), false);
});

test('normalizeAllowedCompanyIds lê array ou JSON serializado removendo duplicidades e vazios', () => {
  assert.deepEqual(normalizeAllowedCompanyIds(['id-1', ' id-2 ', 'id-1', '']), ['id-1', 'id-2']);
  assert.deepEqual(normalizeAllowedCompanyIds('["a","b","a"]'), ['a', 'b']);
  assert.deepEqual(normalizeAllowedCompanyIds('invalido'), []);
  assert.deepEqual(normalizeAllowedCompanyIds(null), []);
});

test('mergeAndSortWorkspaces nunca deixa lista vazia quando há tenant ativo e prioriza empresa ativa, mesmo email e grupo', () => {
  const result = mergeAndSortWorkspaces({
    companies: [],
    activeTenantId: '9057ca36-0b29-4fe5-89fb-be5e13387030',
    activeCompanyFallback: { id: '9057ca36-0b29-4fe5-89fb-be5e13387030', name: 'Burguer Plus' }
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Burguer Plus');

  const sorted = mergeAndSortWorkspaces({
    companies: [
      { id: '00000000-0000-0000-0000-000000000000', name: 'Nenhuma (Sem Empresa / Standalone)', email: null },
      { id: 'other-1', name: 'Zeta Burger', email: 'zeta@x.com', economic_group_id: null },
      { id: 'group-1', name: 'Filial Centro', email: 'filial@x.com', economic_group_id: 'grp-1' },
      { id: 'xp-1', name: 'X-Point Soluções', email: 'ronaldo.xpointsolucoes@gmail.com', economic_group_id: 'grp-1' },
      { id: 'bp-1', name: 'Burguer Plus', email: 'ronaldo.xpointsolucoes@gmail.com', economic_group_id: 'grp-1' }
    ],
    activeTenantId: 'bp-1',
    userEmail: 'ronaldo.xpointsolucoes@gmail.com',
    preferredGroupId: 'grp-1'
  });

  assert.deepEqual(
    sorted.map(c => c.id),
    ['bp-1', 'xp-1', 'group-1', 'other-1'],
    'Deve excluir placeholder standalone e ordenar Ativa -> Mesmo e-mail -> Mesmo grupo -> Demais'
  );
});

test('filterWorkspacesByQuery filtra ignorando acentos, maiúsculas e busca por e-mail', () => {
  const list = [
    { id: '1', name: 'X-Point Soluções', email: 'ronaldo@xpoint.com' },
    { id: '2', name: 'Burguer Plus', email: 'ronaldo@xpoint.com' },
    { id: '3', name: 'Pizzaria Mancini', email: 'mancini@pizza.com' }
  ];
  assert.deepEqual(filterWorkspacesByQuery(list, 'solucoes').map(c => c.id), ['1']);
  assert.deepEqual(filterWorkspacesByQuery(list, 'MANCINI').map(c => c.id), ['3']);
  assert.deepEqual(filterWorkspacesByQuery(list, '').length, 3);
});
