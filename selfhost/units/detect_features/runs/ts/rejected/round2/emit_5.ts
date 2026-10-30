type Rec = Record<string, unknown>;
type Dir = { name: string; args: string; cont: string[]; attrs: Map<string, string[]> };

const LINES = /\r\n|\r|\n/;
const TRIM_SP = /^[ \t]+|[ \t]+$/g;
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
const REGISTRY = new Set<string>(["js", "ts", "rust", "php", "csharp", "python"]);

function trimSp(s: string): string {
  return s.replace(TRIM_SP, "");
}

function isMap(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function splitPiece(piece: string): { body: string; vals: Array<[string, string]> } {
  const ms = Array.from(piece.matchAll(ATTR));
  if (ms.length === 0) return { body: trimSp(piece), vals: [] };
  const vals: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const start = (m.index ?? 0) + m[0].length;
    const next = i + 1 < ms.length ? (ms[i + 1].index ?? piece.length) : piece.length;
    vals.push([m[1], trimSp(piece.slice(start, next))]);
  }
  return { body: trimSp(piece.slice(0, ms[0].index ?? 0)), vals };
}

function addAttrs(d: Dir, vals: Array<[string, string]>): void {
  for (const [k, v] of vals) {
    const cur = d.attrs.get(k);
    if (cur) cur.push(v);
    else d.attrs.set(k, [v]);
  }
}

function parse(text: string): { dirs: Dir[]; prose: string[] } {
  const dirs: Dir[] = [];
  const prose: string[] = [];
  let current: Dir | null = null;
  for (const raw of text.split(LINES)) {
    const line = trimSp(raw.replace(/^\uFEFF+/, ""));
    if (line === "") continue;
    const indent = (/^[ \t]*/.exec(line) ?? [""])[0];
    const content = line.slice(indent.length);
    if (content.startsWith("#")) continue;
    prose.push(line);
    const spans: Array<[number, number]> = [];
    for (const m of content.matchAll(QUOTED)) {
      const s = m.index ?? 0;
      spans.push([s, s + m[0].length]);
    }
    let code = content;
    for (let i = 1; i < content.length + 1; i++) {
      if (content[i] !== "#") continue;
      const p = content[i - 1];
      if (p !== " " && p !== "\t") continue;
      const n = i + 1 < content.length ? content[i + 1] : "";
      if (n !== "" && n !== " " && n !== "\t") continue;
      if (spans.some(([a, b]) => i >= a && i < b)) continue;
      code = trimSp(content.slice(0, i));
      break;
    }
    if (indent.length === 0) {
      const ix = code.search(/[ \t]/);
      const tok = ix < 0 ? code : code.slice(0, ix);
      const name = COLON_NAME.test(tok) ? tok.slice(0, -1) : tok;
      if (NAME.test(name) && name !== "CITED") {
        const sp = splitPiece(code.slice(tok.length));
        current = { name, args: sp.body, cont: [], attrs: new Map() };
        addAttrs(current, sp.vals);
        dirs.push(current);
        continue;
      }
    }
    if (current === null) continue;
    const sp = splitPiece(" " + code);
    if (sp.body !== "") current.cont.push(sp.body);
    addAttrs(current, sp.vals);
  }
  return { dirs, prose };
}

function suffix(p: string): string | null {
  const parts = p.split(/[\\/]/);
  const base = trimSp(parts[parts.length - 1] ?? "");
  if (HIDDEN_TAIL.test(base)) throw new Error("hidden tail");
  const m = LANG_SUFFIX.exec(base);
  if (m === null) return null;
  if (m[1] === "") throw new Error("empty id");
  return m[1];
}

