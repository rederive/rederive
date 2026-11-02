// binding_of input generator (selfhost, phase 2). Seeds: packages/colors/sir/strip.{sir,js.sir} and the lab's is_number family,
// copied verbatim at cut time (2026-11-02). The helpers below are the decomposer's rule-derived reference (canonical text, the
// legacy print, the bound-hash finder), used ONLY to compute hashes to bind to; the oracle's truth comes from the pinned code.
import { createHash } from 'node:crypto';
const sha = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const W = new Set([0x09,0x0a,0x0b,0x0c,0x0d,0x20,0xa0,0x1680,0x2000,0x2001,0x2002,0x2003,0x2004,0x2005,0x2006,0x2007,0x2008,0x2009,0x200a,0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff]);
const isW = (c) => c !== undefined && W.has(c.charCodeAt(0));
const LT = new Set(['\n','\r','\u2028','\u2029']);
const isLT = (c) => LT.has(c);
const hasLT = (s) => [...s].some(isLT);
const trimW = (s) => { let a = 0, b = s.length; while (a < b && isW(s[a])) a++; while (b > a && isW(s[b-1])) b--; return s.slice(a, b); };
const isST = (c) => c === ' ' || c === '\t';
function wellFormed(s) { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 0xd800 && c <= 0xdbff) { const d = s.charCodeAt(i+1); if (d >= 0xdc00 && d <= 0xdfff) { i++; continue; } return false; } if (c >= 0xdc00 && c <= 0xdfff) return false; } return true; }
function canon(text) {
  if (!wellFormed(text)) return null;
  const lines = []; let cur = '';
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '\r') { lines.push(cur); cur = ''; if (text[i+1] === '\n') i++; } else if (c === '\n') { lines.push(cur); cur = ''; } else cur += c; }
  lines.push(cur);
  const out = [];
  for (let l of lines) {
    let k = 0; while (k < l.length && (isST(l[k]) || l[k] === '\ufeff')) k++;
    l = l.slice(0, k).replace(/\ufeff/g, '') + l.slice(k);
    let e = l.length; while (e > 0 && isST(l[e-1])) e--; l = l.slice(0, e);
    if (!l) continue;
    let j = 0; while (j < l.length && isST(l[j])) j++;
    out.push(j ? '  ' + l.slice(j) : l);
  }
  return out.length ? out.join('\n') + '\n' : '';
}
const canonSha = (t) => { const c = canon(t); return c === null ? null : sha(c); };
// ATTRS: returns { body, list: [[k,v]...] in discovery order }
function attrs(s) {
  const found = []; let body = s;
  for (;;) {
    let hit = null;
    for (let i = 0; i < body.length && !hit; i++) {
      if (!isW(body[i]) || (i > 0 && isW(body[i-1]))) continue;
      let j = i; while (j < body.length && isW(body[j])) j++;
      for (const kw of ['CITED','EARNED','ANCHOR']) {
        if (body.startsWith(kw, j)) { let q = j + kw.length; if (!isW(body[q])) continue; let r = q; while (r < body.length && isW(body[r])) r++;
          const rest = body.slice(r);
          if (rest.length) { if (!hasLT(rest)) hit = { i, kw, v: rest }; }
          else if (r - q >= 2 && !isLT(body[r-1])) hit = { i, kw, v: body[r-1] };
          break; }
      }
    }
    if (!hit) break;
    found.push([hit.kw, trimW(hit.v)]); body = body.slice(0, hit.i);
  }
  return { body: trimW(body), found };
}
function legacyPrint(text) {
  const ast = []; let cur = null;
  for (let raw of text.split('\n')) {
    if (raw.endsWith('\r')) raw = raw.slice(0, -1);
    if (!trimW(raw)) continue;
    let k = 0; while (k < raw.length && isST(raw[k])) k++;
    const indent = raw.slice(0, k), content = raw.slice(k);
    if (content.startsWith('#')) continue;
    let code = content;
    for (let j = 0; j < content.length; j++) {
      if (isLT(content[j]) && !(isW(content[j]) && content[j+1] === '#')) break;
      if (isW(content[j]) && content[j+1] === '#' && (j+2 >= content.length || isW(content[j+2])) && !hasLT(content.slice(j+2))) { let e = j; while (e > 0 && isW(content[e-1])) e--; code = content.slice(0, e); break; }
      if (isLT(content[j])) break;
    }
    if (!indent) {
      let name = null, rest = '';
      if (code.length && !isW(code[0])) {
        let n = 0; while (n < code.length && !isW(code[n])) n++;
        let r = n; while (r < code.length && isW(code[r])) r++;
        if (!hasLT(code.slice(r))) { name = code.slice(0, n); rest = code.slice(r); }
      }
      if (name !== null && /^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      if (name !== null && /^[A-Z][A-Z0-9-]*$/.test(name)) {
        const { body, found } = attrs(rest); const at = new Map();
        for (const [kk, v] of found) at.set(kk, at.has(kk) && at.get(kk) ? at.get(kk) + ' ' + v : v);
        cur = { name, args: body, at, cont: [] }; ast.push(cur); continue;
      }
      if (cur) cur.cont.push(code);
      continue;
    }
    if (!cur) continue;
    const { body, found } = attrs(code); const at = new Map();
    for (const [kk, v] of found) at.set(kk, at.has(kk) && at.get(kk) ? at.get(kk) + ' ' + v : v);
    for (const [kk, v] of at) cur.at.set(kk, v);
    cur.cont.push(body);
  }
  const out = [];
  for (const d of ast) { let s = d.name + (d.args ? ' ' + d.args : ''); for (const [kk, v] of d.at) s += ' ' + kk + ' ' + v; out.push(s); for (const c of d.cont) out.push('  ' + c); }
  return out.join('\n') + '\n';
}
const legacySha = (t) => sha(legacyPrint(t));
function sirLinesRef(text) {
  const lines = []; let cur = '';
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '\r') { lines.push(cur); cur = ''; if (text[i+1] === '\n') i++; } else if (c === '\n') { lines.push(cur); cur = ''; } else cur += c; }
  lines.push(cur);
  return lines.map((l) => { let k = 0; while (k < l.length && (isST(l[k]) || l[k] === '\ufeff')) k++; l = l.slice(0, k).replace(/\ufeff/g, '') + l.slice(k); let e = l.length; while (e > 0 && isST(l[e-1])) e--; return l.slice(0, e); });
}
const DN = /^[A-Z][A-Z0-9-]*$/;
function nameOf(line) { let sp = 0; while (sp < line.length && !isST(line[sp])) sp++; let n = line.slice(0, sp); if (/^[A-Z][A-Z0-9-]*:$/.test(n) && n !== 'CITED:') n = n.slice(0, -1); return { n, rest: line.slice(sp) }; }
function kind(line) {
  if (!line) return 'blank';
  let k = 0; while (k < line.length && isST(line[k])) k++;
  if (line[k] === '#') return 'comment';
  if (k) return 'other';
  const { n } = nameOf(line); return DN.test(n) && n !== 'CITED' ? 'directive' : 'other';
}
function boundOf(text) {
  const L = sirLinesRef(text);
  const i = L.findIndex((l) => kind(l) === 'directive' && nameOf(l).n === 'PRIMARY-SHA256'); if (i < 0) return null;
  for (let j = i + 1; j < L.length; j++) { const k = kind(L[j]); if (k === 'directive') break; if (k === 'other') return null; }
  let { rest } = nameOf(L[i]);
  for (let j = 0; j < rest.length; j++) if (rest[j] === '#' && isST(rest[j-1]) && (j + 1 === rest.length || isST(rest[j+1]))) { rest = rest.slice(0, j); break; }
  rest = rest.replace(/^[ \t]+|[ \t]+$/g, '');
  return /^[0-9a-f]{64}$/.test(rest) ? rest : null;
}

