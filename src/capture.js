// Bounded capture of a child's output stream: keep the first `max` bytes as they arrive and only
// count the rest, so a command that floods stdout cannot exhaust this process before it exits.
export function capture(stream, max = 64 * 1024) {
  const chunks = [];
  let kept = 0;
  let dropped = 0;
  stream.on('data', (d) => {
    const buf = Buffer.isBuffer(d) ? d : Buffer.from(d);
    const take = Math.min(buf.length, max - kept);
    if (take > 0) {
      chunks.push(buf.subarray(0, take));
      kept += take;
    }
    dropped += buf.length - Math.max(take, 0);
  });
  return {
    kept: () => kept,
    text() {
      const s = Buffer.concat(chunks).toString('utf8');
      return dropped ? `${s}\n…[truncated ${dropped} bytes]` : s;
    },
  };
}
