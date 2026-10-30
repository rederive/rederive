const REGISTRY = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function splitPiece(piece) {
  const ms = [...piece.matchAll(ATTR)];
  if (ms.length === 0) return { body: piece.trim(), attrs: [] };
  const attrs = [];
  for (let i = 0; i < ms.length; i++) {
    const start = ms[i].index + ms[i][0].length;
    const end = i + 1 < ms.length ? ms[i + 1].index : piece.length;
    attrs.push([ms[i][1], piece.slice(start, end).trim()]);
  }
  return { body: piece.slice(0, ms[0].index).trim(), attrs };
}

function addAttrs(d, attrs) {
  for (const [k, v] of attrs) {
    if (!d.attrs.has(k)) d.attrs.set(k, []);
    d.attrs.get(k).push(v);
  }
}

function parseDirectives(text) {
  const dirs = [];
  let cur = null;
  for (let line of text.split(/\r\n|\r|\n/)) {
    line = line.replace(/^﻿+/, '').replace(/[ \t]+$/, '');
    if (line.trim() === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const m = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s.exec(content);
    const code = m ? m[1].replace(/\s+$/, '') : content;
    if (indent === '') {
      const idx = code.search(/[ \t]/);
      const raw = idx < 0 ? code : code.slice(0, idx);
      const tok = /^[A-Z][A-Z0-9-]*:$/.test(raw) ? raw.slice(0, -1) : raw;
      if (/^(?:[A-Z][A-Z0-9-]*|R\d+)$/.test(tok)) {
        const rest = code.slice(raw.length).replace(/^[ \t]+/, '');
        const p = splitPiece(rest);
        cur = { name: tok, args: p.body, cont: [], attrs: new Map() };
        addAttrs(cur, p.attrs);
        dirs.push(cur);
        continue;
      }
    }
    if (!cur) continue;
    const p = splitPiece(' ' + code);
    cur.cont.push(p.body);
    addAttrs(cur, p.attrs);
  }
  return dirs;
}

function suffix(p) {
  const b = p.split(/[\\/]/).pop().trim();
  const m = b.match(/\.([^./\\]+)\.sir$/i);
  return m ? m[1] : undefined;
}

function langsOf(sirFiles, variants) {
  const out = [];
  if (sirFiles !== undefined && sirFiles !== null) {
    if (!Array.isArray(sirFiles)) throw new Error('sirFiles');
    for (const f of sirFiles) {
      if (typeof f !== 'string') throw new Error('sirFiles element');
      const s = suffix(f);
      if (s !== undefined) out.push(s);
    }
  }
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants');
    for (const [k, v] of Object.entries(variants)) {
      const keyLang = k.startsWith('lang:') ? k.slice(5) : undefined;
      const own = isMap(v) && typeof v.lang === 'string' ? v.lang : undefined;
      if (keyLang !== undefined && own !== undefined && keyLang !== own) throw new Error('lang mismatch');
      if (keyLang !== undefined) out.push(keyLang);
      else if (own !== undefined) out.push(own);
      if (isMap(v) && typeof v.sir === 'string') {
        const s = suffix(v.sir);
        if (s !== undefined) out.push(s);
      }
    }
  }
  for (const l of out) if (!REGISTRY.includes(l)) throw new Error(l + ' not in registry');
  return out;
}

export default function detectFeatures(input) {
  if (input === null) throw new Error('null input');
  const f = isMap(input) ? input : {};
  const sirText = f.sirText === undefined ? '' : f.sirText;
  if (typeof sirText !== 'string') throw new Error('sirText');
  const carriedData = f.carriedData;
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  const envelope = f.envelope;
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');
  const mode = f.mode;

  const dirs = parseDirectives(sirText);
  const has = (n) => dirs.some((d) => d.name === n);
  const full = (d) => [d.args, ...d.cont].join(' ');
  const contentText = (d) => [d.args, ...d.cont, ...[...d.attrs.values()].map((v) => v.join('; '))].join(' ');
  const body = dirs.map(contentText).join('\n');
  const langs = langsOf(f.sirFiles, f.variants);

  const res = new Set(['vectors']);
  if (
    (Array.isArray(carriedData) && carriedData.length > 0) ||
    has('CARRIED') ||
    dirs.some((d) => d.name === 'CARRIED-DATA' && full(d).trim() !== '' && full(d).trim() !== 'none')
  ) res.add('carried-data');
  if ((typeof envelope === 'string' && envelope.trim() !== '') || has('ENVELOPE')) res.add('envelope');
  if (
    mode === 'trace' ||
    has('TRACE-SEAM') ||
    dirs.some((d) => d.name === 'ORACLE-CLASS' && /^trace\b/.test(full(d).trim()))
  ) res.add('trace-seam');
  if (mode === 'par' || has('PAR')) res.add('par-interleaving');
  if (mode === 'ring' || has('RING')) res.add('ring');
  if (has('LIFECYCLE') || /\bsetTimer\b/.test(body)) res.add('lifecycle');
  if (
    dirs.some((d) => d.name === 'EFFECT' && /\btime\.timer\b|\bmicrotask\b/.test(full(d))) ||
    /\bschedule\(|\bvirtual time\b|\btimers\./.test(body)
  ) res.add('scheduler');
  if (langs.length > 0) res.add('lang-variant');
  const refLang = (a) => {
    const m = /\bref\(\s*([a-z][a-z0-9]*):/.exec(a);
    return m ? m[1] : undefined;
  };
  const inReg = (a) => {
    const id = refLang(a);
    return id !== undefined && REGISTRY.includes(id);
  };
  if (
    dirs.some((d) => {
      if (d.name === 'ANCHOR' && inReg(d.args)) return true;
      return d.attrs.has('ANCHOR') && inReg(d.attrs.get('ANCHOR').join('; '));
    })
  ) res.add('cross-lang-anchor');
  return [...res];
}
