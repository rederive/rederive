const OPENERS = ' \t([{,=:;|<>!&-~';
const REG = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const TRIM = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
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

function spans(t) {
  const out = [];
  let i = 0;
  let prevEnd = -1;
  while (i < t.length) {
    if (t[i] === '"' && (i === 0 || OPENERS.includes(t[i - 1]) || i === prevEnd)) {
      let j = i + 1;
      while (j < t.length) {
        const c = t[j];
        if (c === '\\') {
          const cp = t.codePointAt(j + 1);
          j += 1 + (cp === undefined ? 0 : cp > 0xffff ? 2 : 1);
        } else if (c === '"') break;
        else j++;
      }
      if (j >= t.length) return out;
      out.push([i, j + 1]);
      i = j + 1;
      prevEnd = j + 1;
    } else i++;
  }
  return out;
}

function unquote(t) {
  const sp = spans(t);
  let r = '';
  let p = 0;
  for (const [a, b] of sp) {
    r += t.slice(p, a) + '""';
    p = b;
  }
  return r + t.slice(p);
}

function inside(sp, k) {
  return sp.some(([a, b]) => k > a && k < b - 1);
}

function split(piece) {
  const sp = spans(piece);
  const hits = [];
  for (const m of piece.matchAll(ATTR)) {
    const kwIdx = m.index + m[0].length - m[1].length;
    if (inside(sp, kwIdx)) continue;
    hits.push({ start: m.index, kw: m[1], vstart: m.index + m[0].length });
  }
  if (!hits.length) return { body: TRIM(piece), attrs: [] };
  const attrs = hits.map((h, n) => {
    const end = n + 1 < hits.length ? hits[n + 1].start : piece.length;
    return [h.kw, TRIM(piece.slice(h.vstart, end))];
  });
  return { body: TRIM(piece.slice(0, hits[0].start)), attrs };
}

function suffix(p) {
  const base = TRIM(p.split(/[\\/]/).pop());
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden');
  if (!SIR_TAIL.test(base)) return null;
  const segs = base.slice(0, -4).split('.');
  if (segs[0] !== '' && !UNIT_NAME.test(segs[0])) throw new Error('unit');
  if (segs.length >= 3) throw new Error('segs');
  if (segs.length === 1) return null;
  if (segs[1] === '') throw new Error('empty');
  return segs[1];
}

