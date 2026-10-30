// Input generator for tree_sha: argument lists [files], files = { relativePath: fileText }.
// Apart from the curated refusal probes, every map stays inside the materializable envelope: '/'-separated relative paths with non-empty components that are
// never '.' or '..', no path both a file and a directory, no two paths equal under case folding (the stamp host is a
// case-insensitive, normalization-insensitive APFS volume), well-formed Unicode, NFC names only.

const CURATED = [
  [{}],                                                         // empty map
  [{ 'a': '' }],                                                // one empty file
  [{ 'a': 'x' }],
  [{ 'Cargo.toml': '[package]\nname = "x"\n', 'src/lib.rs': 'pub fn f() {}\n' }],
  [{ 'target': 'a FILE named target at the root -> kept' }],
  [{ '': 'x' }],                                                // refusal probes in the frozen slice too (R2)
  [{ 'a//b': '1' }],
  [{ '../x': '1' }],
  [{ 'target/debug/x': 'bin', 'src/lib.rs': 'fn a(){}' }],      // the crate-root target DIRECTORY -> excluded
  [{ 'target/a': '1' }],                                        // everything excluded -> same as {}
  [{ 'target/a': '1', 'target/b/c': '2', 'Cargo.toml': '' }],
  [{ 'src/target/x.rs': 'nested target dir -> kept', 'src/lib.rs': 'fn a(){}' }],
  [{ 'src/target': 'file at depth -> kept', 'src/lib.rs': 'fn a(){}' }],
  [{ 'a/b/c/target/d/e': 'deep -> kept', 'a/b/c/f': 'kept' }],
  [{ 'Target/x': 'case differs -> kept', 'targets/y': 'kept', 'target.rs': 'kept', 'my-target': 'kept', 'xtarget/z': 'kept' }],
  [{ 'a/b': '1', 'a.b': '2', 'a-b': '3' }],                     // '-' < '.' < '/' : whole-path order, not per-level
  [{ 'a/b': '1', 'a.b': '2' }],
  [{ 'a/z': '1', 'a0': '2', 'a!': '3' }],                       // '!' < '/' < '0'
  [{ 'ab': '1', 'a/c': '2', 'aa': '3' }],
  [{ 'x/y/z/w/v/u/t/s/r/q/p': 'deep nesting', 'x/y/z/w/v/u/t/s/r/q2': 'sibling' }],
  [{ '\u{1F600}': 'supplementary', '': 'private use', 'Ａx': 'fullwidth' }], // UTF-16 vs UTF-8 order flips
  [{ 'd/\u{1F600}.rs': 'a', 'd/�.rs': 'b' }],
  [{ 'é': 'e-acute', 'e': 'e', 'f': 'f', '日本': 'cjk' }],
  [{ 'a': 'é\u{1F600}日', 'b': 'line1\r\nline2\n' }],    // non-ASCII content -> UTF-8 bytes hashed
  [{ '.hidden': 'dot file', '.git/HEAD': 'ref: x', 'a b': 'space', '...': 'three dots is a name' }],
  [{ 'a': '', 'b': '', 'c/d': '' }],                            // several empty files
  [{ 'new\nline': 'name with a newline', 'n': '1' }],
  [{ 'z': '1', 'y': '2', 'x': '3', 'w/v': '4' }],               // insertion order is irrelevant
  [{ 'w/v': '4', 'x': '3', 'y': '2', 'z': '1' }],
  // the seam's refusals: exactly ONE invalid path per probe, every other path valid and clash-free
  [{ 'ok': '1', '/abs': 'x' }],
  [{ 'a\\b': 'backslash' }],
  [{ './a': '1' }],
  [{ 'a/.': '1' }],
  [{ 'a/../b': '1', 'c': '2' }],
  [{ 'a/': '1' }],
];

const NAMES = ['src', 'lib.rs', 'main.rs', 'Cargo.toml', 'Cargo.lock', 'mod.rs', 'a', 'b', 'a.b', 'a-b', 'a_b', 'ab', 'a0',
  'target', 'targets', 'target.rs', 'Target', '.hidden', 'tests', 'x', 'z', 'é', '日本', '\u{1F600}', '',
  'ａ', 'b c', 'README.md'];
const TEXTS = ['', 'x', 'fn main() {}\n', '[package]\nname = "x"\n', 'é\u{1F600}', '\n', 'a\u0000b', '\t \r\n'];

function ok(files) {
  const exact = new Map(); const fileSet = new Set(Object.keys(files));
  for (const p of Object.keys(files)) {
    const parts = p.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const pre = parts.slice(0, i).join('/'); const k = pre.toLowerCase();
      if (exact.has(k) && exact.get(k) !== pre) return false;   // case-fold collision
      exact.set(k, pre);
      if (i < parts.length && fileSet.has(pre)) return false;   // a file that is also a directory
    }
  }
  return true;
}

export function genInputs(n, rnd) {
  const out = CURATED.map((a) => [{ ...a[0] }]);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  while (out.length < n) {
    const files = {}; const count = Math.floor(rnd() * 8);
    for (let i = 0; i < count; i++) {
      const depth = 1 + Math.floor(rnd() * 4); const parts = [];
      for (let d = 0; d < depth; d++) parts.push(d === 0 && rnd() < 0.3 ? pick(['target', 'src']) : pick(NAMES));  // reach the root-target rule often
      const p = parts.join('/'); const t = rnd() < 0.2 ? pick(TEXTS) + String(Math.floor(rnd() * 1000)) : pick(TEXTS);
      const trial = { ...files, [p]: t };
      if (ok(trial)) Object.assign(files, { [p]: t });
    }
    out.push([files]);
  }
  return out;
}
