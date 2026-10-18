// Agent forum: threads + posts for handoffs, questions and reviews between agents.
import { openDb, now, newId, tx } from './db.js';
import { AGENTS } from './memory.js';

export const POST_KINDS = ['note', 'handoff', 'question', 'answer', 'review'];

function check(author, kind) {
  if (!AGENTS.includes(author)) throw new Error(`author must be one of ${AGENTS.join(', ')}`);
  if (kind && !POST_KINDS.includes(kind)) throw new Error(`kind must be one of ${POST_KINDS.join(', ')}`);
}

const required = (v, field, max) => {
  const s = String(v ?? '').trim();
  if (!s) throw new Error(`${field} is required`);
  if (s.length > max) throw new Error(`${field} is longer than ${max} characters`);
  return s;
};

export const mentions = (body) => [...new Set((String(body).match(/@([a-z]+)/g) ?? []).map((m) => m.slice(1)).filter((a) => AGENTS.includes(a)))];

export function createForum(db = openDb()) {
  const thread = (id) => db.prepare('SELECT * FROM threads WHERE id=?').get(id);

  function post({ threadId, author, body, kind = 'note' }) {
    check(author, kind);
    const t = thread(threadId);
    if (!t) throw new Error(`no thread ${threadId}`);
    const p = { id: newId('post'), thread_id: threadId, author, kind, body: required(body, 'body', 20000), created_at: now() };
    db.prepare('INSERT INTO posts(id,thread_id,author,kind,body,created_at) VALUES(:id,:thread_id,:author,:kind,:body,:created_at)').run(p);
    db.prepare('UPDATE threads SET updated_at=? WHERE id=?').run(p.created_at, threadId);
    return { ...p, mentions: mentions(p.body) };
  }

  return {
    post,

    open({ title, channel = 'general', author, body, kind = 'note' }) {
      check(author, kind);
      return tx(db, () => {
        const t = { id: newId('thr'), channel: required(channel, 'channel', 60), title: required(title, 'title', 200), author, status: 'open', created_at: now() };
        t.updated_at = t.created_at;
        db.prepare('INSERT INTO threads(id,channel,title,author,status,created_at,updated_at) VALUES(:id,:channel,:title,:author,:status,:created_at,:updated_at)').run(t);
        const first = body ? post({ threadId: t.id, author, body, kind }) : null;
        return { ...t, posts: first ? [first] : [] };
      });
    },

    read(threadId) {
      const t = thread(threadId);
      if (!t) throw new Error(`no thread ${threadId}`);
      const posts = db.prepare('SELECT * FROM posts WHERE thread_id=? ORDER BY created_at, id').all(threadId);
      return { ...t, posts };
    },

    list({ channel, status = 'open', limit = 50 } = {}) {
      return db
        .prepare(
          `SELECT t.*, (SELECT count(*) FROM posts p WHERE p.thread_id=t.id) AS post_count
           FROM threads t WHERE (? IS NULL OR status=?) AND (? IS NULL OR channel=?)
           ORDER BY updated_at DESC LIMIT ?`,
        )
        .all(status ?? null, status ?? null, channel ?? null, channel ?? null, limit);
    },

    /** Open-thread posts that @mention `agent`, newest first, excluding the agent's own posts. */
    inbox(agent, { limit = 20 } = {}) {
      check(agent);
      return db
        .prepare(
          `SELECT p.*, t.title AS thread_title, t.channel FROM posts p JOIN threads t ON t.id=p.thread_id
           WHERE t.status='open' AND p.author != ? AND (' ' || p.body || ' ') LIKE ?
           ORDER BY p.created_at DESC LIMIT ?`,
        )
        .all(agent, `%@${agent}%`, limit)
        .filter((p) => mentions(p.body).includes(agent));
    },

    resolve(threadId) {
      const res = db.prepare("UPDATE threads SET status='resolved', updated_at=? WHERE id=?").run(now(), threadId);
      if (!res.changes) throw new Error(`no thread ${threadId}`);
      return thread(threadId);
    },
  };
}
