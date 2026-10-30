type Dir = { name: string; args: string; cont: string[]; attrs: Array<[string, string]> };
type Split = { body: string; attrs: Array<[string, string]> };

const REGISTRY = new Set<string>(['js', 'ts', 'rust', 'php', 'csharp', 'python']);
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

function splitPiece(piece: string): Split {
  const ms = Array.from(piece.matchAll(ATTR));
  if (ms.length === 0) return { body: trimSp(piece), attrs: [] };
  const first = ms[0];
  const body = trimSp(piece.slice(0, first ? first.index ?? 0 : 0));
  const attrs: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (!m) continue;
    const start = (m.index ?? 0) + m[0].length;
    const nx = ms[i + 1];
    const end = nx ? nx.index ?? piece.length : piece.length;
    attrs.push([m[1] ?? '', trimSp(piece.slice(start, end))]);
  }
  return { body, attrs };
}

function parse(text: string): { dirs: Dir[]; prose: string[] } {
  const dirs: Dir[] = [];
  const prose: string[] = [];
  let cur: Dir | null = null;
  for (const raw of text.split(/\r\n|\r|\n/)) {
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
      let inside = false;
      for (const [s, e] of spans) {
        if (i > s && i < e) inside = true;
      }
      if (inside) continue;
      code = content.slice(0, i).replace(TRIM_TAIL, '');
      break;
    }
    if (indent === '') {
      const idx = code.search(/[ \t]/);
      const tokLen = idx === -1 ? code.length : idx;
      let tok = code.slice(0, tokLen);
      if (COLON_NAME.test(tok)) tok = tok.slice(0, -1);
      if (NAME.test(tok) && tok !== 'CITED') {
        const sp = splitPiece(code.slice(tokLen));
        cur = { name: tok, args: sp.body, cont: [], attrs: sp.attrs.slice() };
        dirs.push(cur);
        continue;
      }
    }
    if (cur === null) continue;
    const sp = splitPiece(' ' + code);
    if (sp.body !== '') cur.cont.push(sp.body);
    for (const a of sp.attrs) cur.attrs.push(a);
  }
  return { dirs, prose };
}

function full(d: Dir): string {
  return [d.args, ...d.cont].join(' ');
}

function hasRegRef(s: string): boolean {
  for (const m of s.matchAll(REF)) {
    if (REGISTRY.has(m[1] ?? '')) return true;
  }
  return false;
}

function suffix(p: string): string | null {
  const parts = p.split(/[\\/]/);
  const base = trimSp(parts[parts.length - 1] ?? '');
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden tail');
  const m = LANG_SUFFIX.exec(base);
  if (!m) return null;
  const id = m[1] ?? '';
  if (id === '') throw new Error('empty lang');
  return id;
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function languages(sirFiles: unknown, variants: unknown): Set<string> {
  const langs = new Set<string>();
  const add = (id: string): void => {
    if (!REGISTRY.has(id)) throw new Error('not in registry');
    langs.add(id);
  };
  let files: unknown[] = [];
  if (sirFiles !== undefined && sirFiles !== null) {
    if (!Array.isArray(sirFiles)) throw new Error('sirFiles');
    files = sirFiles as unknown[];
  }
  for (const f of files) {
    if (typeof f !== 'string') throw new Error('sirFiles element');
    const id = suffix(f);
    if (id !== null) add(id);
  }
  if (variants === undefined || variants === null) return langs;
  if (!isMap(variants)) throw new Error('variants');
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(variants)) {
    if (!isMap(v)) throw new Error('variant');
    const lang = v['lang'];
    const sir = v['sir'];
    if (lang !== undefined && typeof lang !== 'string') throw new Error('lang');
    if (sir !== undefined && typeof sir !== 'string') throw new Error('sir');
    const named: string[] = [];
    const keyLang = k.startsWith('lang:') ? k.slice(5) : null;
    if (keyLang !== null) named.push(keyLang);
    if (typeof lang === 'string') named.push(lang);
    let pathLang: string | null = null;
    if (typeof sir === 'string') pathLang = suffix(sir);
    if (pathLang !== null) named.push(pathLang);
    for (const n of named) {
      if (n !== named[0]) throw new Error('differ');
    }
    if (keyLang !== null && typeof sir === 'string' && pathLang === null) throw new Error('sir none');
    const id = named[0];
    if (id === undefined) continue;
    add(id);
    if (seen.has(id)) throw new Error('duplicate');
    seen.add(id);
  }
  return langs;
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error('null input');
  const rec: Record<string, unknown> = isMap(input) ? input : {};
  const sirText = rec['sirText'];
  const carriedData = rec['carriedData'];
  const envelope = rec['envelope'];
  const mode = rec['mode'];
  if (sirText !== undefined && typeof sirText !== 'string') throw new Error('sirText');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');
  const { dirs, prose } = parse(sirText === undefined ? '' : sirText);
  const langs = languages(rec['sirFiles'], rec['variants']);
  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const out = new Set<string>();
  out.add('vectors');
  if (
    (Array.isArray(carriedData) && carriedData.length > 0) ||
    has('CARRIED') ||
    dirs.some((d) => {
      if (d.name !== 'CARRIED-DATA') return false;
      const f = full(d).trim();
      return f !== '' && f !== 'none';
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
      const anchorVals = d.attrs.filter((a) => a[0] === 'ANCHOR').map((a) => a[1]);
      if (d.name === 'ANCHOR') {
        return [d.args, ...d.cont, ...d.attrs.map((a) => a[1])].some(hasRegRef);
      }
      if (d.name === 'FIDELITY' || d.name === 'VARIANT') return anchorVals.some(hasRegRef);
      return false;
    })
  ) out.add('cross-lang-anchor');
  return [...out];
}
