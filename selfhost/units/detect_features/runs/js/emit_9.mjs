const OPENERS = ' \t([{,=:;|<>!&-~';
const REG = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
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
const TRIM = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function spans(t) {
  const out = [];
  let prevEnd = -1;
  let i = 0;
  while (i < t.length) {
    if (t[i] === '"' && (i === 0 || OPENERS.includes(t[i - 1]) || i === prevEnd)) {
      let j = i + 1;
      while (j < t.length) {
        const c = t[j];
        if (c === '\\') {
          const cp = t.codePointAt(j + 1);
          j += cp === undefined ? 1 : 1 + (cp > 0xffff ? 2 : 1);
        } else if (c === '"') break;
        else j++;
      }
      if (j >= t.length) return out;
      out.push([i, j + 1]);
      prevEnd = j + 1;
      i = j + 1;
    } else i++;
  }
  return out;
}
const inside = (sp, idx) => sp.some(([a, b]) => idx > a && idx < b - 1);
function unquote(t) {
  let out = '';
  let pos = 0;
  for (const [a, b] of spans(t)) {
    out += t.slice(pos, a) + '""';
    pos = b;
  }
  return out + t.slice(pos);
}
function splitAttrs(p) {
  const sp = spans(p);
  const hits = [];
  for (const m of p.matchAll(ATTR)) {
    const kwIdx = m.index + m[0].length - m[1].length;
    if (!inside(sp, kwIdx)) hits.push({ start: m.index, end: m.index + m[0].length, kw: m[1] });
  }
  if (!hits.length) return { body: TRIM(p), attrs: [] };
  const attrs = hits.map((h, k) => [h.kw, TRIM(p.slice(h.end, k + 1 < hits.length ? hits[k + 1].start : p.length))]);
  return { body: TRIM(p.slice(0, hits[0].start)), attrs };
}

function suffix(p) {
  const base = TRIM(p.split(/[\\/]/).pop());
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden tail');
  if (!SIR_TAIL.test(base)) return null;
  const segs = base.slice(0, -4).split('.');
  if (segs[0] !== '' && !UNIT_NAME.test(segs[0])) throw new Error('unit name');
  if (segs.length >= 3) throw new Error('segments');
  if (segs.length === 1) return null;
  if (segs[1] === '') throw new Error('empty id');
  return segs[1];
}

function parse(text) {
  const dirs = [];
  const prose = [];
  let cur = null;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    let line = raw.replace(/^[ \t﻿]+/, (m) => m.replace(/﻿/g, ''));
    line = line.replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    {
      const L = ' ' + unquote(line);
      prose.push(splitAttrs(L).body);
    }
    const sp = spans(content);
    let code = content;
    for (let i = 1; i < content.length; i++) {
      if (content[i] === '#' && (content[i - 1] === ' ' || content[i - 1] === '\t') &&
          (i + 1 === content.length || content[i + 1] === ' ' || content[i + 1] === '\t') && !inside(sp, i)) {
        code = content.slice(0, i).replace(/[ \t]+$/, '');
        break;
      }
    }
    if (indent === '') {
      const e = code.search(/[ \t]/);
      let tok = e < 0 ? code : code.slice(0, e);
      if (COLON_NAME.test(tok)) tok = tok.slice(0, -1);
      if (NAME.test(tok) && tok !== 'CITED') {
        const rest = e < 0 ? '' : code.slice(e);
        const r = splitAttrs(rest);
        cur = { name: tok, args: r.body, cont: [], attrs: r.attrs.slice() };
        dirs.push(cur);
        continue;
      }
    }
    if (!cur) continue;
    const r = splitAttrs(' ' + code);
    if (r.body !== '') cur.cont.push(r.body);
    cur.attrs.push(...r.attrs);
  }
  return { dirs, prose };
}

