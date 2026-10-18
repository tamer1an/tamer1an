// Distiller: a local Ollama model reads a transcript/log and PROPOSES memories.
// Everything it writes is author 'local' → status 'proposed' → needs `approve` by human/claude.
import { KINDS } from './memory.js';

export const OLLAMA_URL = process.env.OLLAMA_HOST ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}` : 'http://localhost:11434';
export const DEFAULT_MODEL = process.env.BANK_LOCAL_MODEL ?? 'llama3.1-8k';
// Keep the KV cache on the 8 GB GPU; the Ollama app default (128k) pushes every layer to CPU.
const NUM_CTX = Number(process.env.BANK_OLLAMA_CTX ?? 8192);
const MAX_INPUT_CHARS = 20_000; // ~5k tokens, leaves room for the answer inside NUM_CTX

const SCHEMA = {
  type: 'object',
  properties: {
    memories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: KINDS },
          title: { type: 'string' },
          body: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['kind', 'title', 'body'],
      },
    },
  },
  required: ['memories'],
};

const SYSTEM = `You extract durable memories for a team of software agents from a work transcript.
Keep ONLY facts that will still matter in a future session and cannot be re-derived from the code:
user preferences and corrections (kind "feedback"), facts about the user (kind "user"),
project decisions/constraints/status with absolute dates (kind "project"),
pointers to external resources, paths, devices, URLs (kind "reference").
Skip chit-chat, step-by-step narration, anything temporary, and anything secret (keys, tokens, passwords).
Title: under 12 words. Body: 1-3 sentences, concrete, include WHY when known.
Return at most 8 memories. If nothing is durable, return {"memories": []}.`;

/** Ask the local model for memory candidates. `fetchImpl` is injectable for tests. */
export async function proposeMemories(text, { model = DEFAULT_MODEL, fetchImpl = fetch, signal } = {}) {
  const input = text.length > MAX_INPUT_CHARS ? text.slice(-MAX_INPUT_CHARS) : text; // the end of a session holds the conclusions
  const res = await fetchImpl(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      stream: false,
      format: SCHEMA,
      keep_alive: '10m',
      options: { temperature: 0, num_ctx: NUM_CTX },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Transcript:\n\n${input}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let parsed;
  try {
    parsed = JSON.parse(data.message?.content ?? '');
  } catch {
    throw new Error(`model returned non-JSON: ${String(data.message?.content).slice(0, 200)}`);
  }
  // Small models drift from the schema: keep only well-formed candidates.
  return (parsed.memories ?? []).filter((m) => KINDS.includes(m?.kind) && m.title?.trim() && m.body?.trim()).slice(0, 8);
}

/** Propose + save as 'local' (→ proposed). Skips candidates whose title already exists. Returns { saved, skipped }. */
export async function distillInto(bank, text, { scope = 'global', source = null, ...opts } = {}) {
  const candidates = await proposeMemories(text, opts);
  const existing = new Set([...bank.list({ scope, limit: 1000 }), ...bank.list({ scope, status: 'proposed', limit: 1000 })].map((m) => m.title.toLowerCase()));
  const saved = [];
  const skipped = [];
  for (const c of candidates) {
    if (existing.has(c.title.trim().toLowerCase())) {
      skipped.push({ title: c.title, reason: 'duplicate title' });
      continue;
    }
    try {
      saved.push(bank.save({ ...c, scope, author: 'local', source }));
      existing.add(c.title.trim().toLowerCase());
    } catch (err) {
      skipped.push({ title: c.title, reason: err.message });
    }
  }
  return { saved, skipped };
}
