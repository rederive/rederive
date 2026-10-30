// The real function behind unit tree_sha: the tree hash of a crate directory (treeSha), from a map of relative path -> file text materialized in a fresh temp dir.
// EVERY entry is validated before ANY file is written (round 2, selfhost tree_sha): checking each path just before writing it
// made the error depend on entry order, a file/dir clash threw the host's EEXIST with a random temp path, and a NUL passed
// the guard and threw inside Node. Keys are checked in UTF-16 code-unit order, so the first bad key reported is the smallest.
// Refused: a non-relative path, a NUL, text that is not well formed (a lone surrogate reaches the file system as U+FFFD, two
// inputs one tree), a path that is both a file and a directory, and two paths one case-insensitive file system cannot keep
// apart (the stamp host is APFS: `A` and `a` would be one file). Declined: the root `target` exclusion stays case-sensitive —
// cargo writes `target/`, and a hand-made `TARGET/` is outside what the unit models.
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
export const module = 'cli/tree-sha.mjs';
const refuse = (p, why) => { throw new Error(`tree_sha: ${why} ${JSON.stringify(p)}`); };
export function check(files) {
  const keys = Object.keys(files).sort(); const folded = new Map(); const all = new Set(keys);
  for (const p of keys) {
    if (p === '' || p.startsWith('/') || p.includes('\\') || p.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) refuse(p, 'not a relative path');
    if (p.includes('\u0000')) refuse(p, 'a NUL in path');
    if (!p.isWellFormed()) refuse(p, 'not well-formed text: path');
    const c = files[p]; if (typeof c !== 'string') refuse(p, 'file content is not text at');
    if (!c.isWellFormed()) refuse(p, 'not well-formed text: content of');
    const segs = p.split('/'); for (let i = 1; i < segs.length; i++) if (all.has(segs.slice(0, i).join('/'))) refuse(p, `a file is also a directory (${JSON.stringify(segs.slice(0, i).join('/'))}) in`);
    const f = p.toLowerCase(); if (folded.has(f)) refuse(p, `one file on a case-insensitive file system with ${JSON.stringify(folded.get(f))}:`); folded.set(f, p);
  }
}
export const make = (m) => (files) => {
  const os = require('node:os'), fs = require('node:fs'), path = require('node:path');
  if (files === null || typeof files !== 'object' || Array.isArray(files)) throw new Error('tree_sha: files must be a map of path -> text');
  check(files);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-'));
  try { for (const [p, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), c); } return m.treeSha(d); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
};
