export interface TypeNode { k?: string; item?: TypeNode; items?: TypeNode[]; key?: TypeNode; val?: TypeNode; fields?: [string, TypeNode][]; alts?: TypeNode[] }
type Narrowed = { __narrowed: string };
type Wire = string | Narrowed;

const ABSENT_TEXT = "undefined";
const ABSENT_REASON = "the absent value has no serde_json form";
const HOLE_TEXT = "an array hole has no serde_json form";
const NARROWED_JSON = "json holds no NaN/Inf/-0 in serde_json::Value";
const LONE = "a lone surrogate has no UTF-8 form";

function nar(s: string): Narrowed { return { __narrowed: s }; }

function isPlain(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function optionOf(t: TypeNode): TypeNode | null {
  if (t.k !== "union") return null;
  const alts = t.alts as TypeNode[];
  const nn = alts.filter((a) => a.k !== "none");
  return alts.length === 2 && nn.length === 1 ? (nn[0] as TypeNode) : null;
}

function carry(v: unknown): string | null {
  if (v === null || typeof v === "boolean") return null;
  if (v === undefined) return ABSENT_REASON;
  if (typeof v === "number") {
    if (Number.isNaN(v) || v === Infinity || v === -Infinity || Object.is(v, -0)) return NARROWED_JSON;
    if (Number.isInteger(v) && Math.abs(v) > 2 ** 53) return "a whole number past 2^53 reaches serde_json as a different integer";
    return null;
  }
  if (typeof v === "bigint") {
    if (v < -(2n ** 63n) || v > 2n ** 64n - 1n) return "an integer past i64/u64 has no serde_json form";
    return null;
  }
  if (typeof v === "string") return v.isWellFormed() ? null : LONE;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) return HOLE_TEXT;
      const r = carry(v[i]);
      if (r !== null) return r;
    }
    return null;
  }
  if (isPlain(v)) {
    for (const key of Object.keys(v)) {
      if (!key.isWellFormed()) return LONE;
      const r = carry(v[key]);
      if (r !== null) return r;
    }
    return null;
  }
  return "a " + Object.prototype.toString.call(v).slice(8, -1) + " has no serde_json form";
}

function plain(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return "[" + v.map((e) => plain(e)).join(",") + "]";
  if (isPlain(v)) return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + plain(v[k])).join(",") + "}";
  if (v === null) return "null";
  return JSON.stringify(v);
}

function jsonWire(v: unknown): Wire {
  const r = carry(v);
  return r !== null ? nar(r) : plain(v);
}

function firstNar(ws: Wire[]): Narrowed | null {
  for (const w of ws) if (typeof w !== "string") return w;
  return null;
}

function f64Bits(v: number): string {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, v);
  let b = dv.getBigUint64(0);
  if (Number.isNaN(v)) b = 0x7ff8000000000000n;
  return JSON.stringify(b.toString(16).padStart(16, "0"));
}

function intWire(v: unknown, name: string, lo: bigint, hi: bigint): Wire {
  let b: bigint | null = null;
  if (typeof v === "bigint") b = v;
  else if (typeof v === "number" && Number.isSafeInteger(v)) b = BigInt(v);
  if (b === null || b < lo || b > hi) return nar("not a " + name + " value");
  return b.toString();
}

function hasHole(v: unknown[]): boolean {
  for (let i = 0; i < v.length; i++) if (!(i in v)) return true;
  return false;
}

function wire(v: unknown, t: TypeNode): Wire {
  if (v === undefined && !(t.k === "none" || optionOf(t))) return nar(ABSENT_REASON);
  if (v === null || v === undefined) return "null";
  const k = t.k;
  if (k === "union") {
    const opt = optionOf(t);
    if (opt) return wire(v, opt);
    return jsonWire(v);
  }
  switch (k) {
    case "f64":
      return typeof v === "number" ? f64Bits(v) : nar("not an f64 value");
    case "text":
      if (typeof v !== "string") return nar("not a text value");
      return v.isWellFormed() ? JSON.stringify(v) : nar(LONE);
    case "bool":
      return typeof v === "boolean" ? (v ? "true" : "false") : nar("not a bool value");
    case "i64":
      return intWire(v, "i64", -(2n ** 63n), 2n ** 63n - 1n);
    case "u64":
      return intWire(v, "u64", 0n, 2n ** 64n - 1n);
    case "list": {
      if (!Array.isArray(v)) return nar("not a list value");
      if (hasHole(v)) return nar(HOLE_TEXT);
      const ws = v.map((e) => wire(e, t.item as TypeNode));
      const n = firstNar(ws);
      return n ?? "[" + (ws as string[]).join(",") + "]";
    }
    case "tuple": {
      if (Array.isArray(v) && hasHole(v)) return nar(HOLE_TEXT);
      if (!Array.isArray(v) || v.length !== (t.items as TypeNode[]).length) {
        return nar("not a " + (t.items as TypeNode[]).length + "-tuple");
      }
      const items = t.items as TypeNode[];
      const ws = v.map((e, i) => wire(e, items[i] as TypeNode));
      const n = firstNar(ws);
      return n ?? "[" + (ws as string[]).join(",") + "]";
    }
    case "record": {
      if (!isPlain(v)) return nar("not a record value");
      const fields = t.fields as [string, TypeNode][];
      const ws = fields.map(([name, ft]) => wire(Object.hasOwn(v, name) ? v[name] : undefined, ft));
      const n = firstNar(ws);
      if (n) return n;
      return "{" + fields.map(([name], i) => JSON.stringify(name) + ":" + (ws[i] as string)).join(",") + "}";
    }
    case "json":
    case "map":
      return jsonWire(v);
    default:
      return nar("the rust harness has no route for " + (k === undefined ? ABSENT_TEXT : String(k)));
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
    const t = j < nFixed ? (sig.args[j] as { type?: TypeNode | null }).type : rest;
    let w: Wire;
    try {
      w = wire(args[j], t as TypeNode);
    } catch (e) {
      return nar("wire: " + (e instanceof Error ? e.message : String(e)));
    }
    if (typeof w !== "string") return w;
    out.push(w);
  }
  return "[" + out.join(",") + "]";
}
