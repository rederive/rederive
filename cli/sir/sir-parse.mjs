// SIR parser — ONE canonical parse for every consumer (stamp, pack, rdv, payload, the lab, Jev Seam 3 reads the AST).
// Modes: 'legacy' tolerates `#` comments (reported as warnings; needed to read the shipped corpus) · 'strict' = the v0.5
// register: no `#` in the grammar at all (a parse ERROR outside a literal); prose lives in DESCRIPTION / NOTE / RATIONALE;
// citations are structured attributes (CITED …, EARNED …). Indentation-insensitive: column-0 directive lines, any
// indented line is a continuation (tabs, 2 or 4 spaces alike). The canonical printer defines the one layout (sir-fmt).
// BINDINGS hash canonicalText (below), not the printer: formatting can never stale a binding, and no content edit escapes one.
import { createHash } from 'node:crypto';
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// The directive table — the §23a vocabulary freeze lives HERE (name → register, kind). Unknown names are reported.
// register: P = primary, L = language file, B = both. kind: lb = load-bearing (a claim), pr = unverified prior (prose), legacy.
export const DIRECTIVES = {
  UNIT: 'B:lb', SIR: 'P:legacy', KIND: 'P:lb', FIDELITY: 'P:lb', VARIANT: 'P:legacy', ANCHOR: 'P:lb', SRC: 'P:lb', TRIGGER: 'P:lb', REACH: 'P:lb',
  'ORACLE-CLASS': 'P:lb', 'TRACE-SEAM': 'P:lb', SEAM: 'P:lb', SIG: 'B:lb', ENVELOPE: 'B:lb', 'DEPENDS-ON': 'B:lb', DESCRIPTION: 'B:pr',
  BEHAVIOR: 'P:lb', INVARIANT: 'P:pr', TABLE: 'P:lb', PINNED: 'B:lb', EARNED: 'B:lb', NOTE: 'B:pr', RATIONALE: 'B:pr', SCOPE: 'P:pr',
  'UNGUARDED-PRECONDITION': 'P:lb', 'OUT-OF-DOMAIN': 'P:lb', ORACLE: 'P:lb', PROVENANCE: 'B:pr', CARRIED: 'B:lb', SHAPE: 'P:lb',
  'CANONICAL-SHA256': 'P:lb', AUTHORITY: 'P:lb', 'CARRIED-DATA': 'P:legacy', STATE: 'P:lb', EMIT: 'P:lb', REQUEST: 'P:lb', BRANCH: 'P:lb',
  'ON-ERROR': 'P:lb', PAR: 'P:lb', RING: 'P:lb', LIFECYCLE: 'P:lb', EFFECT: 'P:lb', SURFACE: 'P:lb', NOTES: 'P:legacy', 'GUARD-PINNED': 'P:legacy',
  LANG: 'L:lb', 'PRIMARY-SHA256': 'L:lb', ABI: 'L:lb', MECHANISM: 'L:lb',
};
export const isDirectiveName = (w) => /^(?:[A-Z][A-Z0-9-]*|R\d+)$/.test(w);
// ONE whitespace rule (selfhost sir_parse/directive #43, 2026-10-26): a space or a tab separates and trims, everywhere — names,
// attribute groups, the comment marker, value trims, blank lines. Any other whitespace (NBSP, U+2028, U+3000 …) is content.
const trimWS = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
// QUOTED SPANS (selfhost #59 #60, round 4): ONE rule for every reader that protects a literal (the comment split, the
// attribute split, the leak lint's strip). A span opens at a `"` that STARTS a token — line start, or after a space, tab, or
// one of ( [ { , = : — and closes at the next unescaped `"`; an escape pair is a backslash and any ONE code point (U+2028
// included: the old regex had no s flag, so `"a\<U+2028>" # b "c"` lost its pairing and kept the comment). An inch mark
// (`12" wide`) or a quote inside a pattern (`/"/`) opens nothing; an unclosed quote protects nothing.
// Round 5 (#75, #107): the opener set — space, tab, ( [ { , = : ; | <
// > ! & - ~ — and a quote directly after a closed span opens the next ("a""b" is two literals). `/` is not an opener (a
// quote inside a pattern, `/"/`, protects nothing), nor a letter or digit (an inch mark, `12"`).
const OPENERS = ' \t([{,=:;|<>!&-~';   // round 5b (#107): not * + ? — regex quantifiers, so `/"(?:a|b)*"/ CITED R5` hid its CITED
export const quotedSpans = (s) => {
  const spans = []; let closedAt = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '"' || !(i === 0 || OPENERS.includes(s[i - 1]) || i === closedAt)) continue;
    let j = i + 1; while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 1 + (s.codePointAt(j + 1) > 0xffff ? 2 : 1) : 1;
    if (j >= s.length) break;   // unclosed — and no later quote can close either (the scan reached the end)
    spans.push([i, j + 1]); i = j; closedAt = j + 1;
  }
  return spans;
};
const inSpan = (spans, i) => spans.some(([a, b]) => i > a && i < b);
// comment marker (legacy): `#` at line start, or a space/tab then `#` followed by a space/tab/EOL — NOT `#(` `#[` `#f` inside
// regex literals / hex, and never inside a quoted literal (`"x # y"` is data: the strict grammar bans `#` outside one)
export const splitTrailingComment = (s) => {
  const quoted = quotedSpans(s);
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '#' || !(i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t') || !(i + 1 === s.length || s[i + 1] === ' ' || s[i + 1] === '\t')) continue;
    if (inSpan(quoted, i)) continue;
    return [s.slice(0, i).replace(/[ \t]+$/, ''), trimWS(s.slice(i + 1))];
  }
  return [s, null];
};
// ATTRIBUTES (selfhost sir_parse #27, then #43): every `<KEYWORD> <value>` group after a space or tab is its own attribute —
// on the directive line exactly as on a continuation (`SIG CITED x` is SIG with CITED x, not SIG "CITED x"). A keyword that
// repeats keeps every value: `attrs[k]` joins the NON-EMPTY values with "; " (the shape every reader takes), and `attrList`
// keeps each occurrence in order, losslessly — `CITED a; b` and `CITED a CITED b` share a joined string, never a list.
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
// A keyword inside a quoted span is data (#60: `R1 "a CITED b" null` ended its content at the quoted CITED).
export const splitAttributes = (rest) => { const spans = quotedSpans(rest); const hits = [...rest.matchAll(ATTR)].filter((h) => !inSpan(spans, h.index + h[0].length - h[1].length)); if (!hits.length) return { body: trimWS(rest), list: [] };
  const list = hits.map((h, k) => [h[1], trimWS(rest.slice(h.index + h[0].length, k + 1 < hits.length ? hits[k + 1].index : rest.length))]);
  return { body: trimWS(rest.slice(0, hits[0].index)), list }; };
