type Dir = { name: string; args: string; cont: string[]; attrs: Array<[string, string]> };

const REGISTRY: string[] = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const LINES = /\r\n|\r|\n/;
const TRIM_SP = /^[ \t]+|[ \t]+$/g;
const TRIM_TAIL = /[ \t]+$/;
const QUOTED = /"(?:\\.|[^"\\])*"/g;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const TRACE_CLASS = /^trace\b/;
const SET_TIMER = /\bsetTimer\b/;
const EFFECT_TIMER = /\btime\.timer\b|\bmicrotask\b/;
const SCHEDULER = /\bschedule\(|\bvirtual time\b|\btimers\./;
const REF = /\bref\(\s*([a-z][a-z0-9]*):/g;
const HIDDEN_TAIL = /\.sir[\p{White_Space}\p{Cc}\p{Cf}]+$/iu;
const LANG_SUFFIX = /\.([^./\\]*)\.sir$/i;

function trimSp(s: string): string {
  return s.replace(TRIM_SP, '');
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function splitPiece(piece: string): { body: string; attrs: Array<[string, string]> } {
  const ms = Array.from(piece.matchAll(ATTR));
  if (ms.length === 0) return { body: trimSp(piece), attrs: [] };
  const attrs: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const from = (m.index ?? 0) + m[0].length;
    const next = ms[i + 1];
    const to = next ? (next.index ?? piece.length) : piece.length;
    attrs.push([m[1], trimSp(piece.slice(from, to))]);
  }
  return { body: piece.slice(0, ms[0].index ?? 0), attrs };
}

function suffix(p: string): string | null {
  const parts = p.split(/[\\/]/);
  const base = trimSp(parts[parts.length - 1]);
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden tail');
  const m = LANG_SUFFIX.exec(base);
  if (m === null) return null;
  if (m[1] === '') throw new Error('empty lang');
  return m[1];
}

function hasRegisteredRef(text: string): boolean {
  for (const m of text.matchAll(REF)) {
    if (REGISTRY.includes(m[1])) return true;
  }
  return false;
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error('null input');
  const f: Record<string, unknown> = isMap(input) ? input : {};
  const sirTextV = f['sirText'];
  const carriedData = f['carriedData'];
  const envelope = f['envelope'];
  const mode = f['mode'];
  const sirFiles = f['sirFiles'];
  const variants = f['variants'];
  if (sirTextV !== undefined && typeof sirTextV !== 'string') throw new Error('sirText');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');
  const sirText = typeof sirTextV === 'string' ? sirTextV : '';

  const dirs: Dir[] = [];
  const prose: string[] = [];
  let cur: Dir | null = null;
  for (const raw of sirText.split(LINES)) {
    const line = raw.replace(/^\uFEFF+/, '').replace(TRIM_TAIL, '');
    if (line === '') continue;
    const indentM = /^[ \t]*/.exec(line);
    const indent = indentM ? indentM[0] : '';
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    prose.push(line);
    const spans: Array<[number, number]> = [];
    for (const m of content.matchAll(QUOTED)) {
      const s = m.index ?? 0;
      spans.push([s, s + m[0].length]);
    }
    let code = content;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const p = content[i - 1];
      if (p !== ' ' && p !== '\t') continue;
      if (i + 1 < content.length) {
        const n = content[i + 1];
        if (n !== ' ' && n !== '\t') continue;
      }
      if (spans.some(([s, e]) => i > s && i < e)) continue;
      code = content.slice(0, i).replace(TRIM_TAIL, '');
      break;
    }
    if (indent === '') {
      const idx = code.search(/[ \t]/);
      const tok = idx < 0 ? code : code.slice(0, idx);
      const name = COLON_NAME.test(tok) ? tok.slice(0, -1) : tok;
      if (NAME.test(name) && name !== 'CITED') {
        const sp = splitPiece(code.slice(tok.length));
        cur = { name, args: sp.body, cont: [], attrs: sp.attrs.slice() };
        dirs.push(cur);
        continue;
      }
    }
    if (cur === null) continue;
    const sp = splitPiece(' ' + code);
    if (sp.body !== '') cur.cont.push(sp.body);
    for (const a of sp.attrs) cur.attrs.push(a);
  }

  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const full = (d: Dir): string => [d.args, ...d.cont].join(' ');
  const pieces = (d: Dir): string[] => [d.args, ...d.cont, ...d.attrs.map((a) => a[1])];

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
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants');
    const seen = new Set<string>();
    for (const [k, v] of Object.entries(variants)) {
      if (!isMap(v)) throw new Error('variant');
      const own = v['lang'];
      const sir = v['sir'];
      if (own !== undefined && typeof own !== 'string') throw new Error('lang');
      if (sir !== undefined && typeof sir !== 'string') throw new Error('sir');
      const named: string[] = [];
      const keyLang = k.startsWith('lang:') ? k.slice(5) : undefined;
      if (keyLang !== undefined) named.push(keyLang);
      if (own !== undefined) named.push(own);
      let pathId: string | null = null;
      if (sir !== undefined) {
        pathId = suffix(sir);
        if (pathId !== null) named.push(pathId);
      }
      for (const n of named) if (n !== named[0]) throw new Error('differ');
      if (keyLang !== undefined && sir !== undefined && pathId === null) throw new Error('key without path lang');
      if (named.length === 0) continue;
      add(named[0]);
      if (seen.has(named[0])) throw new Error('duplicate');
      seen.add(named[0]);
    }
  }

  const out = new Set<string>();
  out.add('vectors');
  if (
    (Array.isArray(carriedData) && carriedData.length > 0) ||
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
  if (has('LIFECYCLE') || prose.some((l) => SET_TIMER.test(l))) out.add('lifecycle');
  if (
    dirs.some((d) => d.name === 'EFFECT' && EFFECT_TIMER.test(full(d))) ||
    prose.some((l) => SCHEDULER.test(l))
  ) out.add('scheduler');
  if (langs.size > 0) out.add('lang-variant');
  if (
    dirs.some((d) => {
      if (d.name === 'ANCHOR') return pieces(d).some(hasRegisteredRef);
      if (d.name === 'FIDELITY' || d.name === 'VARIANT') {
        return d.attrs.some((a) => a[0] === 'ANCHOR' && hasRegisteredRef(a[1]));
      }
      return false;
    })
  ) out.add('cross-lang-anchor');
  return [...out];
}
