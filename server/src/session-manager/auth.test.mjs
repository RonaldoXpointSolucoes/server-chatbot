import assert from 'node:assert/strict';
import test from 'node:test';
import { isTransientSupabaseError } from '../supabase.js';
import * as authModule from './auth.js';

test('isTransientSupabaseError classifica timeouts em caixa alta como erro transitorio', () => {
  assert.equal(isTransientSupabaseError(new Error('INSTANCE_CONFIG_TIMEOUT')), true);
  assert.equal(isTransientSupabaseError(new Error('SUPABASE_FETCH_TIMEOUT_15000MS')), true);
  assert.equal(isTransientSupabaseError(new Error('Timeout em operação retryWithBackoff (20000ms)')), true);
});

test('createSignalKeyHandlers coalesca leituras concorrentes para evitar tempestade em lid-mapping', async () => {
  assert.equal(typeof authModule.createSignalKeyHandlers, 'function');

  let dbCalls = 0;
  let releaseQuery;
  const barrier = new Promise((resolve) => { releaseQuery = resolve; });

  const memCache = new Map();
  const fakeSupabase = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async in(_col, names) {
          dbCalls++;
          await barrier;
          return {
            data: names.map((name) => ({ key_name: name, key_data: '5511999998888' })),
            error: null
          };
        }
      };
    }
  };

  const keys = authModule.createSignalKeyHandlers({
    instanceId: 'inst-1',
    tenantId: 'tenant-1',
    memCache,
    supabaseClient: fakeSupabase,
    runWithBackoff: (fn) => fn(),
    isCircuitOpen: () => false,
    isTransientError: isTransientSupabaseError
  });

  const batch = Array.from({ length: 10 }, () => keys.get('lid-mapping', ['12345_reverse', '67890_reverse']));
  await new Promise((r) => setTimeout(r, 15));
  releaseQuery();
  const results = await Promise.all(batch);

  assert.equal(dbCalls, 1, 'Chamadas simultaneas para as mesmas chaves devem coalescer em 1 consulta');
  for (const res of results) {
    assert.equal(res['12345_reverse'], '5511999998888');
    assert.equal(res['67890_reverse'], '5511999998888');
  }
});

test('reviveAuthData preserva strings de telefone e LIDs longos sem perder precisao IEEE-754', () => {
  assert.equal(authModule.reviveAuthData('30253850630872303'), '30253850630872303');
  assert.deepEqual(authModule.reviveAuthData('{"ok":true}'), { ok: true });
});

test('createSignalKeyHandlers ativa cooldown e silencia console.warn em timeout transitorio do DB', async () => {
  assert.equal(typeof authModule.createSignalKeyHandlers, 'function');

  let dbCalls = 0;
  const warnings = [];
  const infos = [];
  const memCache = new Map();

  const fakeSupabase = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async in() {
          dbCalls++;
          throw new Error('Timeout em operação retryWithBackoff (20000ms)');
        }
      };
    }
  };

  const keys = authModule.createSignalKeyHandlers({
    instanceId: 'inst-timeout',
    tenantId: 'tenant-1',
    memCache,
    supabaseClient: fakeSupabase,
    runWithBackoff: (fn) => fn(),
    isCircuitOpen: () => false,
    isTransientError: isTransientSupabaseError,
    logger: {
      warn: (...a) => warnings.push(a.join(' ')),
      info: (...a) => infos.push(a.join(' '))
    },
    cooldownMs: 8000
  });

  await keys.get('lid-mapping', ['999_reverse']);
  await keys.get('lid-mapping', ['888_reverse']);
  await keys.get('lid-mapping', ['777_reverse']);

  assert.equal(warnings.length, 0, 'Timeout transitorio nao deve disparar console.warn / Action Required Error');
  assert.equal(dbCalls, 1, 'Apos timeout, cooldown deve bloquear novas rajadas imediatas ao banco');
  assert.equal(infos.length, 1, 'Log informativo deve ser throttled durante a janela de cooldown');
});
