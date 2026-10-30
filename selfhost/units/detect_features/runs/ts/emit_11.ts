type Attr = [string, string];
interface Directive { name: string; args: string; cont: string[]; attrs: Attr[]; }

const OPENERS = ' \t([{,=:;|<>!&-~';
const REGISTRY = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const TRIM_SP = /^[ \t]+|[ \t]+$/g;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const TRACE_CLASS = /^trace(?![A-Za-z0-9_])/;
const SET_TIMER = /\bsetTimer\b/;
const EFFECT_TIMER = /\btime\.timer\b|\bmicrotask\b/;
const SCHEDULER = /\bschedule\(|\bvirtual time\b|\btimers\./;
const HIDDEN_TAIL = /\.[sS][iI][rR][^\x21-\x7e]+$/;
const SIR_TAIL = /\.[sS][iI][rR]$/;
const UNIT_NAME = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const VARIANT_KEY = /^lang:[a-z][a-z0-9]*$/;

function trimSp(s: string): string { return s.replace(TRIM_SP, ''); }

function spans(t: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let prev = -2;
  let i = 0;
  while (i < t.length) {
    if (t[i] === '"' && (i === 0 || OPENERS.includes(t[i - 1]) || i === prev + 1)) {
      let j = i + 1;
      let closer = -1;
      while (j < t.length) {
        const c = t[j];
        if (c === '\\') {
          if (j + 1 >= t.length) { j = t.length; break; }
          const cp = t.codePointAt(j + 1);
          j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
        } else if (c === '"') { closer = j; break; } else j++;
      }
      if (closer < 0) break;
      out.push([i, closer + 1]);
      prev = closer;
      i = closer + 1;
    } else i++;
  }
  return out;
}

function unquote(t: string): string {
  const sp = spans(t);
  let out = '';
  let pos = 0;
  for (const [a, b] of sp) { out += t.slice(pos, a) + '""'; pos = b; }
  return out + t.slice(pos);
}

function splitAttr(piece: string): { body: string; attrs: Attr[] } {
  const sp = spans(piece);
  const hits: Array<{ run: number; kw: string; end: number }> = [];
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  let m: RegExpExecArray | null = re.exec(piece);
  while (m !== null) {
    const kwIdx = m.index + m[0].length - m[1].length;
    let inside = false;
    for (const [a, b] of sp) if (kwIdx > a && kwIdx < b - 1) inside = true;
    if (!inside) hits.push({ run: m.index, kw: m[1], end: m.index + m[0].length });
    m = re.exec(piece);
  }
  if (hits.length === 0) return { body: trimSp(piece), attrs: [] };
  const attrs: Attr[] = [];
  for (let k = 0; k < hits.length; k++) {
    const stop = k + 1 < hits.length ? hits[k + 1].run : piece.length;
    attrs.push([hits[k].kw, trimSp(piece.slice(hits[k].end, stop))]);
  }
  return { body: trimSp(piece.slice(0, hits[0].run)), attrs };
}

function trailingComment(content: string): string {
  const sp = spans(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== '#') continue;
    const p = content[i - 1];
    if (p !== ' ' && p !== '\t') continue;
    if (i + 1 < content.length && content[i + 1] !== ' ' && content[i + 1] !== '\t') continue;
    let inside = false;
    for (const [a, b] of sp) if (i > a && i < b - 1) inside = true;
    if (inside) continue;
    return content.slice(0, i).replace(/[ \t]+$/, '');
  }
  return content;
}

