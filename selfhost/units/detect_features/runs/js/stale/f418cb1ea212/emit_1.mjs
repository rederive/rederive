const REGISTRY = new Set(['js', 'ts', 'rust', 'php', 'csharp', 'python']);
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function splitAttrs(piece) {
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const ms = [...piece.matchAll(re)];
  if (ms.length === 0) return { body: piece.trim(), attrs: [] };
  const attrs = [];
  for (let i = 0; i < ms.length; i++) {
    const start = ms[i].index + ms[i][0].length;
    const end = i + 1 < ms.length ? ms[i + 1].index : piece.length;
    attrs.push([ms[i][1], piece.slice(start, end).trim()]);
  }
  return { body: piece.slice(0, ms[0].index).trim(), attrs };
}

function parseDirectives(text) {
  const dirs = [];
  let cur = null;
  const addAttrs = (d, attrs) => {
    for (const [k, v] of attrs) (d.attrs[k] ||= []).push(v);
  };
  for (let line of text.split(/\r\n|\r|\n/)) {
    line = line.replace(/^﻿+/, '').replace(/[ \t]+$/, '');
    if (line.trim() === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const m = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s.exec(content);
    const code = m ? m[1].replace(/\s+$/, '') : content;
    if (indent === '') {
      const ti = code.search(/[ \t]/);
      let tok = ti === -1 ? code : code.slice(0, ti);
      if (/^[A-Z][A-Z0-9-]*:$/.test(tok)) tok = tok.slice(0, -1);
      if (/^(?:[A-Z][A-Z0-9-]*|R\d+)$/.test(tok)) {
        const rest = (ti === -1 ? '' : code.slice(ti)).replace(/^[ \t]+/, '');
        const { body, attrs } = splitAttrs(rest);
        cur = { name: tok, args: body, cont: [], attrs: {} };
        addAttrs(cur, attrs);
        dirs.push(cur);
        continue;
      }
    }
    if (!cur) continue;
    const { body, attrs } = splitAttrs(' ' + code);
    cur.cont.push(body);
    addAttrs(cur, attrs);
  }
  for (const d of dirs) {
    d.full = [d.args, ...d.cont].join(' ');
    d.ctext = [d.args, ...d.cont, ...Object.values(d.attrs).map((a) => a.join('; '))].join(' ');
  }
  return dirs;
}

function suffix(p) {
  const m = p.split(/[\\/]/).pop().trim().match(/\.([^./\\]+)\.sir$/i);
  return m ? m[1] : undefined;
}

function langsOf(sirFiles, variants) {
  const out = [];
  if (sirFiles != null) {
    if (!Array.isArray(sirFiles)) throw new Error('sirFiles');
    for (const p of sirFiles) {
      if (typeof p !== 'string') throw new Error('sirFiles element');
      const s = suffix(p);
      if (s !== undefined) out.push(s);
    }
  }
  if (variants != null) {
    if (!isMap(variants)) throw new Error('variants');
    for (const [k, v] of Object.entries(variants)) {
      const kl = k.startsWith('lang:') ? k.slice(5) : undefined;
      const ol = isMap(v) && typeof v.lang === 'string' ? v.lang : undefined;
      if (kl !== undefined && ol !== undefined && kl !== ol) throw new Error('lang mismatch');
      if (kl !== undefined) out.push(kl);
      else if (ol !== undefined) out.push(ol);
      if (isMap(v) && typeof v.sir === 'string') {
        const s = suffix(v.sir);
        if (s !== undefined) out.push(s);
      }
    }
  }
  for (const l of out) if (!REGISTRY.has(l)) throw new Error(`${l} is not in the closed language registry`);
  return out;
}

export default function detectFeatures(input) {
  if (input === null) throw new Error('null input');
  let sirText = input.sirText;
  const carriedData = input.carriedData;
  const envelope = input.envelope;
  const mode = input.mode;
  const sirFiles = input.sirFiles;
  const variants = input.variants;
  if (sirText === undefined) sirText = '';
  else if (typeof sirText !== 'string') throw new Error('sirText');
  if (carriedData != null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope != null && typeof envelope !== 'string') throw new Error('envelope');
  const dirs = parseDirectives(sirText);
  const has = (n) => dirs.some((d) => d.name === n);
  const langs = langsOf(sirFiles, variants);
  const body = dirs.map((d) => d.ctext).join('\n');
  const ref = (a) => {
    const m = /\bref\(\s*([a-z][a-z0-9]*):/.exec(a);
    return m ? m[1] : undefined;
  };
  const out = new Set(['vectors']);
  if (
    (Array.isArray(carriedData) && carriedData.length > 0) ||
    has('CARRIED') ||
    dirs.some((d) => d.name === 'CARRIED-DATA' && d.full.trim() !== '' && d.full.trim() !== 'none')
  ) out.add('carried-data');
  if ((typeof envelope === 'string' && envelope.trim() !== '') || has('ENVELOPE')) out.add('envelope');
  if (
    mode === 'trace' ||
    has('TRACE-SEAM') ||
    dirs.some((d) => d.name === 'ORACLE-CLASS' && /^trace\b/.test(d.full.trim()))
  ) out.add('trace-seam');
  if (mode === 'par' || has('PAR')) out.add('par-interleaving');
  if (mode === 'ring' || has('RING')) out.add('ring');
  if (has('LIFECYCLE') || /\bsetTimer\b/.test(body)) out.add('lifecycle');
  if (
    dirs.some((d) => d.name === 'EFFECT' && /\btime\.timer\b|\bmicrotask\b/.test(d.full)) ||
    /\bschedule\(|\bvirtual time\b|\btimers\./.test(body)
  ) out.add('scheduler');
  if (langs.length > 0) out.add('lang-variant');
  if (
    dirs.some((d) => {
      if (d.name === 'ANCHOR') {
        const r = ref(d.args);
        if (r !== undefined && REGISTRY.has(r)) return true;
      }
      if (d.attrs.ANCHOR) {
        const r = ref(d.attrs.ANCHOR.join('; '));
        if (r !== undefined && REGISTRY.has(r)) return true;
      }
      return false;
    })
  ) out.add('cross-lang-anchor');
  return [...out];
}
