// Public entry: one bank = memory + forum + kv on one database.
import { openDb, DEFAULT_DB } from './db.js';
import { createMemoryBank } from './memory.js';
import { createForum } from './forum.js';
import { createInstance } from './kv.js';

export { runSandboxed } from './sandbox.js';
export { distillInto, proposeMemories } from './distill.js';
export { delegate, runRole, loadRole, ROLES_DIR } from './delegate.js';
export { KINDS, AGENTS } from './memory.js';
export { POST_KINDS } from './forum.js';

export function openBank(path = DEFAULT_DB) {
  const db = openDb(path);
  return {
    db,
    memory: createMemoryBank(db),
    forum: createForum(db),
    kv: (storeName = 'keyvaluepairs') => createInstance({ db, storeName }),
  };
}
