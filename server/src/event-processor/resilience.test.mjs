import assert from 'node:assert/strict';
import test from 'node:test';
import * as resilience from './resilience.js';

test('loadInstanceConfigSafe faz stale-while-revalidate e cooldown sem flood de console.warn em INSTANCE_CONFIG_TIMEOUT', async () => {
  assert.equal(typeof resilience.createInstanceConfigLoader, 'function');

  let now = 1_000_000;
  let dbCalls = 0;
  const warnings = [];
  const infos = [];

  const loader = resilience.createInstanceConfigLoader({
    nowFn: () => now,
    freshTtlMs: 60_000,
    staleTtlMs: 300_000,
    cooldownMs: 15_000,
    timeoutMs: 4500,
    staleInFlightMs: 8000,
    logThrottleMs: 30_000,
    logger: {
      warn: (...a) => warnings.push(a.join(' ')),
      info: (...a) => infos.push(a.join(' '))
    },
    fetchFn: async (instanceId) => {
      dbCalls++;
      if (dbCalls === 1) {
        return { data: { tenant_id: 'tenant-a', settings: { welcome: 'oi' } }, error: null };
      }
      throw new Error('INSTANCE_CONFIG_TIMEOUT');
    }
  });

  // 1. Cold load -> 1 DB call
  const first = await loader.getConfig('inst-1');
  assert.equal(first._resolvedTenantId, 'tenant-a');
  assert.equal(first.welcome, 'oi');
  assert.equal(dbCalls, 1);

  // 2. Avanca 70s (entre 60s e 300s): retorna cache imediato (stale-while-revalidate)
  now += 70_000;
  const second = await loader.getConfig('inst-1');
  assert.equal(second.welcome, 'oi');
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(dbCalls, 2);

  // 3. Dentro da janela de cooldown de 15s (mesmo com mais chamadas apos timeout), nao dispara nova tempestade
  now += 5_000;
  const third = await loader.getConfig('inst-1');
  assert.equal(third.welcome, 'oi');
  assert.equal(dbCalls, 2, 'Cooldown de 15s deve evitar nova tentativa imediata');

  // 4. Mesmo apos expirar staleTtlMs (>300s), se houve falha recente dentro de 15s tambem bloqueia rajada
  now += 240_000;
  const fourth = await loader.getConfig('inst-1');
  assert.equal(fourth.welcome, 'oi');
  assert.equal(dbCalls, 3, 'Apos cooldown expirar e staleTtlMs vencer, tenta 1 vez e reativa cooldown em falha');

  now += 5_000;
  const fifth = await loader.getConfig('inst-1');
  assert.equal(fifth.welcome, 'oi');
  assert.equal(dbCalls, 3, 'Cooldown ativo bloqueia nova consulta nos 15s seguintes ao erro');
  assert.equal(warnings.length, 0, 'Timeout transitorio nao deve emitir console.warn');
  assert.equal(infos.length, 2, 'Log informativo deve ocorrer apenas 1 vez por falha respeitando throttle de 30s e cooldown de 15s');
});

test('fetchOrderDetailsSafe silencia feature-not-implemented e aplica cooldown de capacidade por instancia', async () => {
  assert.equal(typeof resilience.createOrderDetailsFetcher, 'function');

  let sockCalls = 0;
  const warnings = [];
  const infos = [];
  const fetcher = resilience.createOrderDetailsFetcher({
    unsupportedTtlMs: 30 * 60 * 1000,
    logger: {
      warn: (...a) => warnings.push(a.join(' ')),
      info: (...a) => infos.push(a.join(' '))
    }
  });

  const baseDetails = { orderId: 'ord-1', token: 'tok-1', itemCount: 2, totalAmount: 45.5, currency: 'BRL', products: [] };
  const fakeSockUnsupported = {
    async getOrderDetails() {
      sockCalls++;
      throw new Error('feature-not-implemented');
    }
  };

  const res1 = await fetcher.enrich('inst-1', fakeSockUnsupported, { orderId: 'ord-1', token: 'tok-1' }, baseDetails);
  const res2 = await fetcher.enrich('inst-1', fakeSockUnsupported, { orderId: 'ord-2', token: 'tok-2' }, { ...baseDetails, orderId: 'ord-2' });

  assert.equal(sockCalls, 1, 'Apos feature-not-implemented, nao deve insistir em getOrderDetails na mesma instancia durante o cooldown');
  assert.equal(warnings.length, 0, 'feature-not-implemented esperado nao deve poluir console.warn / DevLogger Alertas');
  assert.equal(infos.length, 1);
  assert.equal(res1.totalAmount, 45.5);
  assert.equal(res2.orderId, 'ord-2');

  // Em outra instancia onde o metodo funciona normalmente, deve popular produtos e total
  const okSock = {
    async getOrderDetails() {
      return {
        price: { total: 50000, currency: 'BRL' },
        products: [{ id: 'p1', name: 'X-Burger', quantity: 2, price: 25000, currency: 'BRL', imageUrl: 'https://img/1.jpg' }]
      };
    }
  };
  const okRes = await fetcher.enrich('inst-2', okSock, { orderId: 'ord-3', token: 'tok-3' }, { ...baseDetails, orderId: 'ord-3' });
  assert.equal(okRes.products.length, 1);
  assert.equal(okRes.products[0].name, 'X-Burger');
  assert.equal(okRes.totalAmount, 50);
});
