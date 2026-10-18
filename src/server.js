// REST API on 127.0.0.1. Every route except /health needs the x-bank-token header.
// Host header is checked to stop DNS-rebinding from a browser tab. The sandbox is NOT exposed.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join, dirname } from 'node:path';
import { DEFAULT_DB } from './db.js';

export const TOKEN_FILE = process.env.BANK_TOKEN_FILE ?? join(dirname(DEFAULT_DB), 'token');

export function loadToken(file = TOKEN_FILE) {
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(24).toString('hex'), { mode: 0o600 });
  }
  return readFileSync(file, 'utf8').trim();
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(req) {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw new HttpError(415, 'content-type must be application/json');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 256 * 1024) throw new HttpError(413, 'body too large');
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

const num = (v, d) => (v == null ? d : Math.min(Math.max(Number(v) || d, 1), 500));

/** Build the request handler. Exported separately so tests can run it on an ephemeral port. */
export function createHandler(bank, { token, port }) {
  const okHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  const tokenBuf = Buffer.from(token);

  const routes = [
    ['GET', /^\/memories$/, (q) => (q.get('q') ? bank.memory.search(q.get('q'), { scope: q.get('scope') ?? undefined, limit: num(q.get('limit'), 10), includeProposed: q.get('proposed') === '1' }) : bank.memory.list({ scope: q.get('scope') ?? undefined, status: q.get('status') ?? 'active', limit: num(q.get('limit'), 100) }))],
    ['POST', /^\/memories$/, (q, b) => bank.memory.save(b)],
    ['GET', /^\/memories\/digest$/, (q) => ({ digest: bank.memory.digest({ scope: q.get('scope') ?? undefined }) })],
    ['GET', /^\/memories\/([\w-]+)$/, (q, b, [id]) => bank.memory.get(id) ?? (() => { throw new HttpError(404, 'not found'); })()],
    ['POST', /^\/memories\/([\w-]+)\/approve$/, (q, b, [id]) => bank.memory.approve(id, b.approver)],
    ['POST', /^\/memories\/([\w-]+)\/archive$/, (q, b, [id]) => bank.memory.archive(id)],
    ['GET', /^\/forum\/threads$/, (q) => bank.forum.list({ channel: q.get('channel') ?? undefined, status: q.get('status') === 'all' ? null : (q.get('status') ?? 'open') })],
    ['POST', /^\/forum\/threads$/, (q, b) => bank.forum.open(b)],
    ['GET', /^\/forum\/threads\/([\w-]+)$/, (q, b, [id]) => bank.forum.read(id)],
    ['POST', /^\/forum\/threads\/([\w-]+)\/posts$/, (q, b, [id]) => bank.forum.post({ ...b, threadId: id })],
    ['POST', /^\/forum\/threads\/([\w-]+)\/resolve$/, (q, b, [id]) => bank.forum.resolve(id)],
    ['GET', /^\/forum\/inbox\/([a-z]+)$/, (q, b, [agent]) => bank.forum.inbox(agent)],
    ['GET', /^\/kv\/([\w-]+)$/, (q, b, [store]) => bank.kv(store).keys()],
    ['GET', /^\/kv\/([\w-]+)\/([^/]+)$/, (q, b, [store, key]) => bank.kv(store).getItem(decodeURIComponent(key))],
    ['PUT', /^\/kv\/([\w-]+)\/([^/]+)$/, (q, b, [store, key]) => bank.kv(store).setItem(decodeURIComponent(key), b.value)],
    ['DELETE', /^\/kv\/([\w-]+)\/([^/]+)$/, async (q, b, [store, key]) => (await bank.kv(store).removeItem(decodeURIComponent(key)), { ok: true })],
  ];

  return async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    try {
      if (!okHosts.has(req.headers.host)) throw new HttpError(421, 'bad host');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/health') return send(200, { ok: true });
      const given = Buffer.from(String(req.headers['x-bank-token'] ?? ''));
      if (given.length !== tokenBuf.length || !timingSafeEqual(given, tokenBuf)) throw new HttpError(401, 'missing or bad x-bank-token');
      for (const [method, pattern, fn] of routes) {
        const m = url.pathname.match(pattern);
        if (m && req.method === method) {
          const body = method === 'GET' || method === 'DELETE' ? {} : await readJson(req);
          return send(method === 'POST' && /\/(memories|threads|posts)$/.test(url.pathname) ? 201 : 200, await fn(url.searchParams, body, m.slice(1)));
        }
      }
      throw new HttpError(404, 'no such route');
    } catch (err) {
      send(err.status ?? 400, { error: err.message });
    }
  };
}

export function serve(bank, { port = Number(process.env.BANK_PORT ?? 7077), token = loadToken() } = {}) {
  const server = createServer(createHandler(bank, { token, port }));
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
