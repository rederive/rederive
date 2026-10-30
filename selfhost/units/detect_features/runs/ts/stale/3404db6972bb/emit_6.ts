type Dir = { name: string; args: string; cont: string[]; attrs: Map<string, string[]> };

const REGISTRY = new Set(['js', 'ts', 'rust', 'php', 'csharp', 'python']);
const trimSp = (s: string): string => s.replace(/^[ \t]+|[ \t]+$/g, '');

function splitPiece(piece: string): { body: string; vals: Array<[string, string]> } {
  const ms = [...piece.matchAll(/[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g)];
  if (ms.length === 0) return { body: trimSp(piece), vals: [] };
  const first = ms[0];
  const vals: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < ms.length ? (ms[i + 1].index ?? piece.length) : piece.length;
    vals.push([m[1], trimSp(piece.slice(start, end))]);
  }
  return { body: piece.slice(0, first.index ?? 0), vals };
}

function suffix(p: string): string | null {
  const parts = p.split(/[\\/]/);
  const base = trimSp(parts[parts.length - 1] ?? '');
  if (/\.sir[\p{White_Space}\p{Cc}\p{Cf}]+$/iu.test(base)) throw new Error('hidden');
  const m = base.match(/\.([^./\\]*)\.sir$/i);
  if (m === null) return null;
  if (m[1] === '') throw new Error('empty');
  return m[1];
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error('null input');
  const o: Record<string, unknown> =
    typeof input === 'object' && input !== undefined && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const sirTextRaw = o.sirText;
  const carriedData = o.carriedData;
  const envelope = o.envelope;
  const mode = o.mode;
  if (sirTextRaw !== undefined && typeof sirTextRaw !== 'string') throw new Error('sirText');
  const sirText: string = sirTextRaw === undefined ? '' : sirTextRaw;
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');

  const dirs: Dir[] = [];
  const prose: string[] = [];
  let cur: Dir | null = null;
  for (const raw of sirText.split(/\r\n|\r|\n/)) {
    const line = trimSp(raw.replace(/^\uFEFF+/, '')).replace(/^[ \t]+$/, '');
    const physical = raw.replace(/^\uFEFF+/, '').replace(/[ \t]+$/, '');
    if (physical === '') continue;
    void line;
    const indent = (physical.match(/^[ \t]*/) ?? [''])[0];
    const content = physical.slice(indent.length);
    if (content.startsWith('#')) continue;
    prose.push(physical);
    const spans: Array<[number, number]> = [];
    for (const m of content.matchAll(/"(?:\\.|[^"\\])*"/g)) {
      const s = m.index ?? 0;
      spans.push([s, s + m[0].length]);
    }
    let code = content;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const prev = content[i - 1];
      if (prev !== ' ' && prev !== '\t') continue;
      const next = content[i + 1];
      if (next !== undefined && next !== ' ' && next !== '\t') continue;
      if (spans.some(([s, e]) => i > s && i < e - 1)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, '');
      break;
    }
    let isDir = false;
    if (indent.length === 0) {
      const si = code.search(/[ \t]/);
      const tok = si === -1 ? code : code.slice(0, si);
      const name = /^[A-Z][A-Z0-9-]*:$/.test(tok) ? tok.slice(0, -1) : tok;
      if (/^(?:[A-Z][A-Z0-9-]*|R\d+)$/.test(name) && name !== 'CITED') {
        isDir = true;
        const rest = code.slice(tok.length);
        const sp = splitPiece(rest);
        cur = { name, args: sp.body, cont: [], attrs: new Map() };
        for (const [k, v] of sp.vals) cur.attrs.set(k, [...(cur.attrs.get(k) ?? []), v]);
        dirs.push(cur);
      }
    }
    if (!isDir && cur !== null) {
      const sp = splitPiece(' ' + code);
      if (sp.body !== '') cur.cont.push(sp.body);
      for (const [k, v] of sp.vals) cur.attrs.set(k, [...(cur.attrs.get(k) ?? []), v]);
    }
  }

  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const full = (d: Dir): string => [d.args, ...d.cont].join(' ');
  const pieces = (d: Dir): string[] => {
    const r = [d.args, ...d.cont];
    for (const vs of d.attrs.values()) r.push(...vs);
    return r;
  };
  const hasRef = (t: string): boolean => {
    for (const m of t.matchAll(/\bref\(\s*([a-z][a-z0-9]*):/g)) if (REGISTRY.has(m[1])) return true;
    return false;
  };

  const langs = new Set<string>();
  const add = (id: string): void => {
    if (!REGISTRY.has(id)) throw new Error('registry');
    langs.add(id);
  };
  const sf = o.sirFiles;
  if (sf !== undefined && sf !== null) {
    if (!Array.isArray(sf)) throw new Error('sirFiles');
    for (const e of sf as unknown[]) {
      if (typeof e !== 'string') throw new Error('sirFiles element');
      const id = suffix(e);
      if (id !== null) add(id);
    }
  }
  const vr = o.variants;
  if (vr !== undefined && vr !== null) {
    if (!isMap(vr)) throw new Error('variants');
    const seen = new Set<string>();
    for (const [k, v] of Object.entries(vr)) {
      if (!isMap(v)) throw new Error('variant');
      if (v.lang !== undefined && typeof v.lang !== 'string') throw new Error('lang');
      if (v.sir !== undefined && typeof v.sir !== 'string') throw new Error('sir');
      const named: string[] = [];
      if (k.startsWith('lang:')) named.push(k.slice(5));
      if (typeof v.lang === 'string') named.push(v.lang);
      if (typeof v.sir === 'string') {
        const id = suffix(v.sir);
        if (id !== null) named.push(id);
        else if (k.startsWith('lang:')) throw new Error('sir none');
      }
      if (named.some((n) => n !== named[0])) throw new Error('differ');
      if (named.length === 0) continue;
      add(named[0]);
      if (seen.has(named[0])) throw new Error('dup');
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
    dirs.some((d) => d.name === 'ORACLE-CLASS' && /^trace\b/.test(full(d).trim()))
  ) out.add('trace-seam');
  if (mode === 'par' || has('PAR')) out.add('par-interleaving');
  if (mode === 'ring' || has('RING')) out.add('ring');
  if (has('LIFECYCLE') || prose.some((l) => /\bsetTimer\b/.test(l))) out.add('lifecycle');
  if (
    dirs.some((d) => d.name === 'EFFECT' && /\btime\.timer\b|\bmicrotask\b/.test(full(d))) ||
    prose.some((l) => /\bschedule\(|\bvirtual time\b|\btimers\./.test(l))
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
