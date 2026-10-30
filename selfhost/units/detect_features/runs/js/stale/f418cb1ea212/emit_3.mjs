const REG = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const TC = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const COLON = /^[A-Z][A-Z0-9-]*:$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const SUF = /\.([^./\\]+)\.sir$/i;
const REF = /\bref\(\s*([a-z][a-z0-9]*):/;
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function split(piece) {
  const ms = [...piece.matchAll(ATTR)];
  if (!ms.length) return { body: piece.trim(), attrs: [] };
  const attrs = [];
  ms.forEach((m, i) => {
    const end = m.index + m[0].length;
    const next = i + 1 < ms.length ? ms[i + 1].index : piece.length;
    attrs.push([m[1], piece.slice(end, next).trim()]);
  });
  return { body: piece.slice(0, ms[0].index).trim(), attrs };
}

function addAttrs(d, attrs) {
  for (const [k, v] of attrs) (d.attrs[k] ||= []).push(v);
}

function parse(text) {
  const dirs = [];
  let cur = null;
  for (let line of text.split(/\r\n|\r|\n/)) {
    line = line.replace(/^﻿+/, '').replace(/[ \t]+$/, '');
    if (line.trim() === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const m = TC.exec(content);
    const code = m ? m[1].replace(/\s+$/, '') : content;
    if (indent === '') {
      const i = code.search(/[ \t]/);
      let tok = i < 0 ? code : code.slice(0, i);
      if (COLON.test(tok)) tok = tok.slice(0, -1);
      if (NAME.test(tok)) {
        const rest = (i < 0 ? '' : code.slice(i)).replace(/^[ \t]+/, '');
        const p = split(rest);
        cur = { name: tok, args: p.body, cont: [], attrs: {} };
        addAttrs(cur, p.attrs);
        dirs.push(cur);
        continue;
      }
    }
    if (!cur) continue;
    const p = split(' ' + code);
    cur.cont.push(p.body);
    addAttrs(cur, p.attrs);
  }
  return dirs;
}

function langs(sirFiles, variants) {
  const out = [];
  const suffix = (p) => p.split(/[\\/]/).pop().trim().match(SUF)?.[1];
  if (sirFiles !== undefined && sirFiles !== null) {
    if (!Array.isArray(sirFiles)) throw new Error('sirFiles');
    for (const p of sirFiles) {
      if (typeof p !== 'string') throw new Error('sirFiles element');
      const s = suffix(p);
      if (s !== undefined) out.push(s);
    }
  }
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants');
    for (const [k, v] of Object.entries(variants)) {
      const key = k.startsWith('lang:') ? k.slice(5) : undefined;
      const own = isMap(v) && typeof v.lang === 'string' ? v.lang : undefined;
      if (key !== undefined && own !== undefined && key !== own) throw new Error('lang mismatch');
      if (key !== undefined) out.push(key);
      else if (own !== undefined) out.push(own);
      if (isMap(v) && typeof v.sir === 'string') {
        const s = suffix(v.sir);
        if (s !== undefined) out.push(s);
      }
    }
  }
  for (const l of out) if (!REG.includes(l)) throw new Error(`${l} not in registry`);
  return out;
}

export default function detectFeatures(input) {
  if (input === null) throw new Error('null input');
  const f = (k) => (input === undefined ? undefined : input[k]);
  const sirText = f('sirText');
  const carriedData = f('carriedData');
  const envelope = f('envelope');
  const mode = f('mode');
  if (sirText !== undefined && typeof sirText !== 'string') throw new Error('sirText');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');
  const dirs = parse(sirText === undefined ? '' : sirText);
  const has = (n) => dirs.some((d) => d.name === n);
  const full = (d) => [d.args, ...d.cont].join(' ');
  const body = dirs
    .map((d) => [d.args, ...d.cont, ...Object.values(d.attrs).map((v) => v.join('; '))].join(' '))
    .join('\n');
  const L = langs(f('sirFiles'), f('variants'));
  const res = new Set(['vectors']);
  if (
    (Array.isArray(carriedData) && carriedData.length > 0) ||
    has('CARRIED') ||
    dirs.some((d) => {
      if (d.name !== 'CARRIED-DATA') return false;
      const t = full(d).trim();
      return t !== '' && t !== 'none';
    })
  ) res.add('carried-data');
  if ((typeof envelope === 'string' && envelope.trim() !== '') || has('ENVELOPE')) res.add('envelope');
  if (mode === 'trace' || has('TRACE-SEAM') || dirs.some((d) => d.name === 'ORACLE-CLASS' && /^trace\b/.test(full(d).trim()))) res.add('trace-seam');
  if (mode === 'par' || has('PAR')) res.add('par-interleaving');
  if (mode === 'ring' || has('RING')) res.add('ring');
  if (has('LIFECYCLE') || /\bsetTimer\b/.test(body)) res.add('lifecycle');
  if (
    dirs.some((d) => d.name === 'EFFECT' && /\btime\.timer\b|\bmicrotask\b/.test(full(d))) ||
    /\bschedule\(|\bvirtual time\b|\btimers\./.test(body)
  ) res.add('scheduler');
  if (L.length > 0) res.add('lang-variant');
  const refLang = (a) => REF.exec(a)?.[1];
  if (
    dirs.some((d) => {
      if (d.name === 'ANCHOR') {
        const r = refLang(d.args);
        if (r !== undefined && REG.includes(r)) return true;
      }
      if (d.attrs.ANCHOR) {
        const r = refLang(d.attrs.ANCHOR.join('; '));
        if (r !== undefined && REG.includes(r)) return true;
      }
      return false;
    })
  ) res.add('cross-lang-anchor');
  const order = ['vectors', 'carried-data', 'envelope', 'trace-seam', 'par-interleaving', 'ring', 'lifecycle', 'scheduler', 'lang-variant', 'cross-lang-anchor'];
  return order.filter((n) => res.has(n));
}
