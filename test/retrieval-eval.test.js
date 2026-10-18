// Retrieval quality eval (spec: argon, thr_mvefb6uz5eba07f6). Measures Recall@1/@3 and MRR so ranking
// changes are proven, not assumed. Thresholds: R@1 >= 0.9, R@3 = 1.0, MRR >= 0.95.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { createMemoryBank } from '../src/memory.js';

const CORPUS = {
  M1: ['USB serial device mapping', 'Attach the car headunit over USB and check device serial number.', 'usb,androidauto'],
  M2: ['Wireless projection connection drop', 'Retry connecting when Wi-Fi socket disconnects during projection.', 'wifi,projection'],
  M3: ['Sqlite journal mode on drvfs', 'Use DELETE journal mode on /mnt/f because WAL locks fail across WSL.', 'sqlite,wsl'],
  M4: ['Ollama context window limit', 'Keep num_ctx at 8192 so KV cache stays in GPU memory.', 'ollama,gpu'],
  M5: ['Bubblewrap sandbox isolation', 'Unshare network and hide $HOME when running untrusted commands.', 'sandbox,security'],
  M6: ['ADB carriage return stripping', "Always pipe adb.exe output through tr -d '\\r' (CRLF).", 'adb,windows'],
  M7: ['Token authentication on REST server', 'Require x-bank-token header and validate Host against DNS rebinding.', 'rest,auth'],
  M8: ['Local model proposal trust tier', 'Small model writes start as proposed until human or claude approves.', 'trust,memory'],
  M9: ['Audio focus ducking behavior', 'Lower media volume when navigation voice guidance plays.', 'audio,nav'],
  M10: ['Deterministic test runner setup', 'Run unit test suites with Node built-in runner.', 'testing,node'],
  M11: ['Gradle offline cache corruption', 'Clear corrupted lockfiles in .gradle when builds hang.', 'gradle,build'],
  M12: ['Rotary controller keycodes', 'Map scroll wheel key events for dashboard navigation.', 'input,rotary'],
};

const QUERIES = [
  ['serials', 'M1'], // plural
  ['connected', 'M2'], // inflection
  ['tests', 'M10'], // plural
  ['approving proposals', 'M8'], // inflections
  ['headun', 'M1'], // prefix
  ['bubblew', 'M5'], // prefix
  ['adb.exe CRLF', 'M6'], // must not regress
  ['drvfs WAL', 'M3'],
  ['num_ctx 8192', 'M4'],
  ['x-bank-token DNS rebinding', 'M7'],
];

function evaluate(bank, ids) {
  let r1 = 0;
  let r3 = 0;
  let mrr = 0;
  const misses = [];
  for (const [q, want] of QUERIES) {
    const ranked = bank.search(q, { limit: 10 }).map((m) => m.id);
    const rank = ranked.indexOf(ids[want]) + 1;
    if (rank === 1) r1++;
    if (rank >= 1 && rank <= 3) r3++;
    if (rank) mrr += 1 / rank;
    else misses.push(q);
  }
  const n = QUERIES.length;
  return { r1: r1 / n, r3: r3 / n, mrr: mrr / n, misses };
}

function seeded(db) {
  const bank = createMemoryBank(db);
  const ids = {};
  for (const [key, [title, body, tags]] of Object.entries(CORPUS)) ids[key] = bank.save({ title, body, tags, kind: 'reference', author: 'claude' }).id;
  return { bank, ids };
}

test('retrieval eval: stemming + prefix meet thresholds', (t) => {
  const { bank, ids } = seeded(openDb(':memory:'));
  const m = evaluate(bank, ids);
  t.diagnostic(`R@1=${m.r1.toFixed(2)} R@3=${m.r3.toFixed(2)} MRR=${m.mrr.toFixed(2)} misses=${JSON.stringify(m.misses)}`);
  assert.ok(m.r1 >= 0.9, `Recall@1 ${m.r1} < 0.9 (misses: ${m.misses})`);
  assert.equal(m.r3, 1, `Recall@3 ${m.r3} < 1 (misses: ${m.misses})`);
  assert.ok(m.mrr >= 0.95, `MRR ${m.mrr} < 0.95`);
});

test('migration: an existing non-porter FTS table is rebuilt, archived rows stay out', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'bank-mig-')), 'old.db');
  // Build a DB with the original (pre-porter) schema and data.
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE memories (id TEXT PRIMARY KEY, scope TEXT NOT NULL DEFAULT 'global', kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '', author TEXT NOT NULL, status TEXT NOT NULL, source TEXT, supersedes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE VIRTUAL TABLE memories_fts USING fts5(id UNINDEXED, title, body, tags);`);
  const ins = old.prepare("INSERT INTO memories VALUES (?, 'global', 'reference', ?, ?, '', 'claude', ?, NULL, NULL, 't', 't')");
  const fts = old.prepare('INSERT INTO memories_fts VALUES (?, ?, ?, ?)');
  ins.run('mem_a', 'Tablet serial', 'adb serial TESTSERIAL01', 'active');
  fts.run('mem_a', 'Tablet serial', 'adb serial TESTSERIAL01', '');
  ins.run('mem_b', 'Old serial', 'archived serial', 'archived');
  old.close();

  const bank = createMemoryBank(openDb(file));
  assert.deepEqual(bank.search('serials').map((m) => m.id), ['mem_a']);
  const sql = new DatabaseSync(file).prepare("SELECT sql FROM sqlite_master WHERE name='memories_fts'").get().sql;
  assert.match(sql, /porter/);
});
