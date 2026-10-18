// Memory bank: durable facts shared by every agent, with full-text search and trust tiers.
import { openDb, now, newId, tx } from './db.js';

export const KINDS = ['user', 'feedback', 'project', 'reference'];
export const AGENTS = ['human', 'claude', 'argon', 'copilot', 'local'];

// Authors whose writes start as 'proposed' and need `approve`. A wrong memory is loaded into every
// future session, so the small local model never writes 'active' memories directly.
const PROPOSE_ONLY = new Set((process.env.BANK_PROPOSE_AUTHORS ?? 'local').split(',').map((s) => s.trim()).filter(Boolean));
// Authors allowed to approve proposals.
const APPROVERS = new Set(['human', 'claude']);

const SECRET = /(api[_-]?key|secret|password|passwd|token|bearer)\s*[:=]\s*\S{8,}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/i;

function clean(text, field, max) {
  const value = String(text ?? '').trim();
  if (!value) throw new Error(`${field} is required`);
  if (value.length > max) throw new Error(`${field} is longer than ${max} characters`);
  return value;
}

const normTags = (tags) =>
  (Array.isArray(tags) ? tags : String(tags ?? '').split(','))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .join(',');

const toMemory = (row) => row && { ...row, tags: row.tags ? row.tags.split(',') : [] };

/**
 * FTS5 query from free text: each word quoted (no syntax injection), OR-ed for recall, ranked by bm25.
 * Pure word tokens of 4+ chars also match as a prefix ("headun" → headunit); the exact term stays in
 * the query so whole-word hits outrank prefix-only hits. Stemming comes from the porter tokenizer.
 */
export function ftsQuery(text) {
  const words = String(text).match(/[\p{L}\p{N}_.-]+/gu) ?? [];
  return words
    .map((w) => {
      const quoted = `"${w.replaceAll('"', '""')}"`;
      return /^[\p{L}\p{N}_]{4,}$/u.test(w) ? `(${quoted} OR ${quoted}*)` : quoted;
    })
    .join(' OR ');
}

export function createMemoryBank(db = openDb()) {
  const get = (id) => toMemory(db.prepare('SELECT * FROM memories WHERE id=?').get(id));

  function indexFts(m) {
    db.prepare('DELETE FROM memories_fts WHERE id=?').run(m.id);
    if (m.status !== 'archived') db.prepare('INSERT INTO memories_fts(id,title,body,tags) VALUES(?,?,?,?)').run(m.id, m.title, m.body, m.tags);
  }

  function setStatus(id, status) {
    const ts = now();
    const res = db.prepare('UPDATE memories SET status=?, updated_at=? WHERE id=?').run(status, ts, id);
    if (!res.changes) throw new Error(`no memory ${id}`);
    const row = db.prepare('SELECT * FROM memories WHERE id=?').get(id);
    indexFts(row);
    return toMemory(row);
  }

  return {
    get,

    /** Save a memory. `supersedes` archives the old one in the same transaction. */
    save({ title, body, kind = 'project', scope = 'global', tags = '', author, source = null, supersedes = null }) {
      if (!AGENTS.includes(author)) throw new Error(`author must be one of ${AGENTS.join(', ')}`);
      if (!KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join(', ')}`);
      const m = {
        id: newId('mem'),
        scope: clean(scope, 'scope', 100),
        kind,
        title: clean(title, 'title', 200),
        body: clean(body, 'body', 8000),
        tags: normTags(tags),
        author,
        status: PROPOSE_ONLY.has(author) ? 'proposed' : 'active',
        source,
        supersedes,
        created_at: now(),
      };
      m.updated_at = m.created_at;
      if (SECRET.test(`${m.title}\n${m.body}`)) throw new Error('refusing to store what looks like a secret/credential');
      return tx(db, () => {
        if (supersedes) {
          if (!get(supersedes)) throw new Error(`no memory ${supersedes} to supersede`);
          setStatus(supersedes, 'archived');
        }
        db.prepare(
          `INSERT INTO memories(id,scope,kind,title,body,tags,author,status,source,supersedes,created_at,updated_at)
           VALUES(:id,:scope,:kind,:title,:body,:tags,:author,:status,:source,:supersedes,:created_at,:updated_at)`,
        ).run(m);
        indexFts(m);
        return toMemory(m);
      });
    },

    /**
     * Ranked full-text search. `scope`: one scope or an array (each also includes 'global');
     * undefined or '*' searches everything. Archived never returned.
     */
    search(text, { scope, limit = 10, includeProposed = false } = {}) {
      const q = ftsQuery(text);
      if (!q) return [];
      const statuses = includeProposed ? ['active', 'proposed'] : ['active'];
      const scopes = scope == null || scope === '*' ? null : [...new Set([...[scope].flat(), 'global'])];
      const rows = db
        .prepare(
          `SELECT m.*, bm25(memories_fts, 0, 3.0, 1.0, 2.0) AS score
           FROM memories_fts JOIN memories m ON m.id = memories_fts.id
           WHERE memories_fts MATCH ? AND m.status IN (${statuses.map(() => '?').join(',')})
             ${scopes ? `AND m.scope IN (${scopes.map(() => '?').join(',')})` : ''}
           ORDER BY score LIMIT ?`,
        )
        .all(q, ...statuses, ...(scopes ?? []), limit);
      return rows.map(toMemory);
    },

    list({ scope, status = 'active', kind, limit = 100 } = {}) {
      return db
        .prepare(
          `SELECT * FROM memories WHERE status=? AND (? IS NULL OR scope IN (?, 'global')) AND (? IS NULL OR kind=?)
           ORDER BY updated_at DESC LIMIT ?`,
        )
        .all(status, scope ?? null, scope ?? null, kind ?? null, kind ?? null, limit)
        .map(toMemory);
    },

    approve(id, approver) {
      if (!APPROVERS.has(approver)) throw new Error(`only ${[...APPROVERS].join('/')} can approve memories`);
      const m = get(id);
      if (!m) throw new Error(`no memory ${id}`);
      if (m.status !== 'proposed') throw new Error(`memory ${id} is ${m.status}, not proposed`);
      return setStatus(id, 'active');
    },

    archive(id) {
      return setStatus(id, 'archived');
    },

    /** Compact index for injecting into a system prompt: one line per active memory. */
    digest({ scope, limit = 40 } = {}) {
      const items = this.list({ scope, limit });
      return items.map((m) => `- [${m.kind}] ${m.title} (${m.id}) — ${m.body.split('\n')[0].slice(0, 160)}`).join('\n');
    },

    /** Export as Claude-Code-style memory markdown files: [{ file, content }]. */
    exportMarkdown({ scope } = {}) {
      return this.list({ scope, limit: 1000 }).map((m) => ({
        file: `${m.kind}_${m.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)}.md`,
        content: `---\nname: ${m.id}\ndescription: ${m.title}\nmetadata:\n  type: ${m.kind}\n---\n\n${m.body}\n`,
      }));
    },
  };
}
