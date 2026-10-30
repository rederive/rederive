type Dir = { name: string; args: string; cont: string[]; attrs: Array<[string, string]> };
type Obj = Record<string, unknown>;

const OPENERS = ' \t([{,=:;|<>!&-~';
const REGISTRY = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const TRIM_SP = /^[ \t]+|[ \t]+$/g;
const trimSp = (s: string): string => s.replace(TRIM_SP, '');
const isMap = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function spansOf(t: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let prev = -2;
  let i = 0;
  while (i < t.length) {
    if (t[i] === '"' && (i === 0 || OPENERS.includes(t[i - 1]) || i === prev + 1)) {
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
      out.push([i, j]);
      prev = j;
      i = j + 1;
    } else i++;
  }
  return out;
}

function unquote(t: string): string {
  const sp = spansOf(t);
  let r = '';
  let last = 0;
  for (const [a, b] of sp) {
    r += t.slice(last, a) + '""';
    last = b + 1;
  }
  return r + t.slice(last);
}

function splitAttrs(piece: string): { body: string; attrs: Array<[string, string]> } {
  const sp = spansOf(piece);
  const hits: Array<{ index: number; end: number; kw: string }> = [];
  for (const m of piece.matchAll(/[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g)) {
    const index = m.index ?? 0;
    const end = index + m[0].length;
    const ki = end - m[1].length;
    if (sp.some(([a, b]) => a < ki && ki < b)) continue;
    hits.push({ index, end, kw: m[1] });
  }
  if (hits.length === 0) return { body: trimSp(piece), attrs: [] };
  const attrs: Array<[string, string]> = [];
  for (let k = 0; k < hits.length; k++) {
    const stop = k + 1 < hits.length ? hits[k + 1].index : piece.length;
    attrs.push([hits[k].kw, trimSp(piece.slice(hits[k].end, stop))]);
  }
  return { body: trimSp(piece.slice(0, hits[0].index)), attrs };
}

function trailingComment(content: string): string {
  const sp = spansOf(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== '#') continue;
    const p = content[i - 1];
    if (p !== ' ' && p !== '\t') continue;
    const n = content[i + 1];
    if (n !== undefined && n !== ' ' && n !== '\t') continue;
    if (sp.some(([a, b]) => a < i && i < b)) continue;
    return content.slice(0, i).replace(/[ \t]+$/, '');
  }
  return content;
}

function suffix(p: string): string | null {
  const parts = p.split(/[\\/]/);
  const base = trimSp(parts[parts.length - 1]);
  if (/\.[sS][iI][rR][^\x21-\x7e]+$/.test(base)) throw new Error('hidden tail');
  if (!/\.[sS][iI][rR]$/.test(base)) return null;
  const segs = base.slice(0, -4).split('.');
  if (segs[0] !== '' && !/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(segs[0])) throw new Error('unit name');
  if (segs.length >= 3) throw new Error('segments');
  if (segs.length === 1) return null;
  if (segs[1] === '') throw new Error('empty id');
  return segs[1];
}

function baseEndsSir(p: string): boolean {
  const parts = p.split(/[\\/]/);
  return /\.[sS][iI][rR]$/.test(trimSp(parts[parts.length - 1]));
}

function languagesOf(sirFiles: unknown, variants: unknown): Set<string> {
  const langs = new Set<string>();
  const add = (id: string): void => {
    if (!REGISTRY.includes(id)) throw new Error('not in registry');
    langs.add(id);
  };
  if (sirFiles !== undefined && sirFiles !== null) {
    if (!Array.isArray(sirFiles)) throw new Error('sirFiles');
    for (const e of sirFiles as unknown[]) {
      if (typeof e !== 'string') throw new Error('sirFiles element');
      const id = suffix(e);
      if (id !== null) add(id);
    }
  }
  if (variants === undefined || variants === null) return langs;
  if (!isMap(variants)) throw new Error('variants');
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(variants)) {
    if (!isMap(v)) throw new Error('variant not map');
    const lang = v['lang'];
    const sir = v['sir'];
    if (lang !== undefined && typeof lang !== 'string') throw new Error('lang');
    let pathLang: string | null = null;
    if (sir !== undefined) {
      if (typeof sir !== 'string') throw new Error('sir');
      pathLang = suffix(sir);
      if (!baseEndsSir(sir)) throw new Error('sir tail');
    }
    if (!(k === 'package' || /^lang:[a-z][a-z0-9]*$/.test(k))) throw new Error('key');
    const named: string[] = [];
    const keyLang = k.startsWith('lang:') ? k.slice(5) : undefined;
    if (keyLang !== undefined) named.push(keyLang);
    if (lang !== undefined) named.push(lang as string);
    if (pathLang !== null) named.push(pathLang);
    for (const n of named) if (n !== named[0]) throw new Error('differ');
    if ((keyLang !== undefined || lang !== undefined) && sir !== undefined && pathLang === null)
      throw new Error('none suffix');
    if (named.length === 0) continue;
    add(named[0]);
    if (seen.has(named[0])) throw new Error('dup');
    seen.add(named[0]);
  }
  return langs;
}

