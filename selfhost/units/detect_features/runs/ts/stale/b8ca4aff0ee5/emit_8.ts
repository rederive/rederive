type Dir = { name: string; args: string; cont: string[]; attrs: Map<string, string[]> };

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

function field(rec: Record<string, unknown> | null, key: string): unknown {
  if (rec === null) return undefined;
  return Object.prototype.hasOwnProperty.call(rec, key) ? rec[key] : undefined;
}

function splitPiece(piece: string): { body: string; vals: Array<[string, string]> } {
  const ms = Array.from(piece.matchAll(ATTR));
  if (ms.length === 0) return { body: trimSp(piece), vals: [] };
  const vals: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const from = (m.index ?? 0) + m[0].length;
    const next = ms[i + 1];
    const to = next === undefined ? piece.length : (next.index ?? 0);
    vals.push([m[1], trimSp(piece.slice(from, to))]);
  }
  return { body: piece.slice(0, ms[0].index ?? 0), vals };
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

function add(langs: Set<string>, id: string): void {
  if (!REGISTRY.includes(id)) throw new Error('not in registry');
  langs.add(id);
}

function hasRegisteredRef(text: string): boolean {
  for (const m of text.matchAll(REF)) {
    if (REGISTRY.includes(m[1])) return true;
  }
  return false;
}

function languages(sirFiles: unknown, variants: unknown): Set<string> {
  const langs = new Set<string>();
  const files = sirFiles === undefined || sirFiles === null ? [] : sirFiles;
  if (!Array.isArray(files)) throw new Error('sirFiles');
  for (const f of files as unknown[]) {
    if (typeof f !== 'string') throw new Error('sirFiles element');
    const id = suffix(f);
    if (id !== null) add(langs, id);
  }
  if (variants === undefined || variants === null) return langs;
  if (!isMap(variants)) throw new Error('variants');
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(variants)) {
    if (!isMap(v)) throw new Error('variant');
    const lang = field(v, 'lang');
    const sir = field(v, 'sir');
    if (lang !== undefined && typeof lang !== 'string') throw new Error('lang');
    if (Object.prototype.hasOwnProperty.call(v, 'sir') && sir !== undefined && typeof sir !== 'string') {
      throw new Error('sir');
    }
    const named: string[] = [];
    const keyPresent = k.startsWith('lang:');
    if (keyPresent) named.push(k.slice(5));
    if (typeof lang === 'string') named.push(lang);
    let pathSuffix: string | null = null;
    if (typeof sir === 'string') {
      pathSuffix = suffix(sir);
      if (pathSuffix !== null) named.push(pathSuffix);
    }
    for (const n of named) {
      if (n !== named[0]) throw new Error('differ');
    }
    if (keyPresent && typeof sir === 'string' && pathSuffix === null) throw new Error('key without suffix');
    if (named.length === 0) continue;
    add(langs, named[0]);
    if (seen.has(named[0])) throw new Error('duplicate');
    seen.add(named[0]);
  }
  return langs;
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error('null input');
  const rec: Record<string, unknown> | null = isMap(input) ? input : null;
  const sirTextV = field(rec, 'sirText');
  const carried = field(rec, 'carriedData');
  const envelope = field(rec, 'envelope');
  const mode = field(rec, 'mode');
  const sirFiles = field(rec, 'sirFiles');
  const variants = field(rec, 'variants');
  if (sirTextV !== undefined && typeof sirTextV !== 'string') throw new Error('sirText');
  const sirText = sirTextV === undefined ? '' : sirTextV;
  if (carried !== undefined && carried !== null && !Array.isArray(carried)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');

  const dirs: Dir[] = [];
  const prose: string[] = [];
  let cur: Dir | null = null;
  for (const raw of sirText.split(LINES)) {
    const line = raw.replace(/^\uFEFF+/, '').replace(TRIM_TAIL, '');
    if (line === '') continue;
    const indentLen = (/^[ \t]*/.exec(line) as RegExpExecArray)[0].length;
    const content = line.slice(indentLen);
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
      const prev = content[i - 1];
      if (prev !== ' ' && prev !== '\t') continue;
      const nx = content[i + 1];
      if (nx !== undefined && nx !== ' ' && nx !== '\t') continue;
      if (spans.some(([s, e]) => i > s && i < e)) continue;
      code = content.slice(0, i).replace(TRIM_TAIL, '');
      break;
    }
    let started = false;
    if (indentLen === 0) {
      const ws = code.search(/[ \t]/);
      let token = ws === -1 ? code : code.slice(0, ws);
      const tokenLen = token.length;
      if (COLON_NAME.test(token)) token = token.slice(0, -1);
      if (NAME.test(token) && token !== 'CITED') {
        const sp = splitPiece(code.slice(tokenLen));
        const d: Dir = { name: token, args: sp.body, cont: [], attrs: new Map() };
        for (const [k, val] of sp.vals) {
          const a = d.attrs.get(k);
          if (a === undefined) d.attrs.set(k, [val]);
          else a.push(val);
        }
        dirs.push(d);
        cur = d;
        started = true;
      }
    }
    if (!started && cur !== null) {
      const sp = splitPiece(' ' + code);
      if (sp.body !== '') cur.cont.push(sp.body);
      for (const [k, val] of sp.vals) {
        const a = cur.attrs.get(k);
        if (a === undefined) cur.attrs.set(k, [val]);
        else a.push(val);
      }
    }
  }

  const langs = languages(sirFiles, variants);
  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const full = (d: Dir): string => [d.args, ...d.cont].join(' ');
  const pieces = (d: Dir): string[] => {
    const out = [d.args, ...d.cont];
    for (const vs of d.attrs.values()) out.push(...vs);
    return out;
  };
  const wsTrim = (s: string): string => s.trim();

  const result = new Set<string>();
  result.add('vectors');
  if (
    (Array.isArray(carried) && carried.length > 0) ||
    has('CARRIED') ||
    dirs.some((d) => {
      if (d.name !== 'CARRIED-DATA') return false;
      const t = wsTrim(full(d));
      return t !== '' && t !== 'none';
    })
  ) result.add('carried-data');
  if ((typeof envelope === 'string' && wsTrim(envelope) !== '') || has('ENVELOPE')) result.add('envelope');
  if (
    mode === 'trace' ||
    has('TRACE-SEAM') ||
    dirs.some((d) => d.name === 'ORACLE-CLASS' && TRACE_CLASS.test(wsTrim(full(d))))
  ) result.add('trace-seam');
  if (mode === 'par' || has('PAR')) result.add('par-interleaving');
  if (mode === 'ring' || has('RING')) result.add('ring');
  if (has('LIFECYCLE') || prose.some((l) => SET_TIMER.test(l))) result.add('lifecycle');
  if (
    dirs.some((d) => d.name === 'EFFECT' && EFFECT_TIMER.test(full(d))) ||
    prose.some((l) => SCHEDULER.test(l))
  ) result.add('scheduler');
  if (langs.size > 0) result.add('lang-variant');
  if (
    dirs.some((d) => {
      if (d.name === 'ANCHOR') return pieces(d).some(hasRegisteredRef);
      if (d.name === 'FIDELITY' || d.name === 'VARIANT') {
        return (d.attrs.get('ANCHOR') ?? []).some(hasRegisteredRef);
      }
      return false;
    })
  ) result.add('cross-lang-anchor');
  return [...result];
}
