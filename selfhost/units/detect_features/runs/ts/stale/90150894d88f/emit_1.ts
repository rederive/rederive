type Dir = { name: string; args: string; cont: string[]; attrs: Record<string, string[]> };

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

function splitPiece(piece: string): { body: string; attrs: Array<[string, string]> } {
  const ms: Array<{ kw: string; start: number; end: number }> = [];
  const re = new RegExp(ATTR.source, 'g');
  let m: RegExpExecArray | null = re.exec(piece);
  while (m !== null) {
    ms.push({ kw: m[1] as string, start: m.index, end: m.index + m[0].length });
    m = re.exec(piece);
  }
  const first = ms[0];
  if (first === undefined) return { body: piece.trim(), attrs: [] };
  const attrs: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const cur = ms[i] as { kw: string; start: number; end: number };
    const next = ms[i + 1];
    const stop = next === undefined ? piece.length : next.start;
    attrs.push([cur.kw, piece.slice(cur.end, stop).trim()]);
  }
  return { body: piece.slice(0, first.start).trim(), attrs };
}

function addAttrs(d: Dir, attrs: Array<[string, string]>): void {
  for (const [k, v] of attrs) {
    const list = d.attrs[k];
    if (list === undefined) d.attrs[k] = [v];
    else list.push(v);
  }
}

function parse(text: string): Dir[] {
  const dirs: Dir[] = [];
  let cur: Dir | undefined;
  for (const raw of text.split(LINES)) {
    const line = raw.replace(/^﻿+/, '').replace(/[ \t]+$/, '');
    if (line.trim() === '') continue;
    const indentMatch = /^[ \t]*/.exec(line);
    const indent = indentMatch === null ? '' : indentMatch[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const tc = TRAILING_COMMENT.exec(content);
    const code = (tc === null ? content : (tc[1] as string)).replace(/\s+$/, '');
    if (indent === '') {
      const idx = code.search(/[ \t]/);
      const tokenRaw = idx < 0 ? code : code.slice(0, idx);
      const token = COLON_NAME.test(tokenRaw) ? tokenRaw.slice(0, -1) : tokenRaw;
      if (NAME.test(token)) {
        const rest = code.slice(tokenRaw.length).replace(/^[ \t]+/, '');
        const sp = splitPiece(rest);
        const d: Dir = { name: token, args: sp.body, cont: [], attrs: {} };
        addAttrs(d, sp.attrs);
        dirs.push(d);
        cur = d;
        continue;
      }
    }
    if (cur === undefined) continue;
    const sp = splitPiece(' ' + code);
    cur.cont.push(sp.body);
    addAttrs(cur, sp.attrs);
  }
  return dirs;
}

function suffixOf(p: string): string | undefined {
  const parts = p.split(/[\\/]/);
  const b = (parts.pop() as string).trim();
  const m = LANG_SUFFIX.exec(b);
  return m === null ? undefined : (m[1] as string);
}

function refId(a: string): string | undefined {
  const m = REF.exec(a);
  return m === null ? undefined : (m[1] as string);
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error('null input');
  const f: Record<string, unknown> = isMap(input) ? input : {};
  const sirTextV = f['sirText'];
  const carried = f['carriedData'];
  const envelope = f['envelope'];
  const mode = f['mode'];
  const sirFiles = f['sirFiles'];
  const variants = f['variants'];
  if (sirTextV !== undefined && typeof sirTextV !== 'string') throw new Error('sirText');
  if (carried !== undefined && carried !== null && !Array.isArray(carried)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');
  const sirText = sirTextV === undefined ? '' : sirTextV;

  const dirs = parse(sirText);
  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const full = (d: Dir): string => [d.args, ...d.cont].join(' ');
  const body = dirs
    .map((d) => {
      const vals: string[] = [];
      for (const k of Object.keys(d.attrs)) vals.push((d.attrs[k] as string[]).join('; '));
      return [d.args, ...d.cont, ...vals].join(' ');
    })
    .join('\n');

  const langs: string[] = [];
  if (sirFiles !== undefined && sirFiles !== null) {
    if (!Array.isArray(sirFiles)) throw new Error('sirFiles');
    for (const el of sirFiles as unknown[]) {
      if (typeof el !== 'string') throw new Error('sirFiles element');
      const s = suffixOf(el);
      if (s !== undefined) langs.push(s);
    }
  }
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants');
    for (const [k, v] of Object.entries(variants)) {
      const keyLang = k.startsWith('lang:') ? k.slice(5) : undefined;
      let own: string | undefined;
      if (isMap(v) && typeof v['lang'] === 'string') own = v['lang'];
      if (keyLang !== undefined && own !== undefined && keyLang !== own) throw new Error('lang mismatch');
      if (keyLang !== undefined) langs.push(keyLang);
      else if (own !== undefined) langs.push(own);
      if (isMap(v) && typeof v['sir'] === 'string') {
        const s = suffixOf(v['sir']);
        if (s !== undefined) langs.push(s);
      }
    }
  }
  for (const l of langs) if (!REGISTRY.includes(l)) throw new Error('unregistered language');

  const out = new Set<string>();
  out.add('vectors');
  if (
    (Array.isArray(carried) && carried.length > 0) ||
    has('CARRIED') ||
    dirs.some((d) => {
      if (d.name !== 'CARRIED-DATA') return false;
      const t = full(d).trim();
      return t !== '' && t !== 'none';
    })
  ) out.add('carried-data');
  if ((typeof envelope === 'string' && envelope.trim() !== '') || has('ENVELOPE')) out.add('envelope');
  if (
    mode === 'trace' ||
    has('TRACE-SEAM') ||
    dirs.some((d) => d.name === 'ORACLE-CLASS' && TRACE_CLASS.test(full(d).trim()))
  ) out.add('trace-seam');
  if (mode === 'par' || has('PAR')) out.add('par-interleaving');
  if (mode === 'ring' || has('RING')) out.add('ring');
  if (has('LIFECYCLE') || SET_TIMER.test(body)) out.add('lifecycle');
  if (dirs.some((d) => d.name === 'EFFECT' && EFFECT_TIMER.test(full(d))) || SCHEDULER.test(body)) out.add('scheduler');
  if (langs.length > 0) out.add('lang-variant');
  const anchored = dirs.some((d) => {
    if (d.name === 'ANCHOR') {
      const id = refId(d.args);
      if (id !== undefined && REGISTRY.includes(id)) return true;
    }
    const av = d.attrs['ANCHOR'];
    if (av !== undefined) {
      const id = refId(av.join('; '));
      if (id !== undefined && REGISTRY.includes(id)) return true;
    }
    return false;
  });
  if (anchored) out.add('cross-lang-anchor');
  return [...out];
}
