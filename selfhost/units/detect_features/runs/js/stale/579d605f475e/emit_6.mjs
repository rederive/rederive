const REG = new Set(['js', 'ts', 'rust', 'php', 'csharp', 'python']);
const TRIM = /^[ \t]+|[ \t]+$/g;
const QUOTED = /"(?:\\.|[^"\\])*"/g;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const HIDDEN_TAIL = /\.sir[\p{White_Space}\p{Cc}\p{Cf}]+$/iu;
const LANG_SUFFIX = /\.([^./\\]*)\.sir$/i;
const REF = /\bref\(\s*([a-z][a-z0-9]*):/g;
const trimSp = (s) => s.replace(TRIM, '');
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function suffix(p) {
  const base = trimSp(p.split(/[\\/]/).pop());
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden');
  const m = LANG_SUFFIX.exec(base);
  if (!m) return null;
  if (m[1] === '') throw new Error('empty');
  return m[1];
}

function split(piece, d) {
  const ms = [...piece.matchAll(ATTR)];
  if (!ms.length) return trimSp(piece);
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const start = m.index + m[0].length;
    const end = i + 1 < ms.length ? ms[i + 1].index : piece.length;
    const kw = m[1];
    if (!d.attrs.has(kw)) d.attrs.set(kw, []);
    d.attrs.get(kw).push(trimSp(piece.slice(start, end)));
  }
  return trimSp(piece.slice(0, ms[0].index));
}

function hasRef(s) {
  for (const m of s.matchAll(REF)) if (REG.has(m[1])) return true;
  return false;
}

export default function detectFeatures(input) {
  if (input === null) throw new Error('null input');
  const g = (k) => (input === undefined ? undefined : input[k]);
  const sirText = g('sirText');
  const carriedData = g('carriedData');
  const envelope = g('envelope');
  const mode = g('mode');
  const sirFiles = g('sirFiles');
  const variants = g('variants');
  if (sirText !== undefined && typeof sirText !== 'string') throw new Error('sirText');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');

  const text = sirText === undefined ? '' : sirText;
  const dirs = [];
  const prose = [];
  let cur = null;
  for (let raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/^\uFEFF+/, '').replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    prose.push(line);
    const spans = [...content.matchAll(QUOTED)].map((m) => [m.index, m.index + m[0].length]);
    let code = content;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const p = content[i - 1];
      if (p !== ' ' && p !== '\t') continue;
      const n = content[i + 1];
      if (n !== undefined && n !== ' ' && n !== '\t') continue;
      if (spans.some(([s, e]) => s < i && i < e - 1)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, '');
      break;
    }
    if (indent === '') {
      const idx = code.search(/[ \t]/);
      let tok = idx < 0 ? code : code.slice(0, idx);
      const tokLen = tok.length;
      if (COLON_NAME.test(tok)) tok = tok.slice(0, -1);
      if (NAME.test(tok) && tok !== 'CITED') {
        const d = { name: tok, args: '', cont: [], attrs: new Map() };
        d.args = split(code.slice(tokLen), d);
        dirs.push(d);
        cur = d;
        continue;
      }
    }
    if (cur) {
      const body = split(' ' + code, cur);
      if (body !== '') cur.cont.push(body);
    }
  }

  const has = (n) => dirs.some((d) => d.name === n);
  const full = (d) => [d.args, ...d.cont].join(' ');
  const pieces = (d) => [d.args, ...d.cont, ...[...d.attrs.values()].flat()];

  const langs = new Set();
  const add = (id) => {
    if (!REG.has(id)) throw new Error('registry');
    langs.add(id);
  };
  const sf = sirFiles === undefined || sirFiles === null ? [] : sirFiles;
  if (!Array.isArray(sf)) throw new Error('sirFiles');
  for (const e of sf) if (typeof e !== 'string') throw new Error('sirFiles element');
  for (const e of sf) {
    const id = suffix(e);
    if (id !== null) add(id);
  }
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants');
    const seen = new Set();
    for (const [k, v] of Object.entries(variants)) {
      if (!isMap(v)) throw new Error('variant');
      if (v.lang !== undefined && typeof v.lang !== 'string') throw new Error('lang');
      if (v.sir !== undefined && typeof v.sir !== 'string') throw new Error('sir');
      const named = [];
      const keyLang = k.startsWith('lang:') ? k.slice(5) : undefined;
      if (keyLang !== undefined) named.push(keyLang);
      if (v.lang !== undefined) named.push(v.lang);
      let pathNone = false;
      if (v.sir !== undefined) {
        const id = suffix(v.sir);
        if (id !== null) named.push(id);
        else pathNone = true;
      }
      if (named.some((x) => x !== named[0])) throw new Error('differ');
      if (keyLang !== undefined && pathNone) throw new Error('none');
      if (!named.length) continue;
      add(named[0]);
      if (seen.has(named[0])) throw new Error('dup');
      seen.add(named[0]);
    }
  }

  const out = new Set(['vectors']);
  if (
    (Array.isArray(carriedData) && carriedData.length > 0) ||
    has('CARRIED') ||
    dirs.some((d) => {
      if (d.name !== 'CARRIED-DATA') return false;
      const f = full(d).trim();
      return f !== '' && f !== 'none';
    })
  ) out.add('carried-data');
  if ((typeof envelope === 'string' && envelope.trim() !== '') || has('ENVELOPE')) out.add('envelope');
  if (
    mode === 'trace' ||
    has('TRACE-SEAM') ||
    dirs.some((d) => d.name === 'ORACLE-CLASS' && /^trace\b/.test(full(d).trim()))
  ) out.add('trace-seam');
  if (mode === 'par' || has('PAR')) out.add('par-interleaving');
  if (mode === 'ring' || has('RING')) out.add('ring');
  if (has('LIFECYCLE') || prose.some((l) => /\bsetTimer\b/.test(l))) out.add('lifecycle');
  if (
    dirs.some((d) => d.name === 'EFFECT' && /\btime\.timer\b|\bmicrotask\b/.test(full(d))) ||
    prose.some((l) => /\bschedule\(|\bvirtual time\b|\btimers\./.test(l))
  ) out.add('scheduler');
  if (langs.size > 0) out.add('lang-variant');
  if (
    dirs.some((d) => {
      if (d.name === 'ANCHOR') return pieces(d).some(hasRef);
      if (d.name === 'FIDELITY' || d.name === 'VARIANT') return (d.attrs.get('ANCHOR') || []).some(hasRef);
      return false;
    })
  ) out.add('cross-lang-anchor');
  return [...out];
}
