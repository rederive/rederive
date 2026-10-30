export type TypeNode = { k?: string; item?: TypeNode; items?: TypeNode[]; key?: TypeNode; val?: TypeNode; fields?: [string, TypeNode][]; alts?: TypeNode[] };
type Narrowed = { __narrowed: string };
type Wire = string | Narrowed;
type N = { k: string; item: N; items: N[]; key: N; val: N; fields: [string, N][]; alts: N[] };

const ABSENT_REASON = "the absent value has no serde_json form";
const HOLE_TEXT = "an array hole has no serde_json form";
const NARROWED_JSON = "json holds no NaN/Inf/-0 in serde_json::Value";
const LONE = "a lone surrogate has no UTF-8 form";
const P53 = 2 ** 53;

function nar(s: string): Narrowed {
  return { __narrowed: s };
}

function lone(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

function isPlain(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function hasHole(v: unknown[]): boolean {
  for (let i = 0; i < v.length; i++) if (!(i in v)) return true;
  return false;
}

function optionOf(t: N): N | null {
  if (t.k !== "union") return null;
  const non = t.alts.filter((a) => a.k !== "none");
  return t.alts.length === 2 && non.length === 1 ? non[0] : null;
}

function carry(v: unknown): string | null {
  if (v === undefined) return ABSENT_REASON;
  if (v === null || typeof v === "boolean") return null;
  if (typeof v === "number") {
    if (Number.isNaN(v) || v === Infinity || v === -Infinity || Object.is(v, -0)) return NARROWED_JSON;
    if (Number.isInteger(v) && Math.abs(v) > P53) return "a whole number past 2^53 reaches serde_json as a different integer";
    return null;
  }
  if (typeof v === "bigint") {
    if (v < -(2n ** 63n) || v > 2n ** 64n - 1n) return "an integer past i64/u64 has no serde_json form";
    return null;
  }
  if (typeof v === "string") return lone(v) ? LONE : null;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) return HOLE_TEXT;
      const r = carry(v[i]);
      if (r !== null) return r;
    }
    return null;
  }
  if (isPlain(v)) {
    for (const k of Object.keys(v)) {
      if (lone(k)) return LONE;
      const r = carry(v[k]);
      if (r !== null) return r;
    }
    return null;
  }
  const tag = Object.prototype.toString.call(v).slice(8, -1);
  return "a " + tag + " has no serde_json form";
}

function plain(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (let i = 0; i < v.length; i++) parts.push(plain(v[i]));
    return "[" + parts.join(",") + "]";
  }
  if (isPlain(v)) {
    return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + plain(v[k])).join(",") + "}";
  }
  if (v === null) return "null";
  return JSON.stringify(v);
}

function jsonRule(v: unknown): Wire {
  const r = carry(v);
  return r !== null ? nar(r) : plain(v);
}

function join(ws: Wire[], open: string, close: string): Wire {
  for (const w of ws) if (typeof w !== "string") return w;
  return open + ws.join(",") + close;
}

function intRule(v: unknown, kind: string): Wire {
  let b: bigint;
  if (typeof v === "bigint") b = v;
  else if (typeof v === "number" && Number.isSafeInteger(v)) b = BigInt(v);
  else return nar("not a " + kind + " value");
  const ok = kind === "i64" ? b >= -(2n ** 63n) && b <= 2n ** 63n - 1n : b >= 0n && b <= 2n ** 64n - 1n;
  return ok ? b.toString() : nar("not a " + kind + " value");
}

function f64Rule(v: unknown): Wire {
  if (typeof v !== "number") return nar("not an f64 value");
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, v);
  let bits = dv.getBigUint64(0);
  if (Number.isNaN(v)) bits = 0x7ff8000000000000n;
  return JSON.stringify(bits.toString(16).padStart(16, "0"));
}

function wire(v: unknown, t0: TypeNode | null | undefined): Wire {
  const t = t0 as unknown as N;
  if (v === undefined && !(t.k === "none" || optionOf(t))) return nar(ABSENT_REASON);
  if (v === null || v === undefined) return "null";
  switch (t.k) {
    case "union": {
      const o = optionOf(t);
      return o ? wire(v, o as unknown as TypeNode) : jsonRule(v);
    }
    case "f64":
      return f64Rule(v);
    case "text":
      if (typeof v !== "string") return nar("not a text value");
      return lone(v) ? nar(LONE) : JSON.stringify(v);
    case "bool":
      return typeof v === "boolean" ? (v ? "true" : "false") : nar("not a bool value");
    case "i64":
    case "u64":
      return intRule(v, t.k);
    case "list": {
      if (!Array.isArray(v)) return nar("not a list value");
      if (hasHole(v)) return nar(HOLE_TEXT);
      const ws: Wire[] = [];
      for (let i = 0; i < v.length; i++) ws.push(wire(v[i], t.item as unknown as TypeNode));
      return join(ws, "[", "]");
    }
    case "tuple": {
      if (Array.isArray(v) && hasHole(v)) return nar(HOLE_TEXT);
      const n = t.items.length;
      if (!Array.isArray(v) || v.length !== n) return nar("not a " + t.items.length + "-tuple");
      const ws: Wire[] = [];
      for (let i = 0; i < v.length; i++) ws.push(wire(v[i], t.items[i] as unknown as TypeNode));
      return join(ws, "[", "]");
    }
    case "record": {
      if (!isPlain(v)) return nar("not a record value");
      const ws = t.fields.map((f) => wire(Object.hasOwn(v, f[0]) ? v[f[0]] : undefined, f[1] as unknown as TypeNode));
      for (const w of ws) if (typeof w !== "string") return w;
      const parts = t.fields.map((f, i) => JSON.stringify(f[0]) + ":" + String(ws[i]));
      return "{" + parts.join(",") + "}";
    }
    case "json":
    case "map":
      return jsonRule(v);
    default:
      return nar("the rust harness has no route for " + String(t.k));
  }
}

export default function wireLine(args: unknown, sig: { args: { name: string; type?: TypeNode | null; rest?: boolean }[] }): string | { __narrowed: string } {
  const nFixed = sig.args.filter((a) => !a.rest).length;
  const rest = sig.args.find((a) => a.rest)?.type ?? null;
  if (!Array.isArray(args)) return nar("the args are not a list");
  if (rest === null && args.length !== nFixed) return nar(args.length + " args for a " + nFixed + "-parameter SIG");
  if (hasHole(args)) return nar(HOLE_TEXT);
  const out: string[] = [];
  for (let j = 0; j < args.length; j++) {
    const t = j < nFixed ? sig.args[j].type : rest;
    let w: Wire;
    try {
      w = wire(args[j], t);
    } catch (e) {
      w = nar("wire: " + (e instanceof Error ? e.message : String(e)));
    }
    if (typeof w !== "string") return w;
    out.push(w);
  }
  return "[" + out.join(",") + "]";
}