// a column-0 attribute keyword that is NOT itself a directive (EARNED and ANCHOR are; CITED is not) is an attribute line that
// lost its indent: a continuation of the directive above, never a directive of its own
export const ATTR_ONLY = new Set(['CITED']);
// a directive name glued to its arguments by whitespace that is not a space or tab (`BEHAVIOR\u00a0x`, `UNIT\u3000x`), or by an
// invisible format character (U+200B, U+2060, U+180E — #61: the JS \s set missed them, so they gave silent prose): not a
// directive under the one rule — and invisible in an editor, so it is REPORTED (an error in strict mode), never silently prose.
// The set is PINNED (round 5): Unicode White_Space other than space and tab, and General_Category Cf as of Unicode 17.0 — never
// the host's tables, which move with the Node version. A `NAME:` glued the same way is reported too (`R1:\u200bx`).
export const GLUE = '\\u000A-\\u000D\\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000' +
  '\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u180E\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF\\uFFF9-\\uFFFB' +
  '\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}';
const GLUED = new RegExp(`^(?:[A-Z][A-Z0-9-]*|R\\d+):?(?=[${GLUE}])`, 'u');
export const glued = (tok) => tok.match(GLUED)?.[0]?.replace(/:$/, '') ?? null;
// an invisible character BEFORE a column-0 directive name (`\u2060KIND k`) is reported too (round 5): the line reads as prose
export const INVISIBLE_LEAD = new RegExp(`^[${GLUE}]+(?=(?:[A-Z][A-Z0-9-]*|R\\d+)(?:[ \\t:${GLUE}]|$)|#)`, 'u');   // round 5b: a glued name after the lead, or a `#` (a comment hidden as content)

/** The ONE line splitter, shared by parse() and canonicalText() so the binding and the parser always see the same lines (the
 *  canonical_text re-derivation, 2026-10-26: when only the hash treated a lone CR as a break and ignored a BOM, a CR->LF edit
 *  changed a file's parse without changing its binding). A line ends at CRLF, CR or LF; leading U+FEFF marks on a line are
 *  not content (a BOM at position 0 no longer swallows line 1, and one after a blank line cannot survive a second pass). */