function bindingRef(L, P) {
  const bound = boundOf(L);
  if (P === null) return { status: 'no-primary', bound, primarySha: null };
  const primarySha = canonSha(P);
  if (!bound) return { status: 'unbound', bound, primarySha };
  if (bound === primarySha) return { status: 'ok', bound, primarySha };
  return { status: primarySha !== null && bound === legacySha(P) ? 'legacy' : 'stale', bound, primarySha };
}

const STRIP_P = "UNIT strip\nKIND FUNCTIONAL\nFIDELITY package\nANCHOR colors@1.4.0 lib/colors.js colors.strip (alias colors.stripColors); reproduce the package exactly, including\n  its narrow notion of a color code (R2) and its single non-rescanning pass (R4)\nORACLE-CLASS deterministic\nSIG strip(str: text) -> text\nENVELOPE str is any text (any sequence of Unicode scalar values, empty included). Non-text arguments are outside the\n  abstract envelope; the js language file widens to them.\nDEPENDS-ON none\nDESCRIPTION Remove the single-parameter SGR color codes (ESC \"[\" decimal digits \"m\") that colors.js itself emits, leaving\n  every other character of the text untouched. It is NOT a general ANSI stripper: combined SGR (\"ESC[1;31m\"), other CSI\n  sequences (\"ESC[2J\") and OSC sequences (\"ESC]0;title BEL\") pass through unchanged.\nBEHAVIOR\nR1 The result is the input text with every CODE occurrence (R2, R3) removed; every other character is kept, in order,\n  unchanged. A text containing no CODE is returned as is; the empty text yields the empty text.\nR2 A CODE is a contiguous span matching the grammar CODE (PINNED below): the ESCAPE character U+001B, then \"[\" (U+005B),\n  then one or more ASCII decimal digits, then a lowercase \"m\" (U+006D). The digit run has no length limit and leading\n  zeros are allowed (\"ESC[0000m\" is a CODE). No parameter separator, no other final letter, no uppercase \"M\", no\n  non-ASCII digit, and no empty digit run.\n  CITED FIDELITY package — the package removes only this single-parameter SGR form; combined SGR, other CSI and OSC survive\nR3 Occurrences are found leftmost-first and do not overlap: scanning from the start, at each position where a CODE\n  begins, the whole CODE (the digit run taken in full) is removed and scanning resumes immediately after its \"m\".\n  Where no CODE begins, the character is kept and scanning moves on by one character.\nR4 The removal is ONE pass and is never repeated: a CODE that only comes into existence because a removal joined the\n  text around it is kept (\"ESC[\" + \"ESC[1m\" + \"31m\" yields \"ESC[31m\").\n  CITED FIDELITY package — a single global replacement, not a fixed-point loop\nPINNED grammar CODE = ESC \"[\" DIGIT+ \"m\" CITED R2 — colors@1.4.0 strip; ESC = U+001B, \"[\" = U+005B, DIGIT = one of U+0030..U+0039 (the ten ASCII digits only), \"m\" = U+006D only; a C1 CSI U+009B does not begin a CODE\nINVARIANT the result never contains a CODE that was present in the input; its length is the input's length minus the\n  total length of the removed CODE spans; text with no U+001B is returned unchanged.\nORACLE value -> oracles/strip.json  CANONICAL-SHA256 3031c4efda7c0d0773494b40241bafbbcfe005038b0c7e2de24b61ec44b11379\nNOTE 10 frozen + 10 held-out, captured once from the real package, never regenerated. Three of them (a number, none, a\n  bool as the argument) are outside the abstract SIG and are graded only through the js widening.\nSCOPE IN: R1-R4 over any text. OUT: the rest of colors.js (styles, themes, enable/disable, the String prototype\n  extensions); non-text arguments (the js file's widening); ANSI sequences beyond R2 (deliberately kept, R2).\nPROVENANCE colors@1.4.0 (Marak/colors.js, MIT), pkgs/node_modules/colors/lib/colors.js, colors.strip = colors.stripColors.\n  Migrated 2026-10-28 from the shipped v0.1 bundle @rederive/colors into the v0.5 contract register; every rule was\n  checked against the real package on a seeded 200000-text sample plus targeted probes (0 mismatches).\n";
const STRIP_L = "UNIT strip\nLANG js\nPRIMARY-SHA256 2749032c7a18955a230232736dc89e388f657fce21c7ee5f08b5a47f9687e5f4\nSIG export function strip(str)\nNOTE named export `strip` (the shipped control also re-exports it as `stripColors`; only `strip` is graded).\nABI text = string (UTF-16 code units). Every character of CODE is a single ASCII code unit, so scanning code units is\n  identical to scanning code points; a surrogate pair is never split or touched. Result: a string. The artifact is an ES\n  module that imports nothing and must not require the package.\nENVELOPE js WIDENS str to any JS value: it is first converted to a string by string concatenation with the empty string\n  ('' + str, ToPrimitive with the default hint), then R1-R4 apply. Hence 42 -> \"42\", null -> \"null\", true -> \"true\",\n  undefined -> \"undefined\", -0 -> \"0\", an array -> its elements joined by \",\" (codes inside them then stripped), a\n  plain object -> \"[object Object]\", an object whose valueOf returns a primitive -> that primitive's string (valueOf\n  wins over toString), a bigint -> its digits; a symbol THROWS a TypeError. A lone surrogate is kept like any other\n  character.\nMECHANISM R1-R4 = one call str.replace(CODE_RE, '') on the coerced string: the g flag gives R3's leftmost,\n  non-overlapping, resume-after-match scan and replace's single pass gives R4. \\d in a regex without the u flag (and\n  with it) is ASCII-only, matching DIGIT.\nMECHANISM coercion = ('' + str). Do NOT use String(str) or a template literal: those use the string hint (toString wins\n  over valueOf) and String(symbol) does not throw.\nDEPENDS-ON none\nPINNED regex CODE_RE = /\\x1B\\[\\d+m/g CITED R2 — the package's own pattern; its accept-set is the grammar CODE\nPROVENANCE colors@1.4.0 lib/colors.js (Marak/colors.js, MIT); the shipped control runs/js/emit_0.mjs exports\n  `export function strip`. Language file cut 2026-10-28 with the primary.\n";
const ISN_P = "UNIT is_number\nKIND FUNCTIONAL\nFIDELITY package\nANCHOR is-number@7.0.0 — reproduce the package exactly, accidents included (R4)\nORACLE-CLASS deterministic\nSIG is_number(x: f64 | text | bool | none) -> bool\nENVELOPE a JS-shaped value space: numbers (incl. NaN, ±Infinity, -0), text, booleans, none. Objects and boxed wrappers are\n  representable only in the js variant (see its ENVELOPE narrowing); other languages verify the numeric/text/bool/none subset.\nDEPENDS-ON none\nDESCRIPTION Decide whether a value is a finite number, or text that parses as one.\nBEHAVIOR\nR1 a primitive number that is finite -> true; NaN and ±Infinity -> false. (-0 is finite -> true.)\nR2 primitive text that is non-empty after trimming whitespace and parses as a finite number -> true.\nR3 everything else -> false (booleans, none, non-numeric or empty text).\nR4 a boxed wrapper (a Number object, a String object) is not a primitive -> R3 -> false. CITED FIDELITY package — the primitive/boxed accident of is-number@7.0.0 (js-only; outside other languages' envelope)\nINVARIANT the result is a boolean for every input in the envelope.\nORACLE value -> oracles/is_number.json  CANONICAL-SHA256 35a0059cdc9f6f5bc9a341a13797d7eb6d3aee5c843b4bcdd000782c069478f4\nNOTE 16 frozen + 13 held-out from the shipped @rederive/is-number bundle (captured from the real package); carries NaN, ±Infinity\n  and -0 as v0.4 codec tags — the NaN-rule validation unit; re-ENCODED as sir-canonical-v1, never regenerated\nSCOPE IN: R1–R4. OUT: anything is-number@7.0.0 does not do.\nPROVENANCE is-number@7.0.0 (jonschlinkert/is-number, MIT); shipped bundle @rederive/is-number (quorum 3/3, differential 400/400).\n  Re-cut 2026-09-22 into the v0.5 contract register (the plan's own illustration) as the NaN / signed-zero / infinity test unit.\n";
const ISN_L = "UNIT is_number\nLANG js\nPRIMARY-SHA256 4aa5cea5898114eaa972bfdabdbef768883df47088f71c660abd5ef57181df4f\nSIG isNumber(num: any): boolean\nNOTE default export\nABI f64=number (finite ⇔ neither NaN nor ±Infinity; -0 is a distinct finite value); text=UTF-16 string; bool=boolean; none=null|undefined.\n  \"primitive\" (R1, R2, R4) = typeof; boxed wrappers are typeof 'object'. \"parses as a number\" (R2) = numeric coercion of the\n  trimmed string (+s / Number(s)); \"trimmed\" = String.prototype.trim.\nENVELOPE js widens the primary's envelope to any JS value: objects, arrays, functions and boxed wrappers are in scope here (R3/R4).\nDEPENDS-ON none\nPROVENANCE the shipped @rederive/is-number src (runs/js/emit_1.mjs), verified-recompose quorum 3/3, differential 400/400.\n";

