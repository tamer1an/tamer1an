import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createInstance } from '../src/kv.js';

const fresh = (storeName = 's') => createInstance({ db: openDb(':memory:'), storeName });

test('get/set round-trips JSON and returns null for missing keys', async () => {
  const kv = fresh();
  assert.equal(await kv.getItem('nope'), null);
  assert.deepEqual(await kv.setItem('a', { n: 1, list: [1, 2] }), { n: 1, list: [1, 2] });
  assert.deepEqual(await kv.getItem('a'), { n: 1, list: [1, 2] });
  await kv.setItem('a', 'overwritten');
  assert.equal(await kv.getItem('a'), 'overwritten');
});

test('undefined is stored as null, like localforage', async () => {
  const kv = fresh();
  assert.equal(await kv.setItem('u', undefined), null);
  assert.equal(await kv.getItem('u'), null);
  assert.equal(await kv.length(), 1);
});

test('keys, key(index), length, removeItem, clear', async () => {
  const kv = fresh();
  await kv.setItem('b', 2);
  await kv.setItem('a', 1);
  assert.deepEqual(await kv.keys(), ['a', 'b']);
  assert.equal(await kv.key(1), 'b');
  assert.equal(await kv.key(5), null);
  await kv.removeItem('a');
  assert.equal(await kv.length(), 1);
  await kv.clear();
  assert.equal(await kv.length(), 0);
});

test('iterate visits in key order and stops on a returned value', async () => {
  const kv = fresh();
  for (const k of ['c', 'a', 'b']) await kv.setItem(k, k.toUpperCase());
  const seen = [];
  const out = await kv.iterate((v, k, i) => {
    seen.push([k, v, i]);
    if (k === 'b') return 'stop';
  });
  assert.equal(out, 'stop');
  assert.deepEqual(seen, [['a', 'A', 1], ['b', 'B', 2]]);
});

test('instances with different storeName are isolated', async () => {
  const db = openDb(':memory:');
  const one = createInstance({ db, storeName: 'one' });
  const two = one.createInstance({ storeName: 'two' });
  await one.setItem('k', 1);
  assert.equal(await two.getItem('k'), null);
});
