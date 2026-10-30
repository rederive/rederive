type TypeNode = { k?: string; item?: TypeNode; items?: TypeNode[]; key?: TypeNode; val?: TypeNode; fields?: [string, TypeNode][]; alts?: TypeNode[] };
type Narrowed = { __narrowed: string };
type Wire = string | Narrowed;
interface Loose { k: string; item: Loose; items: Loose[]; fields: [string, Loose][]; alts: Loose[] }

const ABSENT_TEXT = "undefined";
const ABSENT_REASON = "the absent value has no serde_json form";
const HOLE_TEXT = "an array hole has no serde_json form";
const NARROWED_JSON = "json holds no NaN/Inf/-0 in serde_json::Value";
const LONE = "a lone surrogate has no UTF-8 form";

function narrowed(r: string): Narrowed {
  return { __narrowed: r };
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

function optionOf(t: Loose): Loose | null {
  if (t.k !== "union") return null;
  const nn = t.alts.filter((a) => a.k !== "none");
  const first = nn[0];
  return t.alts.length === 2 && nn.length === 1 && first !== undefined ? first : null;
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
  if (Array.isArray(v)) return "[" + v.map((e: unknown) => plain(e)).join(",") + "]";
  if (isPlain(v)) return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + plain(v[k])).join(",") + "}";
  if (v === undefined) return "null";
  return JSON.stringify(v);
}

function jsonRule(v: unknown): Wire {
  const r = carry(v);
  if (r !== null) return narrowed(r);
  return plain(v);
}

function joinWires(ws: Wire[], open: string, close: string): Wire {
  for (const w of ws) if (typeof w !== "string") return w;
  return open + ws.join(",") + close;
}

function wire(t0: unknown, v: unknown): Wire {
  const t = t0 as Loose;
  if (v === undefined) {
    if (!(t.k === "none" || optionOf(t))) return narrowed(ABSENT_REASON);
    return "null";
  }
  if (v === null) return "null";
  const k = t.k;
  switch (k) {
    case "union": {
      const o = optionOf(t);
      if (o) return wire(o, v);
      return jsonRule(v);
    }
    case "f64": {
      if (typeof v !== "number") return narrowed("not an f64 value");
      const dv = new DataView(new ArrayBuffer(8));
      dv.setFloat64(0, v);
      let bits = dv.getBigUint64(0);
      if (Number.isNaN(v)) bits = 0x7ff8000000000000n;
      return JSON.stringify(bits.toString(16).padStart(16, "0"));
    }
    case "text": {
      if (typeof v !== "string") return narrowed("not a text value");
      if (!v.isWellFormed()) return narrowed(LONE);
      return JSON.stringify(v);
    }
    case "bool":
      if (v === true) return "true";
      if (v === false) return "false";
      return narrowed("not a bool value");
    case "i64":
    case "u64": {
      const bad = narrowed("not a " + k + " value");
      let b: bigint;
      if (typeof v === "bigint") b = v;
      else if (typeof v === "number" && Number.isSafeInteger(v)) b = BigInt(v);
      else return bad;
      const lo = k === "i64" ? -(2n ** 63n) : 0n;
      const hi = k === "i64" ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      if (b < lo || b > hi) return bad;
      return b.toString();
    }
    case "list": {
      if (!Array.isArray(v)) return narrowed("not a list value");
      if (hasHole(v)) return narrowed(HOLE_TEXT);
      const ws: Wire[] = [];
      for (let i = 0; i < v.length; i++) ws.push(wire(t.item, v[i]));
      return joinWires(ws, "[", "]");
    }
    case "tuple": {
      if (Array.isArray(v) && hasHole(v)) return narrowed(HOLE_TEXT);
      if (!Array.isArray(v) || v.length !== t.items.length) return narrowed("not a " + t.items.length + "-tuple");
      const ws: Wire[] = [];
      for (let i = 0; i < v.length; i++) ws.push(wire(t.items[i], v[i]));
      return joinWires(ws, "[", "]");
    }
    case "record": {
      if (!isPlain(v)) return narrowed("not a record value");
      const names: string[] = [];
      const ws: Wire[] = t.fields.map(([name, ft]) => {
        names.push(name);
        return wire(ft, Object.hasOwn(v, name) ? v[name] : undefined);
      });
      for (const w of ws) if (typeof w !== "string") return w;
      return "{" + ws.map((w, i) => JSON.stringify(names[i]) + ":" + String(w)).join(",") + "}";
    }
    case "json":
    case "map":
      return jsonRule(v);
    default:
      return narrowed("the rust harness has no route for " + (k === undefined ? ABSENT_TEXT : String(k)));
  }
}

export default function wireLine(args: unknown, sig: { args: { name: string; type?: TypeNode | null; rest?: boolean }[] }): string | { __narrowed: string } {
  const nFixed = sig.args.filter((a) => !a.rest).length;
  const rest = sig.args.find((a) => a.rest)?.type ?? null;
  if (!Array.isArray(args)) return narrowed("the args are not a list");
  if (rest === null && args.length !== nFixed) return narrowed(args.length + " args for a " + nFixed + "-parameter SIG");
  if (hasHole(args)) return narrowed(HOLE_TEXT);
  const ws: string[] = [];
  for (let j = 0; j < args.length; j++) {
    const t = j < nFixed ? sig.args[j]?.type : rest;
    let w: Wire;
    try {
      w = wire(t, args[j]);
    } catch (e) {
      return narrowed("wire: " + (e instanceof Error ? e.message : String(e)));
    }
    if (typeof w !== "string") return w;
    ws.push(w);
  }
  return "[" + ws.join(",") + "]";
}