function hasRef(t) {
  for (const m of t.matchAll(REF)) if (REG.includes(m[1])) return true;
  return false;
}

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export default function detectFeatures(input) {
  if (input === null) throw new Error('null input');
  const f = isMap(input) ? input : {};
  const sirText = f.sirText;
  const carriedData = f.carriedData;
  const envelope = f.envelope;
  const mode = f.mode;
  if (sirText !== undefined && typeof sirText !== 'string') throw new Error('sirText');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');
  const text = sirText === undefined ? '' : sirText;

  const dirs = [];
  const prose = [];
  let cur = null;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/^[ \t﻿]+/, (l) => l.replace(/﻿/g, '')).replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    prose.push(split(' ' + unquote(line)).body);
    const csp = spans(content);
    let code = content;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '#' && i > 0 && (content[i - 1] === ' ' || content[i - 1] === '\t') &&
          (i + 1 === content.length || content[i + 1] === ' ' || content[i + 1] === '\t') && !inside(csp, i)) {
        code = content.slice(0, i).replace(/[ \t]+$/, '');
        break;
      }
    }
    let started = false;
    if (indent === '') {
      const ix = code.search(/[ \t]/);
      let tok = ix < 0 ? code : code.slice(0, ix);
      const tlen = tok.length;
      if (COLON_NAME.test(tok)) tok = tok.slice(0, -1);
      if (NAME.test(tok) && tok !== 'CITED') {
        const r = split(code.slice(tlen));
        cur = { name: tok, args: r.body, cont: [], attrs: r.attrs.slice() };
        dirs.push(cur);
        started = true;
      }
    }
    if (!started && cur) {
      const r = split(' ' + code);
      if (r.body !== '') cur.cont.push(r.body);
      cur.attrs.push(...r.attrs);
    }
  }

  const has = (n) => dirs.some((d) => d.name === n);
  const full = (d) => [d.args, ...d.cont].join(' ');

  const langs = new Set();
  const add = (id) => {
    if (!REG.includes(id)) throw new Error('registry');
    langs.add(id);
  };
  let sf = f.sirFiles;
  if (sf === undefined || sf === null) sf = [];
  if (!Array.isArray(sf)) throw new Error('sirFiles');
  for (const e of sf) {
    if (typeof e !== 'string') throw new Error('sirFiles element');
    const id = suffix(e);
    if (id !== null) add(id);
  }
  const vr = f.variants;
  if (vr !== undefined && vr !== null) {
    if (!isMap(vr)) throw new Error('variants');
    const seen = new Set();
    for (const [k, v] of Object.entries(vr)) {
      if (!isMap(v)) throw new Error('variant');
      const hasLang = v.lang !== undefined;
      const hasSir = v.sir !== undefined;
      if (hasLang && typeof v.lang !== 'string') throw new Error('lang');
      let pathLang = null;
      if (hasSir) {
        if (typeof v.sir !== 'string') throw new Error('sir');
        pathLang = suffix(v.sir);
        if (!SIR_TAIL.test(TRIM(v.sir.split(/[\\/]/).pop()))) throw new Error('sir tail');
      }
      if (!(k === 'package' || VARIANT_KEY.test(k))) throw new Error('key');
      const named = [];
      const keyLang = k.startsWith('lang:') ? k.slice(5) : undefined;
      if (keyLang !== undefined) named.push(keyLang);
      if (hasLang) named.push(v.lang);
      if (pathLang !== null) named.push(pathLang);
      for (const a of named) for (const b of named) if (a !== b) throw new Error('differ');
      if ((keyLang !== undefined || hasLang) && hasSir && pathLang === null) throw new Error('none path');
      if (!named.length) continue;
      add(named[0]);
      if (seen.has(named[0])) throw new Error('dup');
      seen.add(named[0]);
    }
  }

  const out = new Set(['vectors']);
  const cdText = (d) => [full(d), ...d.attrs.map(([, v]) => v)];
  if ((Array.isArray(carriedData) && carriedData.length > 0) || has('CARRIED') ||
      dirs.some((d) => d.name === 'CARRIED-DATA' && cdText(d).some((t) => { const s = TRIM(t); return s !== '' && s !== 'none'; }))) out.add('carried-data');
  if ((typeof envelope === 'string' && TRIM(envelope) !== '') || has('ENVELOPE')) out.add('envelope');
  if (mode === 'trace' || has('TRACE-SEAM') ||
      dirs.some((d) => d.name === 'ORACLE-CLASS' && TRACE_CLASS.test(TRIM(full(d))))) out.add('trace-seam');
  if (mode === 'par' || has('PAR')) out.add('par-interleaving');
  if (mode === 'ring' || has('RING')) out.add('ring');
  if (has('LIFECYCLE') || prose.some((p) => SET_TIMER.test(p))) out.add('lifecycle');
  if (dirs.some((d) => d.name === 'EFFECT' && EFFECT_TIMER.test(unquote(full(d)))) ||
      prose.some((p) => SCHEDULER.test(p))) out.add('scheduler');
  if (langs.size > 0) out.add('lang-variant');
  let xl = false;
  for (const d of dirs) {
    if (d.name === 'ANCHOR') {
      const pieces = [d.args, ...d.cont, ...d.attrs.filter(([k]) => k === 'ANCHOR').map(([, v]) => v)];
      if (pieces.some((p) => hasRef(unquote(p)))) xl = true;
    } else if (d.name === 'FIDELITY' || d.name === 'VARIANT') {
      const an = d.attrs.filter(([k]) => k === 'ANCHOR');
      if (an.length && hasRef(unquote(an.map(([, v]) => v).filter((v) => v !== '').join('; ')))) xl = true;
    }
  }
  if (xl) out.add('cross-lang-anchor');
  return [...out];
}
