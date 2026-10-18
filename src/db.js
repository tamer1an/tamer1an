// Shared SQLite connection + schema. Node >= 26 (node:sqlite, FTS5).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const ROOT = join(import.meta.dirname, '..');
export const DEFAULT_DB = process.env.BANK_DB ?? join(ROOT, 'data', 'bank.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  store TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (store, key)
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'global',
  kind TEXT NOT NULL CHECK (kind IN ('user','feedback','project','reference')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','active','archived')),
  source TEXT,
  supersedes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(id UNINDEXED, title, body, tags);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','resolved')) DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  author TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('note','handoff','question','answer','review')) DEFAULT 'note',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_thread ON posts(thread_id, created_at);
`;

const cache = new Map();

/** Open (once per path) the bank database. ':memory:' gives a fresh DB every call. */
export function openDb(path = DEFAULT_DB) {
  if (path !== ':memory:' && cache.has(path)) return cache.get(path);
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // DELETE journal: WAL's shared-memory file is unreliable on drvfs (/mnt/*) and across Windows+WSL.
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  db.exec(SCHEMA);
  if (path !== ':memory:') cache.set(path, db);
  return db;
}

export const now = () => new Date().toISOString();

/** Sortable, collision-resistant id: <prefix>_<time36><rand>. */
export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