// ---------- the generator ----------
const hexOf = (rnd, n = 64) => { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(rnd() * 16)]; return s; };
const setHash = (L, h) => L.replace(/^PRIMARY-SHA256 .*$/m, 'PRIMARY-SHA256 ' + h);
const langFor = (h, unit = 'u') => `UNIT ${unit}\nLANG js\nPRIMARY-SHA256 ${h}\nSIG ${unit}(x: string): string\nDEPENDS-ON none\n`;
const crlf = (t) => t.replace(/\n/g, '\r\n');
const cr = (t) => t.replace(/\n/g, '\r');
const trailWs = (t) => t.split('\n').map((l, i) => (l && i % 2 ? l + ' \t ' : l)).join('\n');
const blanks = (t) => t.split('\n').map((l, i) => (i % 3 === 1 ? l + '\n   \t\n' : l)).join('\n');
const reindent = (t, ind) => t.split('\n').map((l) => l.replace(/^ +/, ind)).join('\n');
const bomLines = (t) => '\ufeff' + t.split('\n').map((l, i) => (i % 4 === 2 && /^ /.test(l) ? '\ufeff' + l : l)).join('\n');
const editWord = (t) => t.replace(/ the /, ' a ');
const addComment = (t) => t.replace(/\nDEPENDS-ON/, '\n# a comment line\nDEPENDS-ON');
const addTrailingComment = (t) => t.replace(/\nDEPENDS-ON none/, '\nDEPENDS-ON none # trailing');
const addNbspLine = (t) => t.replace(/\nDEPENDS-ON/, '\n\u00a0\nDEPENDS-ON');

