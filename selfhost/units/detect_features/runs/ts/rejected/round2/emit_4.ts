type Dir = { name: string; args: string; cont: string[]; attrs: Map<string, string[]> };

const LINES = /\r\n|\r|\n/;
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
const REGISTRY = new Set<string>(['js', 'ts', 'rust', 'php', 'csharp', 'python']);

function trimSp(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

function splitAttr(piece: string): { body: string; vals: Array<[string, string]> } {
  const ms = [...piece.matchAll(ATTR)];
  if (ms.length === 0) return { body: trimSp(piece), vals: [] };
  const first = ms[0];
  const body = piece.slice(0, first.index ?? 0);
  const vals: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < ms.length ? (ms[i + 1].index ?? piece.length) : piece.length;
    vals.push([m[1], trimSp(piece.slice(start, end))]);
  }
  return { body, vals };
}

function addVals(d: Dir, vals: Array<[string, string]>): void {
  for (const [k, v] of vals) {
    const l = d.attrs.get(k);
    if (l) l.push(v);
    else d.attrs.set(k, [v]);
  }
}

function suffix(p: string): string | null {
  const parts = p.split(/[\\/]/);
  const last = parts[parts.length - 1];
  const base = trimSp(last === undefined ? '' : last);
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden suffix');
  const m = LANG_SUFFIX.exec(base);
  if (!m) return null;
  if (m[1] === '') throw new Error('empty lang');
  return m[1];
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasRef(text: string): boolean {
  for (const m of text.matchAll(REF)) {
    if (REGISTRY.has(m[1])) return true;
  }
  return false;
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error('null input');
  const f: Record<string, unknown> =
    typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const sirTextRaw = f['sirText'];
  const carriedData = f['carriedData'];
  const envelope = f['envelope'];
  const mode = f['mode'];
  const sirFiles = f['sirFiles'];
  const variants = f['variants'];

  if (sirTextRaw !== undefined && typeof sirTextRaw !== 'string') throw new Error('sirText');
  const sirText = sirTextRaw === undefined ? '' : sirTextRaw;
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');

  const dirs: Dir[] = [];
  const prose: string[] = [];
  let cur: Dir | null = null;
  for (const raw of sirText.split(LINES)) {
    const line = trimSp(raw.replace(/^\uFEFF+/, '')).replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    prose.push(line);
    const spans = [...content.matchAll(QUOTED)].map((m): [number, number] => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
    let code = content;
    for (let i = 0; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const p = content[i - 1];
      if (i === 0 || (p !== ' ' && p !== '\t')) continue;
      const n = content[i + 1];
      if (n !== undefined && n !== ' ' && n !== '\t') continue;
      if (spans.some(([s, e]) => i > s && i < e)) continue;
      code = trimSp(content.slice(0, i)).replace(/[ \t]+$/, '');
      break;
    }
    if (indent === '') {
      const sp = code.search(/[ \t]/);
      const tok = sp < 0 ? code : code.slice(0, sp);
      const nm = COLON_NAME.test(tok) ? tok.slice(0, -1) : tok;
      if (NAME.test(nm) && nm !== 'CITED') {
        const { body, vals } = splitAttr(code.slice(tok.length));
        const d: Dir = { name: nm, args: body, cont: [], attrs: new Map() };
        addVals(d, vals);
        dirs.push(d);
        cur = d;
        continue;
      }
    }
    if (cur === null) continue;
    const { body, vals } = splitAttr(' ' + code);
    if (body !== '') cur.cont.push(body);
    addVals(cur, vals);
  }

  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const full = (d: Dir): string => [d.args, ...d.cont].join(' ');
  const pieces = (d: Dir): string[] => {
    const out = [d.args, ...d.cont];
    for (const l of d.attrs.values()) out.push(...l);
    return out;
  };

  const langs = new Set<string>();
  const add = (id: string): void => {
    if (!REGISTRY.has(id)) throw new Error('not in registry');
    langs.add(id);
  };
  const files = sirFiles === undefined || sirFiles === null ? [] : sirFiles;
  if (!Array.isArray(files)) throw new Error('sirFiles');
  for (const e of files as unknown[]) {
    if (typeof e !== 'string') throw new Error('sirFiles element');
    const id = suffix(e);
    if (id !== null) add(id);
  }
  if (variants !== undefined && variants !== null) {
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
      if (typeof sir === 'string') {
        pathLang = suffix(sir);
        if (pathLang !== null) named.push(pathLang);
      }
      for (const n of named) if (n !== named[0]) throw new Error('differ');
      if (keyLang !== null && typeof sir === 'string' && pathLang === null) throw new Error('sir none');
      if (named.length === 0) continue;
      const id = named[0];
      add(id);
      if (seen.has(id)) throw new Error('dup');
      seen.add(id);
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
      if (d.name === 'ANCHOR') return pieces(d).some(hasRef);
      if (d.name === 'FIDELITY' || d.name === 'VARIANT') return (d.attrs.get('ANCHOR') ?? []).some(hasRef);
      return false;
    })
  ) out.add('cross-lang-anchor');
  return [...out];
}
