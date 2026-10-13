import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addTransactionCapability } from '../../baileys-core/lib/Utils/auth-utils.js';

const logger = { trace() {}, warn() {}, error() {} };
function makeStore() {
    const values = {};
    const writes = [];
    const state = {
        async get(type, ids) {
            return Object.fromEntries(ids.filter(id => values[type]?.[id] != null).map(id => [id, values[type][id]]));
        },
        async set(data) {
            writes.push(data);
            for (const [type, entries] of Object.entries(data)) {
                values[type] ||= {};
                Object.assign(values[type], entries);
            }
        }
    };
    const store = addTransactionCapability(state, logger, { maxCommitRetries: 1, delayBetweenTriesMs: 0 });
    return { store, values, writes };
}

test('nested transactions on separate sockets commit only their own keys', async () => {
    const a = makeStore();
    const b = makeStore();
    await a.store.transaction(async () => {
        await a.store.set({ session: { a: Uint8Array.of(1) } });
        assert.equal(b.store.isInTransaction(), false);
        await b.store.transaction(async () => {
            await b.store.set({ session: { b: Uint8Array.of(2) } });
            assert.equal(a.store.isInTransaction(), true);
            assert.deepEqual(await b.store.get('session', ['a']), {});
        }, 'recipient');
        assert.equal(b.writes.length, 1);
        assert.equal(a.writes.length, 0);
    }, 'recipient');
    assert.deepEqual(Object.keys(a.values.session), ['a']);
    assert.deepEqual(Object.keys(b.values.session), ['b']);
    assert.equal(a.store.isInTransaction(), false);
    assert.equal(b.store.isInTransaction(), false);
});

test('same-socket nested work reuses its transaction and rolls back on error', async () => {
    const { store, writes } = makeStore();
    await assert.rejects(store.transaction(async () => {
        await store.set({ session: { a: Uint8Array.of(1) } });
        await store.transaction(async () => {
            assert.deepEqual(await store.get('session', ['a']), { a: Uint8Array.of(1) });
        }, 'other-key');
        throw new Error('rollback');
    }, 'recipient'), /rollback/);
    assert.equal(writes.length, 0);
    assert.equal(store.isInTransaction(), false);
    await store.transaction(async () => store.set({ session: { b: Uint8Array.of(2) } }), 'recipient');
    assert.equal(writes.length, 1);
});

test('parallel transactions on separate sockets keep caches isolated', async () => {
    const a = makeStore();
    const b = makeStore();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await Promise.all([a, b].map(async ({ store }, index) => store.transaction(async () => {
        await store.set({ session: { same: Uint8Array.of(index) } });
        if (index === 1) release();
        await gate;
        assert.deepEqual(await store.get('session', ['same']), { same: Uint8Array.of(index) });
    }, 'same-recipient')));
    assert.deepEqual(a.values.session.same, Uint8Array.of(0));
    assert.deepEqual(b.values.session.same, Uint8Array.of(1));
});

test('recreating 200 sockets does not add 200 Node 20 async hooks', async () => {
    const countContexts = () => Object.getOwnPropertySymbols(Promise.resolve()).filter(s => s.description === 'kResourceStore').length;
    const before = countContexts();
    for (let i = 0; i < 200; i++) {
        const { store } = makeStore();
        await store.transaction(async () => store.set({ session: { key: Uint8Array.of(i % 256) } }), 'recipient');
    }
    assert.ok(countContexts() <= before + 1, 'AsyncLocalStorage hooks accumulated after socket recreation');
});