const LEGACY_EDGES = [
  'PINNED a = 1 CITED first\n  more text CITED second\n  tail ANCHOR anc\n',
  'R1 one CITED b\u2028 ANCHOR c\n',
  'DESCRIPTION a\nprose at column zero  \n  indented\n',
  '  orphan line\nUNIT x\n',
  '\ufeffUNIT x\nKIND FUNCTIONAL\n',
  'UNIT x\n\u00a0\n\u00a0# not a comment\n',
  'SIG f # a comment\nNOTE x #y stays\nNOTE a\t#\tb\n',
  'UNIT a\rb\nKIND k\n',
  'UNIT: x\nR1: rule\n',
  'R1 x CITED  \nR2 y CITED \nR3 z CITED\n',
  'UNIT a\u2028b\nKIND k\n',
  'UNIT x\n\t# indented comment\n    four spaces\n\tTab\n',
  'UNIT x\r\r\nKIND y\r\n',
  'R1 a CITED b\n  c EARNED d\n  e CITED f\n',
  'UNIT x\nR1 \u00a0lead nbsp CITED \u00a0v\u00a0\n',
];

function pairs(rnd) {
  const out = [];
  const P1 = STRIP_P, L1 = STRIP_L, P2 = ISN_P, L2 = ISN_L;
  const c1 = canonSha(P1), c2 = canonSha(P2), g1 = legacySha(P1), g2 = legacySha(P2);
  // real families, bound
  out.push([L1, P1], [L2, P2]);
  // formatting-only edits stay ok
  out.push([L1, crlf(P1)], [L2, cr(P2)], [L2, trailWs(P2)], [L2, blanks(P2)],
    [L2, bomLines(P2)]);
  // content edits stale
  out.push([L2, editWord(P2)], [L2, addComment(P2)], [L2, addNbspLine(P2)]);
  // a stale hash
  out.push([setHash(L2, hexOf(rnd)), P2]);
  // legacy-bound files; legacy survives the edits the old printer ignored
  out.push([setHash(L2, g2), P2], [setHash(L2, g2), addComment(P2)],
    [setHash(L2, g2), addNbspLine(P2)], [setHash(L2, g2), editWord(P2)]);
  // the binding is read through the parser: the FIRST PRIMARY-SHA256 directive, 64 lowercase hex, nothing attached
  const R = (to) => L2.replace(/^PRIMARY-SHA256 /m, to);
  out.push([L2.replace(/^PRIMARY-SHA256 .*\n/m, ''), P2], [setHash(L2, c2.toUpperCase()), P2], [setHash(L2, c2.slice(0, 63)), P2],
    [R('  PRIMARY-SHA256 '), P2], [R('PRIMARY-SHA256: '), P2], [R('PRIMARY-SHA256'), P2], [R('\ufeffPRIMARY-SHA256 '), P2]);
  // separators: space or tab only; the next line, NBSP, U+3000 and U+2028 do not separate
  out.push([R('PRIMARY-SHA256\t'), P2], [R('PRIMARY-SHA256\n  '), P2], [R('PRIMARY-SHA256\u00a0'), P2],
    [R('PRIMARY-SHA256\u2028'), P2], [L2.replace(/\nPRIMARY-SHA256 /, '\u2028PRIMARY-SHA256 '), P2], [L2.replace(/\nPRIMARY-SHA256 /, '\rPRIMARY-SHA256 '), P2]);
  // the 64 digits and what follows them; attributes, comments and continuations on the directive
  out.push([setHash(L2, c2 + '0'), P2], [setHash(L2, c2 + 'zz trailing'), P2], [setHash(L2, c2 + ' \t'), P2], [setHash(L2, c2 + ' # note'), P2],
    [setHash(L2, c2 + ' #note'), P2], [setHash(L2, c2 + ' CITED why'), P2], [setHash(L2, c2 + '\n  continued'), P2],
    [setHash(L2, c2 + '\n# a comment\n\n  # indented comment'), P2], [setHash(L2, c2 + '\nCITED x'), P2], [setHash(L2, c2 + '\nprose line'), P2],
    [setHash(L2, c2 + '\nSIG\u00a0glued'), P2], [setHash(L2, '"' + c2 + '"'), P2]);
  // two PRIMARY-SHA256 directives: the first decides
  out.push([setHash(L2, hexOf(rnd)) + 'PRIMARY-SHA256 ' + c2 + '\n', P2], [setHash(L2, c2.toUpperCase()) + 'PRIMARY-SHA256 ' + c2 + '\n', P2],
    [L2 + 'PRIMARY-SHA256 ' + hexOf(rnd) + '\n', P2], [setHash(L2, '') + 'PRIMARY-SHA256 ' + c2 + '\n', P2]);
  // primary none
  out.push([L2, null]);
  // lone surrogates in the primary: canonical text refuses, primarySha is none
  const S1 = P2.replace('number', 'num\ud800ber'), S2 = 'UNIT x\nNOTE \udc00 trail\n', S3 = 'UNIT x\nNOTE ok \ud83d\n';
  out.push([L2, S1], [langFor(hexOf(rnd)), S2], [langFor(legacySha(S2)), S2], [langFor(legacySha(S3)), S3], ['UNIT u\nLANG js\n', S2]);
  // a lone surrogate in the language file is harmless
  out.push([langFor(canonSha(S3.replace('\ud83d', ''))).replace('LANG js', 'LANG js \udfff'), S3.replace('\ud83d', '')]);
  // degenerate texts
  const EMPTY = sha(''), NL = sha('\n');
  out.push([langFor(EMPTY), ''], [langFor(NL), ''], [langFor(EMPTY), ' \n\t\n\r\n'], [langFor(NL), '# just a comment\n'], [langFor(NL), '\u00a0']);
  // canonical text equals the legacy print: ok wins
  out.push([langFor(sha('UNIT x\n')), 'UNIT x\n']);
  // the legacy parse and print, edge by edge (bound to the legacy hash, and an edited copy kept stale)
  for (const e of LEGACY_EDGES) out.push([langFor(legacySha(e)), e]);
  // stratify: the frozen slice (the first 24) takes every third case of every family
  return [0, 1, 2].flatMap((k) => out.filter((_, i) => i % 3 === k));
}

