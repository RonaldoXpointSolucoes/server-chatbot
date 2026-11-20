import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_REMOTE_ADMIN_EMAIL,
  LEGACY_GLOBAL_ALLOWED_EMAILS_KEY,
  LEGACY_VERIFIED_GOOGLE_EMAIL_KEY,
  isRemoteAccessEnabledForCompany,
  resolveRemoteAccessEnabled,
  getScopedAllowedEmailsStorageKey,
  getScopedVerifiedEmailStorageKey,
  readScopedAllowedGoogleEmails,
  writeScopedAllowedGoogleEmails,
  readScopedVerifiedGoogleEmail,
  writeScopedVerifiedGoogleEmail,
  clearLegacyGlobalRemoteStorage,
  clearScopedRemoteStorageForTenant,
  filterRecordsByTenant,
  isContactOwnedByTenant,
  parseAllowedEmailsInput,
} from './remoteAccess.mjs';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dump: () => Object.fromEntries(map.entries()),
  };
}

test('isRemoteAccessEnabledForCompany aplica bloqueio estrito por padrão (default-deny)', () => {
  assert.equal(isRemoteAccessEnabledForCompany(null), false);
  assert.equal(isRemoteAccessEnabledForCompany(undefined), false);
  assert.equal(isRemoteAccessEnabledForCompany({ id: '9057ca36-0b29-4fe5-89fb-be5e13387030', name: 'Burguer Plus' }), false);
  assert.equal(
    isRemoteAccessEnabledForCompany({
      id: '9057ca36-0b29-4fe5-89fb-be5e13387030',
      name: 'Burguer Plus',
      settings: { remote_access_enabled: false },
    }),
    false
  );
  assert.equal(
    isRemoteAccessEnabledForCompany({
      id: '9057ca36-0b29-4fe5-89fb-be5e13387030',
      name: 'Burguer Plus',
      settings: { remote_access_enabled: 'true' },
    }),
    false
  );
  assert.equal(
    isRemoteAccessEnabledForCompany({
      id: '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21',
      name: 'X-Point Soluções',
      settings: { remote_access_enabled: true },
    }),
    true
  );
});

test('resolveRemoteAccessEnabled nunca vaza habilitação da X-Point Soluções para a Burguer Plus via fallback', () => {
  const xpoint = {
    id: '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21',
    name: 'X-Point Soluções',
    settings: { remote_access_enabled: true },
  };
  const burguerHydratedOnly = {
    id: '9057ca36-0b29-4fe5-89fb-be5e13387030',
    name: 'Burguer Plus',
  };

  // Fallback pertence a outra empresa: deve retornar false
  assert.equal(resolveRemoteAccessEnabled(burguerHydratedOnly, xpoint), false);

  // Mesmo tenant no fallback quando primary ainda não carregou settings: pode usar
  assert.equal(
    resolveRemoteAccessEnabled({ id: xpoint.id, name: xpoint.name }, xpoint),
    true
  );

  // Quando primary já tem settings explícito false, prevalece sobre qualquer fallback
  assert.equal(
    resolveRemoteAccessEnabled({ ...xpoint, settings: { remote_access_enabled: false } }, xpoint),
    false
  );
});

test('chaves de armazenamento de e-mails liberados e sessão Google são estritamente isoladas por tenant', () => {
  const tenantXPoint = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
  const tenantBurguer = '9057ca36-0b29-4fe5-89fb-be5e13387030';

  assert.equal(getScopedAllowedEmailsStorageKey(null), null);
  assert.equal(getScopedAllowedEmailsStorageKey('undefined'), null);
  assert.equal(getScopedVerifiedEmailStorageKey(''), null);

  assert.notEqual(
    getScopedAllowedEmailsStorageKey(tenantXPoint),
    getScopedAllowedEmailsStorageKey(tenantBurguer)
  );
  assert.notEqual(
    getScopedVerifiedEmailStorageKey(tenantXPoint),
    getScopedVerifiedEmailStorageKey(tenantBurguer)
  );

  const storage = createMemoryStorage({
    [LEGACY_GLOBAL_ALLOWED_EMAILS_KEY]: JSON.stringify(['intruso@burguerplus.com']),
    [LEGACY_VERIFIED_GOOGLE_EMAIL_KEY]: 'intruso@burguerplus.com',
  });

  // Leitura com tenant nunca herda a chave global legada
  const xpointInitial = readScopedAllowedGoogleEmails(storage, tenantXPoint);
  assert.deepEqual(xpointInitial, [DEFAULT_REMOTE_ADMIN_EMAIL]);
  assert.equal(readScopedVerifiedGoogleEmail(storage, tenantXPoint), null);

  // Salvar na X-Point não vaza para Burguer Plus
  const savedXPoint = writeScopedAllowedGoogleEmails(storage, tenantXPoint, [
    'Suporte@XPointSolucoes.com.br',
    'invalid-email',
  ]);
  assert.deepEqual(savedXPoint, [DEFAULT_REMOTE_ADMIN_EMAIL, 'suporte@xpointsolucoes.com.br']);
  assert.deepEqual(readScopedAllowedGoogleEmails(storage, tenantBurguer), [DEFAULT_REMOTE_ADMIN_EMAIL]);

  writeScopedVerifiedGoogleEmail(storage, tenantXPoint, 'Suporte@XPointSolucoes.com.br');
  assert.equal(readScopedVerifiedGoogleEmail(storage, tenantXPoint), 'suporte@xpointsolucoes.com.br');
  assert.equal(readScopedVerifiedGoogleEmail(storage, tenantBurguer), null);

  // Limpeza global e por tenant remove corretamente
  clearLegacyGlobalRemoteStorage(storage);
  assert.equal(storage.getItem(LEGACY_GLOBAL_ALLOWED_EMAILS_KEY), null);
  assert.equal(storage.getItem(LEGACY_VERIFIED_GOOGLE_EMAIL_KEY), null);

  clearScopedRemoteStorageForTenant(storage, tenantXPoint);
  assert.deepEqual(readScopedAllowedGoogleEmails(storage, tenantXPoint), [DEFAULT_REMOTE_ADMIN_EMAIL]);
  assert.equal(readScopedVerifiedGoogleEmail(storage, tenantXPoint), null);
});

test('filterRecordsByTenant e isContactOwnedByTenant garantem isolamento da lista de clientes por empresa', () => {
  const xpointId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
  const burguerId = '9057ca36-0b29-4fe5-89fb-be5e13387030';

  const mixed = [
    { id: 'c1', tenant_id: xpointId, name: 'Cliente XPoint 1' },
    { id: 'c2', tenant_id: burguerId, name: 'Cliente Burguer 1' },
    { id: 'c3', name: 'Registro legado já filtrado pela query' },
  ];

  const scopedToXPoint = filterRecordsByTenant(mixed, xpointId);
  assert.deepEqual(
    scopedToXPoint.map((r) => r.id),
    ['c1', 'c3']
  );

  assert.equal(isContactOwnedByTenant(mixed[0], xpointId), true);
  assert.equal(isContactOwnedByTenant(mixed[1], xpointId), false);
  assert.equal(isContactOwnedByTenant(null, xpointId), false);
});

test('parseAllowedEmailsInput higieniza lista separada por vírgula ou quebra de linha', () => {
  const parsed = parseAllowedEmailsInput(' A@gmail.com, b@xpoint.com.br\nA@gmail.com ; invalido ');
  assert.deepEqual(parsed, ['a@gmail.com', 'b@xpoint.com.br']);
});
