const REG = new Set(['js', 'ts', 'rust', 'php', 'csharp', 'python']);
const TRIM_SP = /^[ \t]+|[ \t]+$/g;
const QUOTED = /"(?:\\.|[^"\\])*"/g;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const HIDDEN_TAIL = /\.sir[\p{White_Space}\p{Cc}\p{Cf}]+$/iu;
const LANG_SUFFIX = /\.([^./\\]*)\.sir$/i;
const REF = /\bref\(\s*([a-z][a-z0-9]*):/g;
const ts = (s) => s.replace(TRIM_SP, '');
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function split(piece) {
  const ms = [...piece.matchAll(ATTR)];
  if (!ms.length) return { body: ts(piece), attrs: [] };
  const attrs = ms.map((m, i) => {
    const end = i + 1 < ms.length ? ms[i + 1].index : piece.length;
    return [m[1], ts(piece.slice(m.index + m[0].length, end))];
  });
  return { body: ts(piece.slice(0, ms[0].index)), attrs };
}

function suffix(p) {
  const base = ts(p.split(/[\\/]/).pop());
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden');
  const m = base.match(LANG_SUFFIX);
  if (!m) return null;
  if (m[1] === '') throw new Error('empty');
  return m[1];
}

export default function detectFeatures(input) {
  if (input === null || input === undefined) throw new Error('null');
  const sirText0 = input.sirText;
  const carriedData = input.carriedData ?? undefined;
  const envelope = input.envelope ?? undefined;
  const mode = input.mode;
  const sirFilesRaw = input.sirFiles;
  const variantsRaw = input.variants;
  if (sirText0 !== undefined && typeof sirText0 !== 'string') throw new Error('sirText');
  const sirText = sirText0 === undefined ? '' : sirText0;
  if (carriedData !== undefined && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && typeof envelope !== 'string') throw new Error('envelope');

  const dirs = [];
  const prose = [];
  let cur = null;
  for (let line of sirText.split(/\r\n|\r|\n/)) {
    line = line.replace(/^\uFEFF+/, '').replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = line.match(/^[ \t]*/)[0];
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
      if (!(i + 1 === content.length || n === ' ' || n === '\t')) continue;
      if (spans.some(([s, e]) => s < i && i < e)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, '');
      break;
    }
    let started = false;
    if (indent === '') {
      const ti = code.search(/[ \t]/);
      const tok = ti < 0 ? code : code.slice(0, ti);
      const nm = COLON_NAME.test(tok) ? tok.slice(0, -1) : tok;
      if (NAME.test(nm) && nm !== 'CITED') {
        const sp = split(code.slice(tok.length));
        cur = { name: nm, args: sp.body, cont: [], attrs: sp.attrs.slice() };
        dirs.push(cur);
        started = true;
      }
    }
    if (!started && cur) {
      const sp = split(' ' + code);
      if (sp.body !== '') cur.cont.push(sp.body);
      cur.attrs.push(...sp.attrs);
    }
  }
  const has = (n) => dirs.some((d) => d.name === n);
  const full = (d) => [d.args, ...d.cont].join(' ');
  const pieces = (d) => [d.args, ...d.cont, ...d.attrs.map((a) => a[1])];
  const hasReg = (t) => [...t.matchAll(REF)].some((m) => REG.has(m[1]));

  const langs = new Set();
  const add = (id) => {
    if (!REG.has(id)) throw new Error('registry');
    langs.add(id);
  };
  let sf = sirFilesRaw === undefined || sirFilesRaw === null ? [] : sirFilesRaw;
  if (!Array.isArray(sf)) throw new Error('sirFiles');
  for (const f of sf) if (typeof f !== 'string') throw new Error('sirFiles elt');
  for (const f of sf) {
    const id = suffix(f);
    if (id !== null) add(id);
  }
  if (variantsRaw !== undefined && variantsRaw !== null) {
    if (!isMap(variantsRaw)) throw new Error('variants');
    const seen = new Set();
    for (const [k, v] of Object.entries(variantsRaw)) {
      if (!isMap(v)) throw new Error('variant');
      if (v.lang !== undefined && typeof v.lang !== 'string') throw new Error('lang');
      if (v.sir !== undefined && typeof v.sir !== 'string') throw new Error('sir');
      const named = [];
      if (k.startsWith('lang:')) named.push(k.slice(5));
      if (v.lang !== undefined) named.push(v.lang);
      let pathLang = null;
      if (v.sir !== undefined) {
        pathLang = suffix(v.sir);
        if (pathLang !== null) named.push(pathLang);
      }
      for (const n of named) if (n !== named[0]) throw new Error('differ');
      if (k.startsWith('lang:') && v.sir !== undefined && pathLang === null) throw new Error('nosuffix');
      if (!named.length) continue;
      add(named[0]);
      if (seen.has(named[0])) throw new Error('dup');
      seen.add(named[0]);
    }
  }

  const out = new Set(['vectors']);
  if ((Array.isArray(carriedData) && carriedData.length > 0) || has('CARRIED') ||
    dirs.some((d) => {
      if (d.name !== 'CARRIED-DATA') return false;
      const f = full(d).trim();
      return f !== '' && f !== 'none';
    })) out.add('carried-data');
  if ((typeof envelope === 'string' && envelope.trim() !== '') || has('ENVELOPE')) out.add('envelope');
  if (mode === 'trace' || has('TRACE-SEAM') ||
    dirs.some((d) => d.name === 'ORACLE-CLASS' && /^trace\b/.test(full(d).trim()))) out.add('trace-seam');
  if (mode === 'par' || has('PAR')) out.add('par-interleaving');
  if (mode === 'ring' || has('RING')) out.add('ring');
  if (has('LIFECYCLE') || prose.some((l) => /\bsetTimer\b/.test(l))) out.add('lifecycle');
  if (dirs.some((d) => d.name === 'EFFECT' && /\btime\.timer\b|\bmicrotask\b/.test(full(d))) ||
    prose.some((l) => /\bschedule\(|\bvirtual time\b|\btimers\./.test(l))) out.add('scheduler');
  if (langs.size > 0) out.add('lang-variant');
  if (dirs.some((d) => {
    if (d.name === 'ANCHOR') return pieces(d).some(hasReg);
    if (d.name === 'FIDELITY' || d.name === 'VARIANT') return d.attrs.some((a) => a[0] === 'ANCHOR' && hasReg(a[1]));
    return false;
  })) out.add('cross-lang-anchor');
  return [...out];
}