export default function detectFeatures(input) {
  if (input === null) throw new Error('null input');
  const get = (k) => (isMap(input) && Object.prototype.hasOwnProperty.call(input, k) ? input[k] : undefined);
  const sirText = get('sirText');
  const carriedData = get('carriedData');
  const envelope = get('envelope');
  const mode = get('mode');
  const sirFiles = get('sirFiles');
  const variants = get('variants');
  if (sirText !== undefined && typeof sirText !== 'string') throw new Error('sirText');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');

  const langs = new Set();
  const add = (id) => {
    if (!REG.includes(id)) throw new Error('registry');
    langs.add(id);
  };
  if (sirFiles !== undefined && sirFiles !== null) {
    if (!Array.isArray(sirFiles)) throw new Error('sirFiles');
    for (const f of sirFiles) if (typeof f !== 'string') throw new Error('sirFiles element');
    for (const f of sirFiles) {
      const id = suffix(f);
      if (id !== null) add(id);
    }
  }
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants');
    const seen = new Set();
    for (const [k, v] of Object.entries(variants)) {
      if (!isMap(v)) throw new Error('variant');
      const hasLang = v.lang !== undefined;
      const hasSir = v.sir !== undefined;
      if (hasLang && typeof v.lang !== 'string') throw new Error('lang');
      let pathId = null;
      if (hasSir) {
        if (typeof v.sir !== 'string') throw new Error('sir');
        pathId = suffix(v.sir);
        if (!SIR_TAIL.test(TRIM(v.sir.split(/[\\/]/).pop()))) throw new Error('sir tail');
      }
      const isKeyLang = VARIANT_KEY.test(k);
      if (!(k === 'package' || isKeyLang)) throw new Error('variant key');
      const named = [];
      if (isKeyLang) named.push(k.slice(5));
      if (hasLang) named.push(v.lang);
      if (pathId !== null) named.push(pathId);
      for (const n of named) if (n !== named[0]) throw new Error('differ');
      if ((isKeyLang || hasLang) && hasSir && pathId === null) throw new Error('none suffix');
      if (named.length === 0) continue;
      add(named[0]);
      if (seen.has(named[0])) throw new Error('dup');
      seen.add(named[0]);
    }
  }

  const { dirs, prose } = parse(sirText === undefined ? '' : sirText);
  const has = (n) => dirs.some((d) => d.name === n);
  const full = (d) => [d.args, ...d.cont].join(' ');
  const pieces = (d) => [d.args, ...d.cont, ...d.attrs.filter(([k]) => k === 'ANCHOR').map(([, v]) => v)];
  const refHit = (t) => {
    for (const m of unquote(t).matchAll(REF)) if (REG.includes(m[1])) return true;
    return false;
  };

  const f = new Set(['vectors']);
  const carried =
    (Array.isArray(carriedData) && carriedData.length > 0) ||
    has('CARRIED') ||
    dirs.some((d) => d.name === 'CARRIED-DATA' &&
      [full(d), ...d.attrs.map(([, v]) => v)].some((t) => { const s = TRIM(t); return s !== '' && s !== 'none'; }));
  if (carried) f.add('carried-data');
  if ((typeof envelope === 'string' && TRIM(envelope) !== '') || has('ENVELOPE')) f.add('envelope');
  if (mode === 'trace' || has('TRACE-SEAM') ||
      dirs.some((d) => d.name === 'ORACLE-CLASS' && TRACE_CLASS.test(TRIM(full(d))))) f.add('trace-seam');
  if (mode === 'par' || has('PAR')) f.add('par-interleaving');
  if (mode === 'ring' || has('RING')) f.add('ring');
  if (has('LIFECYCLE') || prose.some((t) => SET_TIMER.test(t))) f.add('lifecycle');
  if (dirs.some((d) => d.name === 'EFFECT' && EFFECT_TIMER.test(unquote(full(d)))) ||
      prose.some((t) => SCHEDULER.test(t))) f.add('scheduler');
  if (langs.size > 0) f.add('lang-variant');
  const anchorHit = dirs.some((d) => {
    if (d.name === 'ANCHOR') return pieces(d).some(refHit);
    if (d.name === 'FIDELITY' || d.name === 'VARIANT') {
      const av = d.attrs.filter(([k]) => k === 'ANCHOR');
      if (!av.length) return false;
      return refHit(av.map(([, v]) => v).filter((v) => v !== '').join('; '));
    }
    return false;
  });
  if (anchorHit) f.add('cross-lang-anchor');
  return [...f];
}
