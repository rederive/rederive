type Dir = { name: string; args: string; cont: string[]; attrs: Map<string, string[]> };

const REGISTRY: string[] = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const LINES = /\r\n|\r|\n/;
const TRAILING_COMMENT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
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
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const ms: RegExpExecArray[] = [];
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    ms.push(m);
    if (m[0].length === 0) re.lastIndex++;
    m = re.exec(text);
  }
  const first = ms[0];
  if (first === undefined) return { body: text.trim(), attrs: [] };
  const attrs: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const cur = ms[i];
    if (cur === undefined) continue;
    const next = ms[i + 1];
    const end = next === undefined ? text.length : next.index;
    attrs.push([cur[1] ?? '', text.slice(cur.index + cur[0].length, end).trim()]);
  }
  return { body: text.slice(0, first.index).trim(), attrs };
}

function addAttrs(d: Dir, attrs: Array<[string, string]>): void {
  for (const [k, v] of attrs) {
    const list = d.attrs.get(k);
    if (list === undefined) d.attrs.set(k, [v]);
    else list.push(v);
  }
}

function parse(text: string): Dir[] {
  const dirs: Dir[] = [];
  let cur: Dir | null = null;
  for (const raw of text.split(LINES)) {
    const line = raw.replace(/^﻿+/, '').replace(/[ \t]+$/, '');
    if (line.trim() === '') continue;
    const indent = (/^[ \t]*/.exec(line) ?? [''])[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const tc = TRAILING_COMMENT.exec(content);
    const code = tc !== null ? (tc[1] ?? '').replace(/\s+$/, '') : content;
    if (indent.length === 0) {
      const idx = code.search(/[ \t]/);
      let tok = idx < 0 ? code : code.slice(0, idx);
      if (COLON_NAME.test(tok)) tok = tok.slice(0, -1);
      if (NAME.test(tok)) {
        const rest = idx < 0 ? '' : code.slice(idx).replace(/^[ \t]+/, '');
        const p = splitPiece(rest);
        cur = { name: tok, args: p.body, cont: [], attrs: new Map() };
        addAttrs(cur, p.attrs);
        dirs.push(cur);
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

function suffix(p: string): string | undefined {
  const parts = p.split(/[\\/]/);
  const b = (parts[parts.length - 1] ?? '').trim();
  const m = LANG_SUFFIX.exec(b);
  return m === null ? undefined : m[1];
}

function full(d: Dir): string {
  return [d.args, ...d.cont].join(' ');
}

function refId(a: string): string | undefined {
  const m = REF.exec(a);
  return m === null ? undefined : m[1];
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

  const langs: string[] = [];
  const contribute = (id: string): void => {
    if (!REGISTRY.includes(id)) throw new Error('language not in registry');
    langs.push(id);
  };
  if (sirFiles !== undefined && sirFiles !== null) {
    if (!Array.isArray(sirFiles)) throw new Error('sirFiles');
    for (const e of sirFiles as unknown[]) {
      if (typeof e !== 'string') throw new Error('sirFiles element');
      const s = suffix(e);
      if (s !== undefined) contribute(s);
    }
  }
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants');
    for (const [k, v] of Object.entries(variants)) {
      const keyLang = k.startsWith('lang:') ? k.slice(5) : undefined;
      let ownLang: string | undefined;
      let sir: string | undefined;
      if (isMap(v)) {
        const l = v['lang'];
        if (typeof l === 'string') ownLang = l;
        const s = v['sir'];
        if (typeof s === 'string') sir = s;
      }
      if (keyLang !== undefined && ownLang !== undefined && keyLang !== ownLang) throw new Error('lang mismatch');
      if (keyLang !== undefined) contribute(keyLang);
      else if (ownLang !== undefined) contribute(ownLang);
      if (sir !== undefined) {
        const s = suffix(sir);
        if (s !== undefined) contribute(s);
      }
    }
  }

  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const body = dirs
    .map((d) => {
      const parts = [d.args, ...d.cont];
      for (const vals of d.attrs.values()) parts.push(vals.join('; '));
      return parts.join(' ');
    })
    .join('\n');

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
    const av = d.attrs.get('ANCHOR');
    if (av !== undefined) {
      const id = refId(av.join('; '));
      if (id !== undefined && REGISTRY.includes(id)) return true;
    }
    return false;
  });
  if (anchored) out.add('cross-lang-anchor');
  return [...out];
}