function langs(sirFiles: unknown, variants: unknown): Set<string> {
  const out = new Set<string>();
  const add = (id: string): void => {
    if (!REGISTRY.has(id)) throw new Error("not in registry");
    out.add(id);
  };
  let files: unknown[] = [];
  if (sirFiles !== undefined && sirFiles !== null) {
    if (!Array.isArray(sirFiles)) throw new Error("sirFiles");
    files = sirFiles;
  }
  for (const f of files) {
    if (typeof f !== "string") throw new Error("sirFiles element");
    const id = suffix(f);
    if (id !== null) add(id);
  }
  if (variants === undefined || variants === null) return out;
  if (!isMap(variants)) throw new Error("variants");
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(variants)) {
    if (!isMap(v)) throw new Error("variant");
    if (v.lang !== undefined && typeof v.lang !== "string") throw new Error("lang");
    if (v.sir !== undefined && typeof v.sir !== "string") throw new Error("sir");
    const named: string[] = [];
    const keyLang = k.startsWith("lang:") ? k.slice(5) : undefined;
    if (keyLang !== undefined) named.push(keyLang);
    if (typeof v.lang === "string") named.push(v.lang);
    let pathId: string | null = null;
    if (typeof v.sir === "string") {
      pathId = suffix(v.sir);
      if (pathId !== null) named.push(pathId);
    }
    for (const n of named) if (n !== named[0]) throw new Error("differ");
    if (keyLang !== undefined && typeof v.sir === "string" && pathId === null) throw new Error("no suffix");
    if (named.length === 0) continue;
    const id = named[0];
    add(id);
    if (seen.has(id)) throw new Error("duplicate");
    seen.add(id);
  }
  return out;
}

function full(d: Dir): string {
  return [d.args, ...d.cont].join(" ");
}

function registeredRef(s: string): boolean {
  for (const m of s.matchAll(REF)) if (REGISTRY.has(m[1])) return true;
  return false;
}

export default function detectFeatures(input: unknown): string[] {
  if (input === null) throw new Error("null input");
  const r: Rec = isMap(input) ? input : {};
  const sirText = r.sirText;
  const carriedData = r.carriedData;
  const envelope = r.envelope;
  const mode = r.mode;
  if (sirText !== undefined && typeof sirText !== "string") throw new Error("sirText");
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error("carriedData");
  if (envelope !== undefined && envelope !== null && typeof envelope !== "string") throw new Error("envelope");
  const { dirs, prose } = parse(sirText ?? "");
  const ls = langs(r.sirFiles, r.variants);
  const has = (n: string): boolean => dirs.some((d) => d.name === n);
  const out = new Set<string>();
  out.add("vectors");
  if (
    (Array.isArray(carriedData) && carriedData.length > 0) ||
    has("CARRIED") ||
    dirs.some((d) => {
      if (d.name !== "CARRIED-DATA") return false;
      const f = full(d).trim();
      return f !== "" && f !== "none";
    })
  ) out.add("carried-data");
  if ((typeof envelope === "string" && envelope.trim() !== "") || has("ENVELOPE")) out.add("envelope");
  if (
    mode === "trace" ||
    has("TRACE-SEAM") ||
    dirs.some((d) => d.name === "ORACLE-CLASS" && TRACE_CLASS.test(full(d).trim()))
  ) out.add("trace-seam");
  if (mode === "par" || has("PAR")) out.add("par-interleaving");
  if (mode === "ring" || has("RING")) out.add("ring");
  if (has("LIFECYCLE") || prose.some((l) => SET_TIMER.test(l))) out.add("lifecycle");
  if (
    dirs.some((d) => d.name === "EFFECT" && EFFECT_TIMER.test(full(d))) ||
    prose.some((l) => SCHEDULER.test(l))
  ) out.add("scheduler");
  if (ls.size > 0) out.add("lang-variant");
  if (
    dirs.some((d) => {
      if (d.name === "ANCHOR") {
        const pieces: string[] = [d.args, ...d.cont];
        for (const vs of d.attrs.values()) pieces.push(...vs);
        return pieces.some(registeredRef);
      }
      if (d.name === "FIDELITY" || d.name === "VARIANT") {
        return (d.attrs.get("ANCHOR") ?? []).some(registeredRef);
      }
      return false;
    })
  ) out.add("cross-lang-anchor");
  return [...out];
}
