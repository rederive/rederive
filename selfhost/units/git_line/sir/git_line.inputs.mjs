// genInputs(n, rnd) for unit git_line: argument lists [text, lines]. Curated prefix first (every break kind, every
// adjacency of CR and LF, every ending, the non-breaking separators, line 0 / -0 / negatives / fractions / NaN /
// +-Infinity / past-the-end), then seeded random texts of mixed endings with in- and out-of-range line lists.
// Non-breaking separators are written as escapes only (no raw U+2028 / U+2029 in this file).
const LS = '\u2028', PS = '\u2029', NEL = '\u0085';
const SPECIAL = [0, -0, -1, -2, 0.5, 1.5, 2.25, -1.5, NaN, Infinity, -Infinity, 1e21, 4294967295, 9007199254740992];
// parser line count = breaks + 1, where a break is CRLF, CR or LF (CRLF counted once); computed only to size the line lists
const parserLines = (t) => (t.match(/\r\n|\r|\n/g) ?? []).length + 1;
const allLines = (t, extra = 2) => { const p = parserLines(t); const out = []; for (let k = 0; k <= p + extra; k++) out.push(k); return out; };
const CURATED_TEXTS = [
  '', 'a', 'abc',
  '\n', '\r', '\r\n', 'a\n', 'a\r', 'a\r\n',
  '\n\n', '\r\r', '\r\n\r\n', '\n\r', '\r\r\n', '\n\r\n', '\r\n\r', '\n\n\r', '\r\r\r', '\n\n\n',
  'a\rb\nc', 'UNIT u\rKIND k\nSIG s\n', 'a\r\nb\rc\nd', 'x\r\ny\rz\n\rw', 'one\rtwo\rthree\r', 'one\ntwo\nthree',
  'a' + LS + 'b' + PS + 'c\n', LS, PS + '\r' + LS, 'a' + NEL + 'b\fc\vd\n', 'é\rè\nê',
  '😀\r😀\n😀', '\r\nlead', '\rlead', '\nlead', 'trail \t\r\n  \n',
  'UNIT x\nKIND FUNCTIONAL\r\nSIG f(a: text) -> text\rBEHAVIOR\rR1 a\r\nR2 b\n',
];
const SEGS = ['', '', 'a', 'bc', 'R1 x', ' ', '\t', LS, PS, NEL, 'é', '😀', 'SIG s(a: i64) -> i64', '#'];
const BREAKS = ['\n', '\n', '\r', '\r\n', '\r\n', '\r'];
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
function randomText(rnd) {
  const k = Math.floor(rnd() * 9); let t = pick(rnd, SEGS);
  for (let i = 0; i < k; i++) t += pick(rnd, BREAKS) + pick(rnd, SEGS);   // an empty segment lets CR then LF fuse into CRLF
  if (rnd() < 0.4) t += pick(rnd, BREAKS);
  return t;
}
function randomLines(rnd, t) {
  const p = parserLines(t); const m = 1 + Math.floor(rnd() * 8); const out = [];
  for (let i = 0; i < m; i++) { const r = rnd();
    out.push(r < 0.65 ? 1 + Math.floor(rnd() * p) : r < 0.8 ? p + 1 + Math.floor(rnd() * 3) : r < 0.88 ? 0 : pick(rnd, SPECIAL)); }
  return out;
}
export function genInputs(n, rnd) {
  const out = [];
  for (const t of CURATED_TEXTS) out.push([t, allLines(t)]);
  out.push(['a\rb\nc', SPECIAL]);
  out.push(['', SPECIAL]);
  out.push(['a\nb\n', [3, 2, 1, 0, 3, 3, -0, 2]]);   // unsorted, repeated
  out.push(['a\r\nb', []]);                            // empty list
  out.push(['x\ry\rz\n', [4, 5, 100, -100, 3.0000001]]);
  // out of the abstract envelope (js extension): the throw paths and a non-number line
  out.push([null, [1]]);
  out.push([5, [1]]);
  out.push(['a\nb', null]);
  out.push(['a\nb', ['2', '02', 'x']]);
  while (out.length < n) { const t = randomText(rnd); out.push([t, randomLines(rnd, t)]); }
  return out;
}
