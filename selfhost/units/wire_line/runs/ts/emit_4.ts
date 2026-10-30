type TypeNode = { k?: string; item?: TypeNode; items?: TypeNode[]; key?: TypeNode; val?: TypeNode; fields?: [string, TypeNode][]; alts?: TypeNode[] };
type Narrowed = { __narrowed: string };
type Param = { name: string; type?: TypeNode | null; rest?: boolean };

const ABSENT_TEXT = "undefined";
const ABSENT_REASON = "the absent value has no serde_json form";
const HOLE_TEXT = "an array hole has no serde_json form";
const NARROWED_JSON = "json holds no NaN/Inf/-0 in serde_json::Value";
const LONE = "a lone surrogate has no UTF-8 form";

function narrowed(s: string): Narrowed {
  return { __narrowed: s };
}

function lone(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

function isPlain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function hasHole(a: unknown[]): boolean {
  for (let i = 0; i < a.length; i++) if (!(i in a)) return true;
  return false;
}

function optionOf(t: TypeNode): TypeNode | null {
  if (t.k !== "union") return null;
  const alts = t.alts as TypeNode[];
  const nn = alts.filter((a) => a.k !== "none");
  return alts.length === 2 && nn.length === 1 ? (nn[0] ?? null) : null;
}

function carry(v: unknown): string | null {
  if (v === null || typeof v === "boolean") return null;
  if (v === undefined) return ABSENT_REASON;
  if (typeof v === "number") {
    if (Number.isNaN(v) || v === Infinity || v === -Infinity || Object.is(v, -0)) return NARROWED_JSON;
    if (Number.isInteger(v) && Math.abs(v) > 9007199254740992) return "a whole number past 2^53 reaches serde_json as a different integer";
    return null;
  }
  if (typeof v === "bigint") {
    if (v < -(2n ** 63n) || v > 2n ** 64n - 1n) return "an integer past i64/u64 has no serde_json form";
    return null;
  }
  if (typeof v === "string") return lone(v) ? LONE : null;
  if (Array.isArray(v)) {
    const a: unknown[] = v;
    for (let i = 0; i < a.length; i++) {
      if (!(i in a)) return HOLE_TEXT;
      const r = carry(a[i]);
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
  return "a " + Object.prototype.toString.call(v).slice(8, -1) + " has no serde_json form";
}

function plain(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) {
    const a: unknown[] = v;
    const out: string[] = [];
    for (let i = 0; i < a.length; i++) out.push(plain(a[i]));
    return "[" + out.join(",") + "]";
  }
  if (isPlain(v)) {
    return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + plain(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

function firstNarrowed(ws: (string | Narrowed)[]): Narrowed | null {
  for (const w of ws) if (typeof w !== "string") return w;
  return null;
}

function joinWires(ws: (string | Narrowed)[]): string {
  return "[" + ws.map((w) => String(w)).join(",") + "]";
}

function wireValue(v: unknown, tn: TypeNode | null | undefined): string | Narrowed {
  const t = tn as TypeNode;
  if (v === undefined && !(t.k === "none" || optionOf(t))) return narrowed(ABSENT_REASON);
  if (v === null || v === undefined) return "null";
  const k = t.k;
  switch (k) {
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
      if (lone(v)) return narrowed(LONE);
      return JSON.stringify(v);
    }
    case "bool":
      return typeof v === "boolean" ? (v ? "true" : "false") : narrowed("not a bool value");
    case "i64":
    case "u64": {
      const bad = narrowed("not a " + k + " value");
      let b: bigint;
      if (typeof v === "bigint") b = v;
      else if (typeof v === "number" && Number.isSafeInteger(v)) b = BigInt(v);
      else return bad;
      const lo = k === "i64" ? -(2n ** 63n) : 0n;
      const hi = k === "i64" ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      return b < lo || b > hi ? bad : b.toString();
    }
    case "list": {
      if (!Array.isArray(v)) return narrowed("not a list value");
      const a: unknown[] = v;
      if (hasHole(a)) return narrowed(HOLE_TEXT);
      const ws: (string | Narrowed)[] = [];
      for (let i = 0; i < a.length; i++) ws.push(wireValue(a[i], t.item));
      return firstNarrowed(ws) ?? joinWires(ws);
    }
    case "tuple": {
      if (Array.isArray(v) && hasHole(v as unknown[])) return narrowed(HOLE_TEXT);
      const items = t.items as TypeNode[];
      const n = items.length;
      if (!Array.isArray(v) || (v as unknown[]).length !== n) return narrowed("not a " + (t.items as TypeNode[]).length + "-tuple");
      const a: unknown[] = v;
      const ws: (string | Narrowed)[] = [];
      for (let i = 0; i < n; i++) ws.push(wireValue(a[i], items[i]));
      return firstNarrowed(ws) ?? joinWires(ws);
    }
    case "record": {
      if (!isPlain(v)) return narrowed("not a record value");
      const rec: Record<string, unknown> = v;
      const fields = t.fields as [string, TypeNode][];
      const ws = fields.map((f) => {
        const name = f[0];
        const val = Object.prototype.hasOwnProperty.call(rec, name) ? rec[name] : undefined;
        return wireValue(val, f[1]);
      });
      const bad = firstNarrowed(ws);
      if (bad) return bad;
      return "{" + fields.map((f, i) => JSON.stringify(f[0]) + ":" + String(ws[i])).join(",") + "}";
    }
    case "union": {
      const opt = optionOf(t);
      if (opt) return wireValue(v, opt);
      return jsonWire(v);
    }
    case "json":
    case "map":
      return jsonWire(v);
    default:
      return narrowed("the rust harness has no route for " + (k === undefined ? ABSENT_TEXT : String(k)));
  }
}

function jsonWire(v: unknown): string | Narrowed {
  const r = carry(v);
  return r !== null ? narrowed(r) : plain(v);
}

export default function wireLine(args: unknown, sig: { args: Param[] }): string | { __narrowed: string } {
  const nFixed = sig.args.filter((a) => !a.rest).length;
  const rest = sig.args.find((a) => a.rest)?.type ?? null;
  if (!Array.isArray(args)) return narrowed("the args are not a list");
  const list: unknown[] = args;
  if (rest === null && list.length !== nFixed) return narrowed(list.length + " args for a " + nFixed + "-parameter SIG");
  if (hasHole(list)) return narrowed(HOLE_TEXT);
  const ws: string[] = [];
  for (let j = 0; j < list.length; j++) {
    const t = j < nFixed ? (sig.args[j] as Param).type : rest;
    let w: string | Narrowed;
    try {
      w = wireValue(list[j], t);
    } catch (e) {
      w = narrowed("wire: " + (e instanceof Error ? e.message : String(e)));
    }
    if (typeof w !== "string") return w;
    ws.push(w);
  }
  return "[" + ws.join(",") + "]";
}
