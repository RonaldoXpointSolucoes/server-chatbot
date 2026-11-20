import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAllowedCompanyIds,
  resolveStrictlyAuthorizedCompanyIds,
  mergeAndSortWorkspaces,
  filterWorkspacesByQuery
} from './workspaceSwitcher.mjs';

test('resolveStrictlyAuthorizedCompanyIds restringe estritamente às empresas associadas ao usuário (nunca lista todas as empresas)', () => {
  // Ronaldo associado a 2 empresas -> deve retornar apenas as 2
  assert.deepEqual(
    resolveStrictlyAuthorizedCompanyIds({
      activeTenantId: '9057ca36-0b29-4fe5-89fb-be5e13387030',
      userRole: 'admin',
      allowedFromUser: ['9057ca36-0b29-4fe5-89fb-be5e13387030', '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21'],
      userPrimaryTenantId: '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21',
      ownerCompanyIds: ['9057ca36-0b29-4fe5-89fb-be5e13387030', '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21']
    }),
    ['9057ca36-0b29-4fe5-89fb-be5e13387030', '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21']
  );

  // Agente/operador restrito não herda empresas extras fora de allowed_companies + tenant_id próprio
  assert.deepEqual(
    resolveStrictlyAuthorizedCompanyIds({
      activeTenantId: '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21',
      userRole: 'agent',
      allowedFromUser: ['8b1e427b-2321-4ea7-9d7e-90f7d5cbad21'],
      userPrimaryTenantId: '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21',
      ownerCompanyIds: ['outra-empresa-nao-permitida']
    }),
    ['8b1e427b-2321-4ea7-9d7e-90f7d5cbad21']
  );

  // Fallback para tenant ativo quando ainda não há lista explícita
  assert.deepEqual(
    resolveStrictlyAuthorizedCompanyIds({
      activeTenantId: 'comp-1',
      userRole: 'admin',
      allowedFromUser: []
    }),
    ['comp-1']
  );
});

test('normalizeAllowedCompanyIds lê array ou JSON serializado removendo duplicidades e vazios', () => {
  assert.deepEqual(normalizeAllowedCompanyIds(['id-1', ' id-2 ', 'id-1', '']), ['id-1', 'id-2']);
  assert.deepEqual(normalizeAllowedCompanyIds('["a","b","a"]'), ['a', 'b']);
  assert.deepEqual(normalizeAllowedCompanyIds('invalido'), []);
  assert.deepEqual(normalizeAllowedCompanyIds(null), []);
});

test('mergeAndSortWorkspaces nunca deixa lista vazia quando há tenant ativo e prioriza empresa ativa e mesmo email', () => {
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
      { id: 'xp-1', name: 'X-Point Soluções', email: 'ronaldo.xpointsolucoes@gmail.com' },
      { id: 'bp-1', name: 'Burguer Plus', email: 'ronaldo.xpointsolucoes@gmail.com' }
    ],
    activeTenantId: 'bp-1',
    userEmail: 'ronaldo.xpointsolucoes@gmail.com'
  });

  assert.deepEqual(sorted.map(c => c.id), ['bp-1', 'xp-1']);
});

test('filterWorkspacesByQuery filtra ignorando acentos, maiúsculas e busca por e-mail', () => {
  const list = [
    { id: '1', name: 'X-Point Soluções', email: 'ronaldo@xpoint.com' },
    { id: '2', name: 'Burguer Plus', email: 'ronaldo@xpoint.com' }
  ];
  assert.deepEqual(filterWorkspacesByQuery(list, 'solucoes').map(c => c.id), ['1']);
  assert.deepEqual(filterWorkspacesByQuery(list, 'PLUS').map(c => c.id), ['2']);
  assert.deepEqual(filterWorkspacesByQuery(list, '').length, 2);
});
