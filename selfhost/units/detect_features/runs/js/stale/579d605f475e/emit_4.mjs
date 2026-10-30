const REG = new Set(['js', 'ts', 'rust', 'php', 'csharp', 'python']);
const LINES = /\r\n|\r|\n/;
const TRIM_SP = /^[ \t]+|[ \t]+$/g;
const QUOTED = /"(?:\\.|[^"\\])*"/g;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const HIDDEN_TAIL = /\.sir[\p{White_Space}\p{Cc}\p{Cf}]+$/iu;
const LANG_SUFFIX = /\.([^./\\]*)\.sir$/i;
const sp = (s) => s.replace(TRIM_SP, '');
const isMap = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function splitAttrs(piece) {
  const ms = [...piece.matchAll(ATTR)];
  if (ms.length === 0) return { body: sp(piece), attrs: [] };
  const attrs = ms.map((m, i) => {
    const end = i + 1 < ms.length ? ms[i + 1].index : piece.length;
    return [m[1], sp(piece.slice(m.index + m[0].length, end))];
  });
  return { body: sp(piece.slice(0, ms[0].index)), attrs };
}

function suffix(p) {
  const base = sp(p.split(/[\\/]/).pop());
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden');
  const m = LANG_SUFFIX.exec(base);
  if (!m) return null;
  if (m[1] === '') throw new Error('empty');
  return m[1];
}

function add(set, id) {
  if (!REG.has(id)) throw new Error('registry');
  set.add(id);
}

export default function detectFeatures(input) {
  if (input === null) throw new Error('null input');
  const g = (k) => (input === undefined ? undefined : input[k]);
  let sirText = g('sirText');
  const carriedData = g('carriedData');
  const envelope = g('envelope');
  const mode = g('mode');
  const sirFiles = g('sirFiles');
  const variants = g('variants');
  if (sirText === undefined) sirText = '';
  if (typeof sirText !== 'string') throw new Error('sirText');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');

  const dirs = [];
  const prose = [];
  let cur = null;
  for (let raw of sirText.split(LINES)) {
    let line = raw.replace(/^\uFEFF+/, '').replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    prose.push(line);
    const spans = [...content.matchAll(QUOTED)].map((m) => [m.index, m.index + m[0].length - 1]);
    let code = content;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const p = content[i - 1];
      if (p !== ' ' && p !== '\t') continue;
      const n = content[i + 1];
      if (!(n === undefined || n === ' ' || n === '\t')) continue;
      if (spans.some(([s, e]) => i > s && i < e)) continue;
      code = sp(content.slice(0, i));
      break;
    }
    if (indent === '') {
      const ix = code.search(/[ \t]/);
      const tok = ix < 0 ? code : code.slice(0, ix);
      const name = COLON_NAME.test(tok) ? tok.slice(0, -1) : tok;
      if (NAME.test(name) && name !== 'CITED') {
        const { body, attrs } = splitAttrs(code.slice(tok.length));
        cur = { name, args: body, cont: [], attrs: [] };
        cur.attrs.push(...attrs);
        dirs.push(cur);
        continue;
      }
    }
    if (cur === null) continue;
    const { body, attrs } = splitAttrs(' ' + code);
    if (body !== '') cur.cont.push(body);
    cur.attrs.push(...attrs);
  }

  const has = (n) => dirs.some((d) => d.name === n);
  const full = (d) => [d.args, ...d.cont].join(' ');
  const wsTrim = (s) => s.trim();
  const refOk = (s) => [...s.matchAll(/\bref\(\s*([a-z][a-z0-9]*):/g)].some((m) => REG.has(m[1]));

  const langs = new Set();
  const files = sirFiles === undefined || sirFiles === null ? [] : sirFiles;
  if (!Array.isArray(files)) throw new Error('sirFiles');
  for (const f of files) {
    if (typeof f !== 'string') throw new Error('sirFiles element');
    const id = suffix(f);
    if (id !== null) add(langs, id);
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
      let pathId = null;
      if (v.sir !== undefined) {
        pathId = suffix(v.sir);
        if (pathId !== null) named.push(pathId);
      }
      for (const n of named) if (n !== named[0]) throw new Error('differ');
      if (keyLang !== undefined && v.sir !== undefined && pathId === null) throw new Error('none');
      if (named.length === 0) continue;
      add(langs, named[0]);
      if (seen.has(named[0])) throw new Error('dup');
      seen.add(named[0]);
    }
  }

  const out = new Set(['vectors']);
  if (
    (Array.isArray(carriedData) && carriedData.length > 0) ||
    has('CARRIED') ||
    dirs.some((d) => d.name === 'CARRIED-DATA' && wsTrim(full(d)) !== '' && wsTrim(full(d)) !== 'none')
  ) out.add('carried-data');
  if ((typeof envelope === 'string' && wsTrim(envelope) !== '') || has('ENVELOPE')) out.add('envelope');
  if (
    mode === 'trace' ||
    has('TRACE-SEAM') ||
    dirs.some((d) => d.name === 'ORACLE-CLASS' && /^trace\b/.test(wsTrim(full(d))))
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
      if (d.name === 'ANCHOR') return [d.args, ...d.cont, ...d.attrs.map((a) => a[1])].some(refOk);
      if (d.name === 'FIDELITY' || d.name === 'VARIANT') return d.attrs.some((a) => a[0] === 'ANCHOR' && refOk(a[1]));
      return false;
    })
  ) out.add('cross-lang-anchor');
  return [...out];
}