export const sirLines = (text) => text.split(/\r\n|\r|\n/).map((l) => l.replace(/^[ \t\uFEFF]+/, (lead) => lead.replace(/\uFEFF/g, '')).replace(/[ \t]+$/, ''));   // round 5 (#76, #99): every U+FEFF inside the leading run of spaces, tabs and marks is not content — one pass reaches the fixed point, so canonicalText stays idempotent   // trailing spaces/tabs: never content, for either (an unindented continuation kept them verbatim — the property test's catch)
export function parse(text, { mode = 'legacy' } = {}) {
  const lines = sirLines(text); const ast = []; const errors = [], warnings = []; const indents = new Map(); let cur = null;
  const addAttrs = (d, list) => { for (const [k, v] of list) { d.attrList.push([k, v]); d.attrs[k] = k in d.attrs ? [d.attrs[k], v].filter(Boolean).join('; ') : v; } };
  const continueWith = (code, trailing) => { const { body, list } = splitAttributes(' ' + code); addAttrs(cur, list); if (body) cur.cont.push(body); if (trailing !== null) cur.comments.push(trailing); };   // an empty piece (an attribute-only line) adds no continuation: no double space when joined
  const cut = (x) => Array.from(x).slice(0, 40).join('');   // diagnostics are cut at a code point, never mid-surrogate
  lines.forEach((raw, i) => {
    const ln = i + 1; const line = raw;
    if (!line) return;   // sirLines strips trailing spaces/tabs: only a line of spaces/tabs is blank (an NBSP-only line is content, as canonicalText keeps it)
    const indent = line.match(/^[ \t]*/)[0];
    if (indent) indents.set(indent.includes('\t') ? 'tab' : `${indent.length}sp`, (indents.get(indent.includes('\t') ? 'tab' : `${indent.length}sp`) || 0) + 1);
    const content = line.slice(indent.length);
    if (content.startsWith('#')) {   // full-line comment
      if (mode === 'strict') errors.push({ line: ln, code: 'E_COMMENT', msg: 'comments are not part of the grammar; use DESCRIPTION / NOTE / RATIONALE' });
      else { warnings.push({ line: ln, code: 'W_LEGACY_COMMENT' }); if (cur) cur.comments.push(content.replace(/^#+[ \t]?/, '')); else ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line: ln, register: null, kind: 'comment' }); }
      return;
    }
    const [code, trailing] = splitTrailingComment(content);
    if (trailing !== null) { if (mode === 'strict') errors.push({ line: ln, code: 'E_COMMENT', msg: 'trailing comment; make it a CITED/EARNED attribute or a NOTE' }); else warnings.push({ line: ln, code: 'W_LEGACY_TRAILING_COMMENT' }); }
    if (!indent) {   // column 0: a directive line?
      // the name ends at the first space or tab — one whitespace rule with indentation (an NBSP or U+2028 is content, not a separator)
      const sp = code.search(/[ \t]/); let name = sp < 0 ? code : code.slice(0, sp); const rest = sp < 0 ? '' : code.slice(sp);
      // the colon fix applies (and is reported) only where it yields a directive: `CITED: x` stays a continuation (#62)
      if (name && /^[A-Z][A-Z0-9-]*:$/.test(name) && !ATTR_ONLY.has(name.slice(0, -1))) { name = name.slice(0, -1); if (mode === 'strict') errors.push({ line: ln, code: 'E_LEGACY_COLON', msg: name }); else warnings.push({ line: ln, code: 'W_LEGACY_COLON', msg: name }); }   // `UNIT: hashSync` (bcryptjs) — a dialect drift
      if (name && isDirectiveName(name) && !ATTR_ONLY.has(name)) {
        const entry = DIRECTIVES[name] ?? (/^R\d+$/.test(name) ? 'P:lb' : null);
        if (!entry) warnings.push({ line: ln, code: 'W_UNKNOWN_DIRECTIVE', msg: name });
        const { body, list } = splitAttributes(rest);   // `rest` keeps its leading space/tab: a keyword first on the line splits too
        cur = { directive: name, name, args: body, attrs: {}, attrList: [], cont: [], comments: trailing !== null ? [trailing] : [], line: ln, register: entry ? entry.split(':')[0] : null, kind: entry ? entry.split(':')[1] : 'unknown' };
        addAttrs(cur, list); ast.push(cur); return;
      }
      const g = glued(name) ?? (INVISIBLE_LEAD.test(code) ? code.match(INVISIBLE_LEAD)[0] : null);
      if (g) { const lead = INVISIBLE_LEAD.test(code) && !glued(name); const cp = lead ? code.codePointAt(0) : name.codePointAt(name.indexOf(g) + g.length + (name[g.length] === ':' ? 1 : 0));
        const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
        (mode === 'strict' ? errors : warnings).push({ line: ln, code: mode === 'strict' ? 'E_NAME_SEPARATOR' : 'W_NAME_SEPARATOR', msg: lead ? `the line starts with ${hex} (whitespace or an invisible character) before ${code.slice(code.match(INVISIBLE_LEAD)[0].length).startsWith('#') ? 'a comment marker: not a comment' : `a directive-shaped name: not ${ATTR_ONLY.has(code.slice(code.match(INVISIBLE_LEAD)[0].length).match(/^[A-Z0-9-]+/)?.[0]) ? 'an attribute' : 'a directive'}`}` : `${g} is followed by ${hex}, not a space or tab: not ${ATTR_ONLY.has(g) ? 'an attribute' : 'a directive'}` }); }
      // column-0 line that is not a directive: legacy prose (e.g. a wrapped ENVELOPE) → continuation of the previous directive
      if (cur) { continueWith(code, trailing);   // read like an indented continuation (attributes, trim, comment)
        if (mode === 'strict') { if (!g) errors.push({ line: ln, code: 'E_UNINDENTED_CONTINUATION', msg: cut(code) }); } else warnings.push({ line: ln, code: 'W_UNINDENTED_CONTINUATION' }); }
      else if (!(g && mode === 'strict')) errors.push({ line: ln, code: 'E_NO_DIRECTIVE', msg: cut(code) });
      return;
    }
    if (!cur) { errors.push({ line: ln, code: 'E_ORPHAN_CONTINUATION', msg: cut(code) }); return; }
    continueWith(code, trailing);
  });
  return { ast, errors, warnings, indents: Object.fromEntries(indents) };
}
/** Canonical print: directive at column 0, continuations at 2 spaces, attributes trailing, no comments. Hashes bind to THIS. */
export function print(ast) {
  const out = [];
  for (const d of ast) { if (d.kind === 'comment') continue; const attrs = Object.entries(d.attrs).map(([k, v]) => (v ? ` ${k} ${v}` : ` ${k}`)).join('');
    out.push(`${d.name}${d.args ? ' ' + d.args : ''}${attrs}`); for (const c of d.cont) out.push('  ' + c); }
  return out.join('\n') + '\n';
}
/** The BINDING normal form (SIR v0.5 §23b) — what PRIMARY-SHA256 hashes. A line normalization over sirLines() — the parser's
 *  own lines — never a re-print: the only freedoms are formatting ones the parser also ignores — line endings (CRLF / CR /
 *  LF), leading U+FEFF marks on a line, trailing spaces and tabs, lines of only spaces and tabs, and the width/style of a
 *  line's leading run of spaces and tabs (→ two spaces). Every other character counts, comments included. No lines → ''.
 *  Idempotent, and equal hashes mean equal parses: the same AST, errors and warnings (source line numbers and indentation
 *  statistics may differ). See cli/sir/sir-parse.test.mjs. Replaced the print(parse()) hash on 2026-10-26: rederive's own
 *  re-derivation (selfhost/units/canonical_print) showed the printer was not idempotent and dropped content — a later
 *  CITED overwrote an earlier one, legacy ` # ` stripping cut literals, orphan lines vanished — so edits there never staled
 *  a binding. */
export function canonicalText(text) {
  const out = [];
  if (!text.isWellFormed()) throw new Error('not well-formed Unicode (a lone surrogate): UTF-8 cannot carry it, and every lone surrogate would hash alike');
  for (const raw of sirLines(text)) {
    const line = raw.replace(/[ \t]+$/, ''); if (!line) continue;
    const indent = line.match(/^[ \t]+/); out.push(indent ? '  ' + line.slice(indent[0].length) : line);
  }
  return out.length ? out.join('\n') + '\n' : '';
}
export const canonicalSha = (text) => sha256(canonicalText(text));
// The pre-2026-10-26 binding (sha256(print(parse(text)))) lives FROZEN in ./legacy-print.mjs: recognizing an old binding must
// not depend on how this parser evolves.
export const get = (ast, name) => ast.find((d) => d.name === name) ?? null;
export const all = (ast, name) => ast.filter((d) => d.name === name);
