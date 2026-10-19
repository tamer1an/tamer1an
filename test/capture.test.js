import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { capture } from '../src/capture.js';

test('capture keeps the first max bytes while streaming and counts the rest', () => {
  const s = new PassThrough();
  const out = capture(s, 4096);
  for (let i = 0; i < 1000; i++) s.write(Buffer.alloc(1024, 'a'));
  assert.equal(out.kept(), 4096); // retained while data was still flowing, not trimmed at close
  assert.equal(out.text(), `${'a'.repeat(4096)}\n…[truncated ${1000 * 1024 - 4096} bytes]`);
});

test('capture returns short output unchanged', () => {
  const s = new PassThrough();
  const out = capture(s, 4096);
  s.write('hello ');
  s.write('world');
  assert.equal(out.text(), 'hello world');
});
