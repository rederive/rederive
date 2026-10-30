type Span = [number, number];
type Attr = [string, string];
interface Directive {
  name: string;
  args: string;
  cont: string[];
  attrs: Attr[];
}

const OPENERS = ' \t([{,=:;|<>!&-~';
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
const REGISTRY = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];

function trimSp(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function spansOf(t: string): Span[] {
  const out: Span[] = [];
  let prev = -2;
  let i = 0;
  while (i < t.length) {
    if (t[i] === '"' && (i === 0 || OPENERS.includes(t[i - 1]) || i === prev + 1)) {
      let j = i + 1;
      let closed = false;
      while (j < t.length) {
        const c = t[j];
        if (c === '\\') {
          const cp = t.codePointAt(j + 1);
          j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
        } else if (c === '"') {
          closed = true;
          break;
        } else {
          j += 1;
        }
      }
      if (!closed) return out;
      out.push([i, j + 1]);
      prev = j;
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out;
}

function unquote(t: string): string {
  const sp = spansOf(t);
  let out = '';
  let pos = 0;
  for (const [a, b] of sp) {
    out += t.slice(pos, a) + '""';
    pos = b;
  }
  return out + t.slice(pos);
}

function inside(sp: Span[], idx: number): boolean {
  for (const [a, b] of sp) if (idx > a && idx < b) return true;
  return false;
}

function splitAttrs(piece: string): { body: string; attrs: Attr[] } {
  const sp = spansOf(piece);
  const hits: { index: number; end: number; kw: string }[] = [];
  for (const m of piece.matchAll(ATTR)) {
    const idx = m.index ?? 0;
    const kw = m[1];
    const kwIdx = idx + m[0].length - kw.length;
    if (inside(sp, kwIdx)) continue;
    hits.push({ index: idx, end: idx + m[0].length, kw });
  }
  if (hits.length === 0) return { body: trimSp(piece), attrs: [] };
  const attrs: Attr[] = [];
  for (let k = 0; k < hits.length; k++) {
    const stop = k + 1 < hits.length ? hits[k + 1].index : piece.length;
    attrs.push([hits[k].kw, trimSp(piece.slice(hits[k].end, stop))]);
  }
  return { body: trimSp(piece.slice(0, hits[0].index)), attrs };
}

function trailingComment(content: string): string {
  const sp = spansOf(content);
  for (let k = 0; k < content.length; k++) {
    if (content[k] !== '#' || k === 0) continue;
    const p = content[k - 1];
    if (p !== ' ' && p !== '\t') continue;
    if (k + 1 < content.length && content[k + 1] !== ' ' && content[k + 1] !== '\t') continue;
    if (inside(sp, k)) continue;
    return content.slice(0, k).replace(/[ \t]+$/, '');
  }
  return content;
}

function suffixOf(p: string): string | null {
  const parts = p.split(/[\\/]/);
  const b = trimSp(parts[parts.length - 1]);
  if (HIDDEN_TAIL.test(b)) throw new Error('hidden tail');
  if (!SIR_TAIL.test(b)) return null;
  const segs = b.slice(0, -4).split('.');
  if (segs[0] !== '' && !UNIT_NAME.test(segs[0])) throw new Error('unit name');
  if (segs.length >= 3) throw new Error('segments');
  if (segs.length === 1) return null;
  if (segs[1] === '') throw new Error('empty id');
  return segs[1];
}

function baseOf(p: string): string {
  const parts = p.split(/[\\/]/);
  return trimSp(parts[parts.length - 1]);
}

function languagesOf(sirFiles: unknown, variants: unknown): Set<string> {
  const langs = new Set<string>();
  const add = (id: string): void => {
    if (!REGISTRY.includes(id)) throw new Error('not in registry');
    langs.add(id);
  };
  let files: unknown[] = [];
  if (sirFiles !== undefined && sirFiles !== null) {
    if (!Array.isArray(sirFiles)) throw new Error('sirFiles');
    files = sirFiles as unknown[];
  }
  for (const f of files) {
    if (typeof f !== 'string') throw new Error('sirFiles element');
    const id = suffixOf(f);
    if (id !== null) add(id);
  }
  if (variants === undefined || variants === null) return langs;
  if (!isMap(variants)) throw new Error('variants');
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(variants)) {
    if (!isMap(v)) throw new Error('variant not map');
    const lang = v['lang'];
    if (lang !== undefined && typeof lang !== 'string') throw new Error('lang');
    const sir = v['sir'];
    let pathLang: string | null = null;
    if (sir !== undefined) {
      if (typeof sir !== 'string') throw new Error('sir');
      pathLang = suffixOf(sir);
      if (!SIR_TAIL.test(baseOf(sir))) throw new Error('sir tail');
    }
    if (!(k === 'package' || VARIANT_KEY.test(k))) throw new Error('key');
    const named: string[] = [];
    let keyOrOwn = false;
    if (k.startsWith('lang:')) {
      named.push(k.slice(5));
      keyOrOwn = true;
    }
    if (lang !== undefined) {
      named.push(lang);
      keyOrOwn = true;
    }
    if (pathLang !== null) named.push(pathLang);
    for (let a = 1; a < named.length; a++) if (named[a] !== named[0]) throw new Error('differ');
    if (keyOrOwn && sir !== undefined && pathLang === null) throw new Error('none suffix');
    if (named.length === 0) continue;
    add(named[0]);
    if (seen.has(named[0])) throw new Error('duplicate');
    seen.add(named[0]);
  }
  return langs;
}

function hasRef(t: string): boolean {
  for (const m of t.matchAll(REF)) if (REGISTRY.includes(m[1])) return true;
  return false;
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error('null input');
  const f: Record<string, unknown> = isMap(input) ? input : {};
  const sirTextRaw = f['sirText'];
  const carriedData = f['carriedData'];
  const envelope = f['envelope'];
  const mode = f['mode'];
  if (sirTextRaw !== undefined && typeof sirTextRaw !== 'string') throw new Error('sirText');
  const sirText = sirTextRaw === undefined ? '' : sirTextRaw;
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');

  const directives: Directive[] = [];
  const prose: string[] = [];
  let cur: Directive | null = null;
  for (const raw of sirText.split(/\r\n|\r|\n/)) {
    const line = raw
      .replace(/^[ \t﻿]+/, (lead) => lead.replace(/﻿/g, ''))
      .replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const l = ' ' + unquote(line);
    prose.push(splitAttrs(l).body);
    const code = trailingComment(content);
    let started = false;
    if (indent === '') {
      const e = code.search(/[ \t]/);
      const token = e < 0 ? code : code.slice(0, e);
      let name: string | null = null;
      if (COLON_NAME.test(token)) name = token.slice(0, -1);
      else if (NAME.test(token)) name = token;
      if (name !== null && name !== 'CITED') {
        const sp = splitAttrs(code.slice(token.length));
        cur = { name, args: sp.body, cont: [], attrs: sp.attrs };
        directives.push(cur);
        started = true;
      }
    }
    if (!started && cur !== null) {
      const sp = splitAttrs(' ' + code);
      if (sp.body !== '') cur.cont.push(sp.body);
      for (const a of sp.attrs) cur.attrs.push(a);
    }
  }

  const has = (n: string): boolean => directives.some((d) => d.name === n);
  const full = (d: Directive): string => [d.args, ...d.cont].join(' ');
  const out = new Set<string>();
  out.add('vectors');

  let carried = Array.isArray(carriedData) && carriedData.length > 0;
  carried = carried || has('CARRIED');
  if (!carried) {
    for (const d of directives) {
      if (d.name !== 'CARRIED-DATA') continue;
      for (const t of [full(d), ...d.attrs.map((a) => a[1])]) {
        const s = trimSp(t);
        if (s !== '' && s !== 'none') carried = true;
      }
    }
  }
  if (carried) out.add('carried-data');
  if ((typeof envelope === 'string' && trimSp(envelope) !== '') || has('ENVELOPE')) out.add('envelope');
  if (
    mode === 'trace' ||
    has('TRACE-SEAM') ||
    directives.some((d) => d.name === 'ORACLE-CLASS' && TRACE_CLASS.test(trimSp(full(d))))
  ) out.add('trace-seam');
  if (mode === 'par' || has('PAR')) out.add('par-interleaving');
  if (mode === 'ring' || has('RING')) out.add('ring');
  if (has('LIFECYCLE') || prose.some((p) => SET_TIMER.test(p))) out.add('lifecycle');
  if (
    directives.some((d) => d.name === 'EFFECT' && EFFECT_TIMER.test(unquote(full(d)))) ||
    prose.some((p) => SCHEDULER.test(p))
  ) out.add('scheduler');
  const langs = languagesOf(f['sirFiles'], f['variants']);
  if (langs.size > 0) out.add('lang-variant');
  let cross = false;
  for (const d of directives) {
    if (d.name === 'ANCHOR') {
      const pieces = [d.args, ...d.cont, ...d.attrs.filter((a) => a[0] === 'ANCHOR').map((a) => a[1])];
      if (pieces.some((p) => hasRef(unquote(p)))) cross = true;
    } else if (d.name === 'FIDELITY' || d.name === 'VARIANT') {
      const anchors = d.attrs.filter((a) => a[0] === 'ANCHOR').map((a) => a[1]);
      if (anchors.length > 0 && hasRef(unquote(anchors.filter((a) => a !== '').join('; ')))) cross = true;
    }
  }
  if (cross) out.add('cross-lang-anchor');
  const order = [
    'vectors', 'carried-data', 'envelope', 'trace-seam', 'par-interleaving',
    'ring', 'lifecycle', 'scheduler', 'lang-variant', 'cross-lang-anchor',
  ];
  return order.filter((n) => out.has(n));
}
