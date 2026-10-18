import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createForum, mentions } from '../src/forum.js';

const forum = () => createForum(openDb(':memory:'));

test('open a thread with a first post, reply, read in order', () => {
  const f = forum();
  const t = f.open({ title: 'Implement logcat digest', channel: 'build', author: 'claude', body: 'Spec in SPEC.md. @copilot please take slice 1.', kind: 'handoff' });
  assert.equal(t.posts.length, 1);
  assert.deepEqual(t.posts[0].mentions, ['copilot']);
  f.post({ threadId: t.id, author: 'copilot', body: 'Done, tests green. @argon review?', kind: 'answer' });
  const read = f.read(t.id);
  assert.deepEqual(read.posts.map((p) => p.author), ['claude', 'copilot']);
  assert.equal(f.list({ channel: 'build' })[0].post_count, 2);
});

test('inbox shows open-thread mentions from others only', () => {
  const f = forum();
  const t = f.open({ title: 't', author: 'claude', body: '@argon look', kind: 'question' });
  f.post({ threadId: t.id, author: 'argon', body: 'note to self @argon', kind: 'note' });
  f.open({ title: 'other', author: 'copilot', body: 'hi @argonaut not a mention' });
  assert.deepEqual(f.inbox('argon').map((p) => p.author), ['claude']);
  f.resolve(t.id);
  assert.equal(f.inbox('argon').length, 0);
  assert.equal(f.list().length, 1, 'resolved threads leave the default open list');
});

test('validation', () => {
  const f = forum();
  assert.throws(() => f.open({ title: 't', author: 'bob' }), /author/);
  assert.throws(() => f.post({ threadId: 'thr_x', author: 'claude', body: 'x' }), /no thread/);
  const t = f.open({ title: 't', author: 'human' });
  assert.throws(() => f.post({ threadId: t.id, author: 'claude', body: 'x', kind: 'rant' }), /kind/);
  assert.deepEqual(mentions('@claude @Claude @nobody @claude'), ['claude']);
});
