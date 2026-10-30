const OPENERS = ' \t([{,=:;|<>!&-~';
const REGISTRY = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const LINES = /\r\n|\r|\n/;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const TRACE_CLASS = /^trace(?![A-Za-z0-9_])/;
const SET_TIMER = /\bsetTimer\b/;
const EFFECT_TIMER = /\btime\.timer\b|\bmicrotask\b/;
const SCHEDULER = /\bschedule\(|\bvirtual time\b|\btimers\./;
const REF = /\bref\([ \t]*([a-z][a-z0-9]*):/g;
const HIDDEN_TAIL = /\.[sS][iI][rR][^\x21-\x7e]+$/;
const SIR_TAIL = /\.[sS][iI][rR]$/;
const UNIT_NAME = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const VARIANT_KEY = /^lang:[a-z][a-z0-9]*$/;
const trimSp = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function spans(t) {
  const out = [];
  let prev = -2;
  let i = 0;
  while (i < t.length) {
    if (t[i] === '"' && (i === 0 || OPENERS.includes(t[i - 1]) || i === prev + 1)) {
      let j = i + 1;
      let closed = -1;
      while (j < t.length) {
        const c = t[j];
        if (c === '\\') {
          const cp = t.codePointAt(j + 1);
          j += 1 + (cp === undefined ? 0 : cp > 0xffff ? 2 : 1);
        } else if (c === '"') {
          closed = j;
          break;
        } else j++;
      }
      if (closed < 0) break;
      out.push([i, closed + 1]);
      prev = closed;
      i = closed + 1;
    } else i++;
  }
  return out;
}
const inside = (sp, idx) => sp.some(([a, b]) => idx > a && idx < b - 1);
function unquote(t) {
  let r = '';
  let p = 0;
  for (const [a, b] of spans(t)) {
    r += t.slice(p, a) + '""';
    p = b;
  }
  return r + t.slice(p);
}
function splitAttrs(piece) {
  const sp = spans(piece);
  const hits = [];
  for (const m of piece.matchAll(ATTR)) {
    const kwIdx = m.index + m[0].length - m[1].length;
    if (inside(sp, kwIdx)) continue;
    hits.push({ run: m.index, kw: m[1], after: m.index + m[0].length });
  }
  if (!hits.length) return { body: trimSp(piece), attrs: [], has: false };
  const attrs = hits.map((h, k) => {
    const end = k + 1 < hits.length ? hits[k + 1].run : piece.length;
    return [h.kw, trimSp(piece.slice(h.after, end))];
  });
  return { body: piece.slice(0, hits[0].run), attrs, has: true };
}
function codeOf(content) {
  const sp = spans(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== '#') continue;
    const p = content[i - 1];
    if (p !== ' ' && p !== '\t') continue;
    const n = content[i + 1];
    if (!(i + 1 === content.length || n === ' ' || n === '\t')) continue;
    if (inside(sp, i)) continue;
    return content.slice(0, i).replace(/[ \t]+$/, '');
  }
  return content;
}
function physical(text) {
  const out = [];
  for (const raw of text.split(LINES)) {
    const line = raw.replace(/^[ \t﻿]+/, (l) => l.replace(/﻿/g, '')).replace(/[ \t]+$/, '');
    if (line === '') continue;
    out.push(line);
  }
  return out;
}
function parseDirectives(lines) {
  const ds = [];
  let cur = null;
  for (const line of lines) {
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const code = codeOf(content);
    if (indent === '') {
      const s = code.search(/[ \t]/);
      const tok = s < 0 ? code : code.slice(0, s);
      const name = COLON_NAME.test(tok) ? tok.slice(0, -1) : tok;
      if (NAME.test(name) && name !== 'CITED') {
        const rest = s < 0 ? '' : code.slice(s);
        const r = splitAttrs(rest);
        cur = { name, args: r.body, cont: [], attrs: [...r.attrs] };
        ds.push(cur);
        continue;
      }
    }
    if (!cur) continue;
    const r = splitAttrs(' ' + code);
    if (r.body !== '') cur.cont.push(r.body);
    cur.attrs.push(...r.attrs);
  }
  return ds;
}
const full = (d) => [d.args, ...d.cont].join(' ');
function hasRef(t) {
  for (const m of t.matchAll(REF)) {
    if (m.index > 0 && /[A-Za-z0-9_]/.test(t[m.index - 1])) continue;
    if (REGISTRY.includes(m[1])) return true;
  }
  return false;
}
function suffix(p) {
  const b = trimSp(p.split(/[\\/]/).pop());
  if (HIDDEN_TAIL.test(b)) throw new Error('hidden');
  if (!SIR_TAIL.test(b)) return null;
  const segs = b.slice(0, -4).split('.');
  if (segs[0] !== '' && !UNIT_NAME.test(segs[0])) throw new Error('unit');
  if (segs.length >= 3) throw new Error('segs');
  if (segs.length === 1) return null;
  if (segs[1] === '') throw new Error('empty');
  return segs[1];
}
function langsOf(sirFiles, variants) {
  const langs = new Set();
  const add = (id) => {
    if (!REGISTRY.includes(id)) throw new Error('registry');
    langs.add(id);
  };
  let sf = sirFiles;
  if (sf === undefined || sf === null) sf = [];
  if (!Array.isArray(sf)) throw new Error('sirFiles');
  for (const f of sf) if (typeof f !== 'string') throw new Error('sirFiles elt');
  for (const f of sf) {
    const id = suffix(f);
    if (id !== null) add(id);
  }
  if (variants === undefined || variants === null) return langs;
  if (!isMap(variants)) throw new Error('variants');
  const seen = new Set();
  for (const [k, v] of Object.entries(variants)) {
    if (!isMap(v)) throw new Error('variant');
    if (v.lang !== undefined && typeof v.lang !== 'string') throw new Error('lang');
    let pathId = null;
    if (v.sir !== undefined) {
      if (typeof v.sir !== 'string') throw new Error('sir');
      pathId = suffix(v.sir);
      const b = trimSp(v.sir.split(/[\\/]/).pop());
      if (!SIR_TAIL.test(b)) throw new Error('sir tail');
    }
    if (!(k === 'package' || VARIANT_KEY.test(k))) throw new Error('key');
    const named = [];
    const keyLang = k !== 'package' ? k.slice(5) : undefined;
    if (keyLang !== undefined) named.push(keyLang);
    if (v.lang !== undefined) named.push(v.lang);
    if (pathId !== null) named.push(pathId);
    for (const n of named) if (n !== named[0]) throw new Error('differ');
    if ((keyLang !== undefined || v.lang !== undefined) && v.sir !== undefined && pathId === null) throw new Error('none');
    if (!named.length) continue;
    add(named[0]);
    if (seen.has(named[0])) throw new Error('dup');
    seen.add(named[0]);
  }
  return langs;
}

export default function detectFeatures(input) {
  if (input === null) throw new Error('null input');
  const o = typeof input === 'object' && !Array.isArray(input) && input !== undefined ? input : {};
  const { sirText, carriedData, envelope, mode, sirFiles, variants } = o;
  if (sirText !== undefined && typeof sirText !== 'string') throw new Error('sirText');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');
  const langs = langsOf(sirFiles, variants);
  const lines = physical(sirText === undefined ? '' : sirText);
  const ds = parseDirectives(lines);
  const has = (n) => ds.some((d) => d.name === n);
  const prose = [];
  for (const line of lines) {
    if (/^[ \t]*/.exec(line) && line.replace(/^[ \t]+/, '').startsWith('#')) continue;
    const L = ' ' + unquote(line);
    const r = splitAttrs(L);
    prose.push(r.has ? trimSp(r.body) : trimSp(L));
  }
  const feats = new Set(['vectors']);
  const carried =
    (Array.isArray(carriedData) && carriedData.length > 0) ||
    has('CARRIED') ||
    ds.some(
      (d) =>
        d.name === 'CARRIED-DATA' &&
        [full(d), ...d.attrs.map(([, v]) => v)].some((t) => {
          const s = trimSp(t);
          return s !== '' && s !== 'none';
        })
    );
  if (carried) feats.add('carried-data');
  if ((typeof envelope === 'string' && trimSp(envelope) !== '') || has('ENVELOPE')) feats.add('envelope');
  if (mode === 'trace' || has('TRACE-SEAM') || ds.some((d) => d.name === 'ORACLE-CLASS' && TRACE_CLASS.test(trimSp(full(d))))) feats.add('trace-seam');
  if (mode === 'par' || has('PAR')) feats.add('par-interleaving');
  if (mode === 'ring' || has('RING')) feats.add('ring');
  if (has('LIFECYCLE') || prose.some((t) => SET_TIMER.test(t))) feats.add('lifecycle');
  if (ds.some((d) => d.name === 'EFFECT' && EFFECT_TIMER.test(unquote(full(d)))) || prose.some((t) => SCHEDULER.test(t))) feats.add('scheduler');
  if (langs.size > 0) feats.add('lang-variant');
  const anchor = ds.some((d) => {
    if (d.name === 'ANCHOR') {
      const pieces = [d.args, ...d.cont, ...d.attrs.filter(([k]) => k === 'ANCHOR').map(([, v]) => v)];
      return pieces.some((p) => hasRef(unquote(p)));
    }
    if (d.name === 'FIDELITY' || d.name === 'VARIANT') {
      const av = d.attrs.filter(([k]) => k === 'ANCHOR').map(([, v]) => v);
      if (!av.length) return false;
      return hasRef(unquote(av.filter((v) => v !== '').join('; ')));
    }
    return false;
  });
  if (anchor) feats.add('cross-lang-anchor');
  return [...feats];
}
