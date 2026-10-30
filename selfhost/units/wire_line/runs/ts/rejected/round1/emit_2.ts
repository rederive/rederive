type TypeNode = { k?: string; item?: TypeNode; items?: TypeNode[]; key?: TypeNode; val?: TypeNode; fields?: [string, TypeNode][]; alts?: TypeNode[] };
type Narrowed = { __narrowed: string };
type Wire = string | Narrowed;

const ABSENT_TEXT = "undefined";
const ABSENT_REASON = "the absent value has no serde_json form";
const HOLE_TEXT = "an array hole has no serde_json form";
const NARROWED_JSON = "json holds no NaN/Inf/-0 in serde_json::Value";
const LONE = "a lone surrogate has no UTF-8 form";

const I64_MIN = -BigInt("9223372036854775808");
const I64_MAX = BigInt("9223372036854775807");
const U64_MAX = BigInt("18446744073709551615");
const TWO53 = 9007199254740992;

function narrowed(reason: string): Narrowed {
  return { __narrowed: reason };
}

function lone(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) {
        i++;
      } else {
        return true;
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isPlain(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function hasHole(v: unknown[]): boolean {
  for (let i = 0; i < v.length; i++) {
    if (!(i in v)) return true;
  }
  return false;
}

function optionOf(t: TypeNode): TypeNode | null {
  if (t.k !== "union") return null;
  const alts = t.alts as TypeNode[];
  const nn = alts.filter((a) => a.k !== "none");
  if (alts.length === 2 && nn.length === 1) return nn[0] as TypeNode;
  return null;
}

function carry(v: unknown): string | null {
  if (v === null || typeof v === "boolean") return null;
  if (v === undefined) return ABSENT_REASON;
  if (typeof v === "number") {
    if (Number.isNaN(v) || v === Infinity || v === -Infinity || Object.is(v, -0)) return NARROWED_JSON;
    if (Number.isInteger(v) && Math.abs(v) > TWO53) {
      return "a whole number past 2^53 reaches serde_json as a different integer";
    }
    return null;
  }
  if (typeof v === "bigint") {
    if (v < I64_MIN || v > U64_MAX) return "an integer past i64/u64 has no serde_json form";
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
    for (const key of Object.keys(v)) {
      if (lone(key)) return LONE;
      const r = carry(v[key]);
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
  if (r !== null) return narrowed(r);
  return plain(v);
}

function firstNarrowed(ws: Wire[]): Narrowed | null {
  for (const w of ws) {
    if (typeof w !== "string") return w;
  }
  return null;
}

function joinList(ws: Wire[]): Wire {
  const f = firstNarrowed(ws);
  if (f !== null) return f;
  return "[" + (ws as string[]).join(",") + "]";
}

function f64Bits(v: number): string {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, v);
  let b = dv.getBigUint64(0);
  if (Number.isNaN(v)) b = BigInt("0x7ff8000000000000");
  return JSON.stringify(b.toString(16).padStart(16, "0"));
}

function wire(v: unknown, tt: TypeNode | null | undefined): Wire {
  const t = tt as TypeNode;
  if (v === undefined && !(t.k === "none" || optionOf(t))) return narrowed(ABSENT_REASON);
  if (v === null || v === undefined) return "null";
  switch (t.k) {
    case "union": {
      const o = optionOf(t);
      if (o) return wire(v, o);
      return jsonRule(v);
    }
    case "f64":
      if (typeof v === "number") return f64Bits(v);
      return narrowed("not an f64 value");
    case "text":
      if (typeof v === "string") return lone(v) ? narrowed(LONE) : JSON.stringify(v);
      return narrowed("not a text value");
    case "bool":
      if (v === true) return "true";
      if (v === false) return "false";
      return narrowed("not a bool value");
    case "i64":
    case "u64": {
      const name = t.k;
      let b: bigint | null = null;
      if (typeof v === "bigint") b = v;
      else if (typeof v === "number" && Number.isSafeInteger(v)) b = BigInt(v);
      if (b !== null) {
        const ok = name === "i64" ? b >= I64_MIN && b <= I64_MAX : b >= BigInt(0) && b <= U64_MAX;
        if (ok) return b.toString();
      }
      return narrowed("not a " + name + " value");
    }
    case "list": {
      if (!Array.isArray(v)) return narrowed("not a list value");
      if (hasHole(v)) return narrowed(HOLE_TEXT);
      const ws: Wire[] = [];
      for (let i = 0; i < v.length; i++) ws.push(wire(v[i], t.item));
      return joinList(ws);
    }
    case "tuple": {
      if (Array.isArray(v) && hasHole(v)) return narrowed(HOLE_TEXT);
      const n = (t.items as TypeNode[]).length;
      if (!Array.isArray(v) || v.length !== n) return narrowed("not a " + n + "-tuple");
      const items = t.items as TypeNode[];
      const ws: Wire[] = [];
      for (let i = 0; i < v.length; i++) ws.push(wire(v[i], items[i]));
      return joinList(ws);
    }
    case "record": {
      if (!isPlain(v)) return narrowed("not a record value");
      const rec = v;
      const fields = t.fields as [string, TypeNode][];
      const ws = fields.map((f): Wire => {
        const name = f[0];
        const val: unknown = Object.prototype.hasOwnProperty.call(rec, name) ? rec[name] : undefined;
        return wire(val, f[1]);
      });
      const f = firstNarrowed(ws);
      if (f !== null) return f;
      return "{" + fields.map((fd, i) => JSON.stringify(fd[0]) + ":" + (ws[i] as string)).join(",") + "}";
    }
    case "json":
    case "map":
      return jsonRule(v);
    default:
      return narrowed("the rust harness has no route for " + (t.k === undefined ? ABSENT_TEXT : String(t.k)));
  }
}

export default function wireLine(
  args: unknown,
  sig: { args: { name: string; type?: TypeNode | null; rest?: boolean }[] },
): string | { __narrowed: string } {
  const params = sig.args;
  const fixed = params.filter((a) => !a.rest).length;
  const restParam = params.find((a) => a.rest);
  const rest = restParam?.type ?? null;
  if (!Array.isArray(args)) return narrowed("the args are not a list");
  if (rest === null && args.length !== fixed) {
    return narrowed(args.length + " args for a " + fixed + "-parameter SIG");
  }
  if (hasHole(args)) return narrowed(HOLE_TEXT);
  const out: string[] = [];
  for (let j = 0; j < args.length; j++) {
    const p = params[j];
    let w: Wire;
    try {
      const ty = j < fixed ? (p as { type?: TypeNode | null }).type : rest;
      w = wire(args[j], ty);
    } catch (e) {
      return narrowed("wire: " + (e instanceof Error ? e.message : String(e)));
    }
    if (typeof w !== "string") return w;
    out.push(w);
  }
  return "[" + out.join(",") + "]";
}