function hasRef(t: string): boolean {
  for (const m of t.matchAll(/\bref\([ \t]*([a-z][a-z0-9]*):/g)) {
    if (REGISTRY.includes(m[1])) return true;
  }
  return false;
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error('null input');
  const rec: Obj = isMap(input) ? input : {};
  const get = (k: string): unknown => (Object.prototype.hasOwnProperty.call(rec, k) ? rec[k] : undefined);
  const sirText = get('sirText');
  const carriedData = get('carriedData');
  const envelope = get('envelope');
  const mode = get('mode');
  if (sirText !== undefined && typeof sirText !== 'string') throw new Error('sirText');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');
  const text: string = typeof sirText === 'string' ? sirText : '';

  const dirs: Dir[] = [];
  const prose: string[] = [];
  let cur: Dir | null = null;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw
      .replace(/^[ \t﻿]+/, (lead) => lead.replace(/﻿/g, ''))
      .replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = (/^[ \t]*/.exec(line) ?? [''])[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    prose.push(splitAttrs(' ' + unquote(line)).body);
    const code = trailingComment(content);
    let isDir = false;
    if (indent === '') {
      const ti = code.search(/[ \t]/);
      let tok = ti < 0 ? code : code.slice(0, ti);
      if (/^[A-Z][A-Z0-9-]*:$/.test(tok)) tok = tok.slice(0, -1);
      if (/^(?:[A-Z][A-Z0-9-]*|R\d+)$/.test(tok) && tok !== 'CITED') {
        const sp = splitAttrs(ti < 0 ? '' : code.slice(ti));
        cur = { name: tok, args: sp.body, cont: [], attrs: [...sp.attrs] };
        dirs.push(cur);
        isDir = true;
      }
    }
    if (!isDir && cur !== null) {
      const sp = splitAttrs(' ' + code);
      if (sp.body !== '') cur.cont.push(sp.body);
      for (const a of sp.attrs) cur.attrs.push(a);
    }
  }

  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const full = (d: Dir): string => [d.args, ...d.cont].join(' ');
  const res = new Set<string>();
  res.add('vectors');

  let carried = Array.isArray(carriedData) && carriedData.length > 0;
  if (has('CARRIED')) carried = true;
  for (const d of dirs) {
    if (d.name !== 'CARRIED-DATA') continue;
    for (const t of [full(d), ...d.attrs.map(([, v]) => v)]) {
      const s = trimSp(t);
      if (s !== '' && s !== 'none') carried = true;
    }
  }
  if (carried) res.add('carried-data');

  if ((typeof envelope === 'string' && trimSp(envelope) !== '') || has('ENVELOPE')) res.add('envelope');

  if (
    mode === 'trace' ||
    has('TRACE-SEAM') ||
    dirs.some((d) => d.name === 'ORACLE-CLASS' && /^trace(?![A-Za-z0-9_])/.test(trimSp(full(d))))
  )
    res.add('trace-seam');
  if (mode === 'par' || has('PAR')) res.add('par-interleaving');
  if (mode === 'ring' || has('RING')) res.add('ring');
  if (has('LIFECYCLE') || prose.some((p) => /\bsetTimer\b/.test(p))) res.add('lifecycle');
  if (
    dirs.some((d) => d.name === 'EFFECT' && /\btime\.timer\b|\bmicrotask\b/.test(unquote(full(d)))) ||
    prose.some((p) => /\bschedule\(|\bvirtual time\b|\btimers\./.test(p))
  )
    res.add('scheduler');

  const langs = languagesOf(get('sirFiles'), get('variants'));
  if (langs.size > 0) res.add('lang-variant');

  let anchor = false;
  for (const d of dirs) {
    if (d.name === 'ANCHOR') {
      const pieces = [d.args, ...d.cont, ...d.attrs.filter(([k]) => k === 'ANCHOR').map(([, v]) => v)];
      if (pieces.some((p) => hasRef(unquote(p)))) anchor = true;
    } else if (d.name === 'FIDELITY' || d.name === 'VARIANT') {
      const av = d.attrs.filter(([k]) => k === 'ANCHOR').map(([, v]) => v);
      if (av.length > 0 && hasRef(unquote(av.filter((v) => v !== '').join('; ')))) anchor = true;
    }
  }
  if (anchor) res.add('cross-lang-anchor');

  return [...res];
}
