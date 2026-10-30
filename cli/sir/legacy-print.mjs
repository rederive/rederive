import { createHash } from 'node:crypto';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const DIRECTIVES = {
  UNIT: 'B:lb', SIR: 'P:legacy', KIND: 'P:lb', FIDELITY: 'P:lb', VARIANT: 'P:legacy', ANCHOR: 'P:lb', SRC: 'P:lb', TRIGGER: 'P:lb', REACH: 'P:lb',
  'ORACLE-CLASS': 'P:lb', 'TRACE-SEAM': 'P:lb', SEAM: 'P:lb', SIG: 'B:lb', ENVELOPE: 'B:lb', 'DEPENDS-ON': 'B:lb', DESCRIPTION: 'B:pr',
  BEHAVIOR: 'P:lb', INVARIANT: 'P:pr', TABLE: 'P:lb', PINNED: 'B:lb', EARNED: 'B:lb', NOTE: 'B:pr', RATIONALE: 'B:pr', SCOPE: 'P:pr',
  'UNGUARDED-PRECONDITION': 'P:lb', 'OUT-OF-DOMAIN': 'P:lb', ORACLE: 'P:lb', PROVENANCE: 'B:pr', CARRIED: 'B:lb', SHAPE: 'P:lb',
  'CANONICAL-SHA256': 'P:lb', AUTHORITY: 'P:lb', 'CARRIED-DATA': 'P:legacy', STATE: 'P:lb', EMIT: 'P:lb', REQUEST: 'P:lb', BRANCH: 'P:lb',
  'ON-ERROR': 'P:lb', PAR: 'P:lb', RING: 'P:lb', LIFECYCLE: 'P:lb', EFFECT: 'P:lb', SURFACE: 'P:lb', NOTES: 'P:legacy', 'GUARD-PINNED': 'P:legacy',
  LANG: 'L:lb', 'PRIMARY-SHA256': 'L:lb', ABI: 'L:lb', MECHANISM: 'L:lb',
};
// FROZEN: sir-parse.mjs exactly as of rederive 20bdd3dd041a (the pinned round-0 authority), when every PRIMARY-SHA256 hashed
// sha256(print(parse(text))). It exists ONLY so a verifier can recognize a binding written then (W_LEGACY_BINDING) after the
// live parser moved on: never edit it, never use it to read a SIR. The live parser is ./sir-parse.mjs.

const isDirectiveName = (w) => /^(?:[A-Z][A-Z0-9-]*|R\d+)$/.test(w);
// comment marker (legacy): `#` at line start, or ` #` followed by space/EOL — NOT `#(` `#[` `#f` inside regex literals / hex
const splitTrailingComment = (s) => { const m = s.match(/^(.*?)(?:^|\s)#(?=\s|$)(.*)$/); return m ? [m[1].replace(/\s+$/, ''), m[2].trim()] : [s, null]; };

function parse(text, { mode = 'legacy' } = {}) {
  const lines = text.split('\n'); const ast = []; const errors = [], warnings = []; const indents = new Map(); let cur = null;
  const attrsOf = (rest) => { const attrs = {}; let body = rest; const re = /\s+(CITED|EARNED|ANCHOR)\s+(.+)$/; let m; while ((m = body.match(re))) { attrs[m[1]] = (attrs[m[1]] ? attrs[m[1]] + ' ' : '') + m[2].trim(); body = body.slice(0, m.index); } return { body: body.trim(), attrs }; };
  lines.forEach((raw, i) => {
    const ln = i + 1; const line = raw.replace(/\r$/, '');
    if (!line.trim()) return;
    const indent = line.match(/^[ \t]*/)[0];
    if (indent) indents.set(indent.includes('\t') ? 'tab' : `${indent.length}sp`, (indents.get(indent.includes('\t') ? 'tab' : `${indent.length}sp`) || 0) + 1);
    const content = line.slice(indent.length);
    if (content.startsWith('#')) {   // full-line comment
      if (mode === 'strict') errors.push({ line: ln, code: 'E_COMMENT', msg: 'comments are not part of the grammar; use DESCRIPTION / NOTE / RATIONALE' });
      else { warnings.push({ line: ln, code: 'W_LEGACY_COMMENT' }); if (cur) cur.comments.push(content.replace(/^#+\s?/, '')); else ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, cont: [], comments: [content], line: ln, register: null, kind: 'comment' }); }
      return;
    }
    const [code, trailing] = splitTrailingComment(content);
    if (trailing !== null) { if (mode === 'strict') errors.push({ line: ln, code: 'E_COMMENT', msg: 'trailing comment; make it a CITED/EARNED attribute or a NOTE' }); else warnings.push({ line: ln, code: 'W_LEGACY_TRAILING_COMMENT' }); }
    if (!indent) {   // column 0: a directive line?
      let m = code.match(/^(\S+)(?:\s+(.*))?$/); let name = m?.[1];
      if (name && /^[A-Z][A-Z0-9-]*:$/.test(name)) { name = name.slice(0, -1); m = [m[0], name, m[2]]; if (mode === 'strict') errors.push({ line: ln, code: 'E_LEGACY_COLON', msg: name }); else warnings.push({ line: ln, code: 'W_LEGACY_COLON', msg: name }); }   // `UNIT: hashSync` (bcryptjs) — a dialect drift
      if (name && isDirectiveName(name)) {
        const entry = DIRECTIVES[name] ?? (/^R\d+$/.test(name) ? 'P:lb' : null);
        if (!entry) warnings.push({ line: ln, code: 'W_UNKNOWN_DIRECTIVE', msg: name });
        const { body, attrs } = attrsOf(m[2] ?? '');
        cur = { directive: name, name, args: body, attrs, cont: [], comments: trailing !== null ? [trailing] : [], line: ln, register: entry ? entry.split(':')[0] : null, kind: entry ? entry.split(':')[1] : 'unknown' };
        ast.push(cur); return;
      }
      // column-0 line that is not a directive: legacy prose (e.g. a wrapped ENVELOPE) → continuation of the previous directive
      if (cur) { cur.cont.push(code); if (mode === 'strict') errors.push({ line: ln, code: 'E_UNINDENTED_CONTINUATION', msg: code.slice(0, 40) }); else warnings.push({ line: ln, code: 'W_UNINDENTED_CONTINUATION' }); }
      else errors.push({ line: ln, code: 'E_NO_DIRECTIVE', msg: code.slice(0, 40) });
      return;
    }
    if (!cur) { errors.push({ line: ln, code: 'E_ORPHAN_CONTINUATION', msg: code.slice(0, 40) }); return; }
    const { body, attrs } = attrsOf(code); Object.assign(cur.attrs, attrs); cur.cont.push(body); if (trailing !== null) cur.comments.push(trailing);
  });
  return { ast, errors, warnings, indents: Object.fromEntries(indents) };
}
/** Canonical print: directive at column 0, continuations at 2 spaces, attributes trailing, no comments. Hashes bind to THIS. */
function print(ast) {
  const out = [];
  for (const d of ast) { if (d.kind === 'comment') continue; const attrs = Object.entries(d.attrs).map(([k, v]) => ` ${k} ${v}`).join('');
    out.push(`${d.name}${d.args ? ' ' + d.args : ''}${attrs}`); for (const c of d.cont) out.push('  ' + c); }
  return out.join('\n') + '\n';
}
export const legacyPrintSha = (text) => sha256(print(parse(text).ast));
