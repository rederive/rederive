// A src that is a DIRECTORY (a Rust crate: Cargo.toml, Cargo.lock, src/) hashes as its tree: sorted `<path>\0<sha256>\n` lines
// over every file except cargo's build output — the crate-root `target` DIRECTORY only (a file named target, or a target/
// directory under src/, is source and counts: selfhost tree_sha found the old any-depth, any-kind skip let an edit there
// change nothing) — then sha256 of the whole. One byte changed anywhere in the crate changes it.
// Shared by rdv (verifying srcSha256), the v0.5 fixtures and sir-factory pack (stamping it).
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export function treeSha(root) {
  const lines = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { if (d === root && f.name === 'target' && f.isDirectory()) continue; const p = join(d, f.name);
    if (f.isDirectory()) walk(p); else lines.push(`${relative(root, p)}\0${sha256(readFileSync(p))}\n`); } };
  walk(root); return sha256(lines.sort().join(''));
}