const FRAG = ['UNIT', 'KIND', 'R1', 'R2:', 'NOTE', 'PINNED', 'x', 'value', 'CITED', 'EARNED', 'ANCHOR', '#', '# ', ' ', '  ', '\t', '\n', '\n', '\n', '\r\n', '\r',
  '\u2028', '\u00a0', '\ufeff', '\u3000', 'a', '=', 'b c', '\u00e9', '\ud83d\ude00', ':', '-'];
function randomPrimary(rnd) { let s = ''; const n = 3 + Math.floor(rnd() * 30); for (let k = 0; k < n; k++) s += FRAG[Math.floor(rnd() * FRAG.length)]; return s; }

export function genInputs(n, rnd) {
  const out = pairs(rnd);
  while (out.length < n) {
    const r = rnd(); const base = rnd() < 0.5 ? ISN_P : randomPrimary(rnd);
    const P = rnd() < 0.15 ? base.replace(/a/, '\ud800') : base;
    const pick = rnd();
    const h = pick < 0.3 ? canonSha(P) : pick < 0.6 ? legacySha(P) : pick < 0.75 ? hexOf(rnd) : null;
    let L = h ? langFor(h) : 'UNIT u\nLANG js\nSIG u(): string\n';
    if (h && rnd() < 0.2) L = L.replace('PRIMARY-SHA256 ', 'PRIMARY-SHA256\n\t');
    let Q = P;
    if (r < 0.15) Q = crlf(P); else if (r < 0.25) Q = trailWs(P); else if (r < 0.35) Q = reindent(P, '\t'); else if (r < 0.45) Q = P + '\n# note\n'; else if (r < 0.5) Q = null;
    out.push([L, Q]);
  }
  return out.slice(0, Math.max(n, out.length));
}