function suffix(p: string): string | null {
  const parts = p.split(/[\\/]/);
  const base = trimSp(parts[parts.length - 1]);
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden');
  if (!SIR_TAIL.test(base)) return null;
  const segs = base.slice(0, -4).split('.');
  if (segs[0] !== '' && !UNIT_NAME.test(segs[0])) throw new Error('unit');
  if (segs.length >= 3) throw new Error('segs');
  if (segs.length === 1) return null;
  if (segs[1] === '') throw new Error('empty');
  return segs[1];
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasRef(t: string): boolean {
  for (const m of t.matchAll(/\bref\([ \t]*([a-z][a-z0-9]*):/g)) {
    if (REGISTRY.includes(m[1])) return true;
  }
  return false;
}

function langs(sirFiles: unknown, variants: unknown): Set<string> {
  const set = new Set<string>();
  const add = (id: string): void => {
    if (!REGISTRY.includes(id)) throw new Error('registry');
    set.add(id);
  };
  let files: unknown = sirFiles;
  if (files === undefined || files === null) files = [];
  if (!Array.isArray(files)) throw new Error('sirFiles');
  for (const f of files as unknown[]) {
    if (typeof f !== 'string') throw new Error('sirFiles element');
    const id = suffix(f);
    if (id !== null) add(id);
  }
  if (variants === undefined || variants === null) return set;
  if (!isMap(variants)) throw new Error('variants');
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(variants)) {
    if (!isMap(v)) throw new Error('variant');
    const lang = v.lang;
    if (lang !== undefined && typeof lang !== 'string') throw new Error('lang');
    const sir = v.sir;
    let pathLang: string | null = null;
    if (sir !== undefined) {
      if (typeof sir !== 'string') throw new Error('sir');
      pathLang = suffix(sir);
      const parts = sir.split(/[\\/]/);
      const base = trimSp(parts[parts.length - 1]);
      if (!SIR_TAIL.test(base)) throw new Error('sir tail');
    }
    if (!(k === 'package' || VARIANT_KEY.test(k))) throw new Error('key');
    const named: string[] = [];
    let keyLang: string | null = null;
    if (k.startsWith('lang:')) { keyLang = k.slice(5); named.push(keyLang); }
    if (lang !== undefined) named.push(lang);
    if (pathLang !== null) named.push(pathLang);
    for (const n of named) if (n !== named[0]) throw new Error('differ');
    if ((keyLang !== null || lang !== undefined) && sir !== undefined && pathLang === null) throw new Error('none');
    if (named.length === 0) continue;
    add(named[0]);
    if (seen.has(named[0])) throw new Error('dup');
    seen.add(named[0]);
  }
  return set;
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error('null input');
  const f: Record<string, unknown> = typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const sirTextRaw = f.sirText;
  if (sirTextRaw !== undefined && typeof sirTextRaw !== 'string') throw new Error('sirText');
  const sirText = sirTextRaw === undefined ? '' : sirTextRaw;
  const carried = f.carriedData;
  if (carried !== undefined && carried !== null && !Array.isArray(carried)) throw new Error('carriedData');
  const envelope = f.envelope;
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope');
  const mode = f.mode;

  const dirs: Directive[] = [];
  const prose: string[] = [];
  let cur: Directive | null = null;
  for (const raw of sirText.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/^[ \t﻿]+/, (lead) => lead.replace(/﻿/g, '')).replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = (/^[ \t]*/.exec(line) as RegExpExecArray)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const l = ' ' + unquote(line);
    prose.push(splitAttr(l).body);
    const code = trailingComment(content);
    let started = false;
    if (indent === '') {
      const e = code.search(/[ \t]/);
      const tok = e < 0 ? code : code.slice(0, e);
      const nm = COLON_NAME.test(tok) ? tok.slice(0, -1) : tok;
      if (NAME.test(nm) && nm !== 'CITED') {
        const sp = splitAttr(code.slice(tok.length));
        cur = { name: nm, args: sp.body, cont: [], attrs: sp.attrs };
        dirs.push(cur);
        started = true;
      }
    }
    if (!started && cur !== null) {
      const sp = splitAttr(' ' + code);
      if (sp.body !== '') cur.cont.push(sp.body);
      for (const a of sp.attrs) cur.attrs.push(a);
    }
  }

  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const full = (d: Directive): string => [d.args, ...d.cont].join(' ');

  const langSet = langs(f.sirFiles, f.variants);

  const out: string[] = ['vectors'];
  let cd = (Array.isArray(carried) && carried.length > 0) || has('CARRIED');
  if (!cd) {
    for (const d of dirs) {
      if (d.name !== 'CARRIED-DATA') continue;
      const texts = [full(d), ...d.attrs.map((a) => a[1])];
      if (texts.some((t) => { const s = trimSp(t); return s !== '' && s !== 'none'; })) cd = true;
    }
  }
  if (cd) out.push('carried-data');
  if ((typeof envelope === 'string' && trimSp(envelope) !== '') || has('ENVELOPE')) out.push('envelope');
  if (mode === 'trace' || has('TRACE-SEAM') || dirs.some((d) => d.name === 'ORACLE-CLASS' && TRACE_CLASS.test(trimSp(full(d))))) out.push('trace-seam');
  if (mode === 'par' || has('PAR')) out.push('par-interleaving');
  if (mode === 'ring' || has('RING')) out.push('ring');
  if (has('LIFECYCLE') || prose.some((p) => SET_TIMER.test(p))) out.push('lifecycle');
  if (dirs.some((d) => d.name === 'EFFECT' && EFFECT_TIMER.test(unquote(full(d)))) || prose.some((p) => SCHEDULER.test(p))) out.push('scheduler');
  if (langSet.size > 0) out.push('lang-variant');
  let cross = false;
  for (const d of dirs) {
    if (d.name === 'ANCHOR') {
      const pieces = [d.args, ...d.cont, ...d.attrs.filter((a) => a[0] === 'ANCHOR').map((a) => a[1])];
      if (pieces.some((p) => hasRef(unquote(p)))) cross = true;
    } else if (d.name === 'FIDELITY' || d.name === 'VARIANT') {
      const anchors = d.attrs.filter((a) => a[0] === 'ANCHOR').map((a) => a[1]);
      if (anchors.length > 0 && hasRef(unquote(anchors.filter((a) => a !== '').join('; ')))) cross = true;
    }
  }
  if (cross) out.push('cross-lang-anchor');
  return out;
}
