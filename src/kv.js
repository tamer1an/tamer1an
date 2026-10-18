// localforage-compatible key/value API backed by node:sqlite.
// Same method names and semantics (async, JSON values, null for missing keys, iterate stops on
// a non-undefined return) so code can move to real localforage in a browser unchanged.
import { openDb, now } from './db.js';

class Store {
  #db;
  #store;

  constructor({ name = 'agent-bank', storeName = 'keyvaluepairs', db } = {}) {
    this.#db = db ?? openDb();
    this.#store = `${name}/${storeName}`;
  }

  async getItem(key) {
    const row = this.#db.prepare('SELECT value FROM kv WHERE store=? AND key=?').get(this.#store, String(key));
    return row ? JSON.parse(row.value) : null;
  }

  async setItem(key, value) {
    // localforage stores undefined as null.
    const stored = value === undefined ? null : value;
    this.#db
      .prepare('INSERT INTO kv(store,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(store,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
      .run(this.#store, String(key), JSON.stringify(stored), now());
    return stored;
  }

  async removeItem(key) {
    this.#db.prepare('DELETE FROM kv WHERE store=? AND key=?').run(this.#store, String(key));
  }

  async clear() {
    this.#db.prepare('DELETE FROM kv WHERE store=?').run(this.#store);
  }

  async length() {
    return this.#db.prepare('SELECT count(*) AS n FROM kv WHERE store=?').get(this.#store).n;
  }

  async key(index) {
    const row = this.#db.prepare('SELECT key FROM kv WHERE store=? ORDER BY key LIMIT 1 OFFSET ?').get(this.#store, index);
    return row ? row.key : null;
  }

  async keys() {
    return this.#db.prepare('SELECT key FROM kv WHERE store=? ORDER BY key').all(this.#store).map((r) => r.key);
  }

  /** Calls fn(value, key, iterationNumber) in key order; a non-undefined return stops and is returned. */
  async iterate(fn) {
    const rows = this.#db.prepare('SELECT key, value FROM kv WHERE store=? ORDER BY key').all(this.#store);
    let i = 1;
    for (const row of rows) {
      const out = fn(JSON.parse(row.value), row.key, i++);
      if (out !== undefined) return out;
    }
    return undefined;
  }

  async ready() {}

  createInstance(options) {
    return new Store({ db: this.#db, ...options });
  }
}

const localforage = new Store();
export function createInstance(options) {
  return new Store(options);
}
export default localforage;
