type Dir = { name: string; args: string; cont: string[]; attrs: Map<string, string> };

const REGISTRY: string[] = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const LINES = /\r\n|\r|\n/;
const TRAILING_COMMENT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const TRACE_CLASS = /^trace\b/;
const SET_TIMER = /\bsetTimer\b/;
const EFFECT_TIMER = /\btime\.timer\b|\bmicrotask\b/;
const SCHEDULER = /\bschedule\(|\bvirtual time\b|\btimers\./;
const LANG_SUFFIX = /\.([^./\\]+)\.sir$/i;
const REF = /\bref\(\s*([a-z][a-z0-9]*):/;

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function splitPiece(text: string): { body: string; attrs: Array<[string, string]> } {
  const ms: Array<{ kw: string; start: number; end: number }> = [];
  const re = new RegExp(ATTR.source, 'g');
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    ms.push({ kw: m[1] ?? '', start: m.index, end: m.index + m[0].length });
    m = re.exec(text);
  }
  const first = ms[0];
  if (first === undefined) return { body: text.trim(), attrs: [] };
  const attrs: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const cur = ms[i];
    if (cur === undefined) continue;
    const next = ms[i + 1];
    const stop = next === undefined ? text.length : next.start;
    attrs.push([cur.kw, text.slice(cur.end, stop).trim()]);
  }
  return { body: text.slice(0, first.start).trim(), attrs };
}

function addAttrs(d: Dir, attrs: Array<[string, string]>): void {
  for (const [k, v] of attrs) {
    const prev = d.attrs.get(k);
    d.attrs.set(k, prev === undefined ? v : prev + '; ' + v);
  }
}

function parse(text: string): Dir[] {
  const dirs: Dir[] = [];
  let cur: Dir | null = null;
  for (const raw of text.split(LINES)) {
    const line = raw.replace(/^﻿+/, '').replace(/[ \t]+$/, '');
    if (line.trim() === '') continue;
    const indentMatch = /^[ \t]*/.exec(line);
    const indent = indentMatch === null ? '' : indentMatch[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const tc = TRAILING_COMMENT.exec(content);
    const code = tc === null ? content : (tc[1] ?? '').replace(/\s+$/, '');
    if (indent === '') {
      const idx = code.search(/[ \t]/);
      const tok = idx < 0 ? code : code.slice(0, idx);
      const name = COLON_NAME.test(tok) ? tok.slice(0, -1) : tok;
      if (NAME.test(name)) {
        const rest = code.slice(tok.length).replace(/^[ \t]+/, '');
        const p = splitPiece(rest);
        const d: Dir = { name, args: p.body, cont: [], attrs: new Map<string, string>() };
        addAttrs(d, p.attrs);
        dirs.push(d);
        cur = d;
        continue;
      }
    }
    if (cur === null) continue;
    const p = splitPiece(' ' + code);
    cur.cont.push(p.body);
    addAttrs(cur, p.attrs);
  }
  return dirs;
}

function suffixOf(p: string): string | undefined {
  const parts = p.split(/[\\/]/);
  const b = (parts[parts.length - 1] ?? '').trim();
  const m = LANG_SUFFIX.exec(b);
  return m === null ? undefined : m[1];
}

function languagesOf(sirFiles: unknown, variants: unknown): string[] {
  const out: string[] = [];
  let files: unknown[] = [];
  if (sirFiles !== undefined && sirFiles !== null) {
    if (!Array.isArray(sirFiles)) throw new Error('sirFiles');
    files = sirFiles as unknown[];
  }
  for (const f of files) {
    if (typeof f !== 'string') throw new Error('sirFiles element');
    const s = suffixOf(f);
    if (s !== undefined) out.push(s);
  }
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants');
    for (const [k, v] of Object.entries(variants)) {
      const keyLang = k.startsWith('lang:') ? k.slice(5) : undefined;
      let own: string | undefined;
      if (isMap(v) && typeof v['lang'] === 'string') own = v['lang'];
      if (keyLang !== undefined && own !== undefined && keyLang !== own) throw new Error('lang mismatch');
      if (keyLang !== undefined) out.push(keyLang);
      else if (own !== undefined) out.push(own);
      if (isMap(v) && typeof v['sir'] === 'string') {
        const s = suffixOf(v['sir']);
        if (s !== undefined) out.push(s);
      }
    }
  }
  for (const l of out) {
    if (!REGISTRY.includes(l)) throw new Error(l + ' is not in the closed language registry');
  }
  return out;
}

function anchorRegistered(a: string): boolean {
  const m = REF.exec(a);
  if (m === null) return false;
  return REGISTRY.includes(m[1] ?? '');
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error('null input');
  const f: Record<string, unknown> = isMap(input) ? input : {};
  const sirTextRaw = f['sirText'];
  const carriedData = f['carriedData'];
  const envelope = f['envelope'];
  const mode = f['mode'];
  if (sirTextRaw !== undefined && typeof sirTextRaw !== 'string') throw new Error('sirText');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');
  const sirText = sirTextRaw === undefined ? '' : sirTextRaw;
  const dirs = parse(sirText);
  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const full = (d: Dir): string => [d.args, ...d.cont].join(' ');
  const body = dirs.map((d) => [d.args, ...d.cont, ...Array.from(d.attrs.values())].join(' ')).join('\n');

  const langs = languagesOf(f['sirFiles'], f['variants']);

  const res = new Set<string>();
  res.add('vectors');
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
  if (mode === 'trace' || has('TRACE-SEAM') || dirs.some((d) => d.name === 'ORACLE-CLASS' && TRACE_CLASS.test(full(d).trim()))) res.add('trace-seam');
  if (mode === 'par' || has('PAR')) res.add('par-interleaving');
  if (mode === 'ring' || has('RING')) res.add('ring');
  if (has('LIFECYCLE') || SET_TIMER.test(body)) res.add('lifecycle');
  if (dirs.some((d) => d.name === 'EFFECT' && EFFECT_TIMER.test(full(d))) || SCHEDULER.test(body)) res.add('scheduler');
  if (langs.length > 0) res.add('lang-variant');
  if (
    dirs.some((d) => {
      if (d.name === 'ANCHOR' && anchorRegistered(d.args)) return true;
      const a = d.attrs.get('ANCHOR');
      return a !== undefined && anchorRegistered(a);
    })
  ) res.add('cross-lang-anchor');
  return [...res];
}
