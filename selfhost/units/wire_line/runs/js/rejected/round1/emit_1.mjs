const ABSENT_REASON = "the absent value has no serde_json form";
const HOLE_TEXT = "an array hole has no serde_json form";
const NARROWED_JSON = "json holds no NaN/Inf/-0 in serde_json::Value";
const LONE = "a lone surrogate has no UTF-8 form";

const narrowed = (r) => ({ __narrowed: r });
const isPlain = (v) => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const hasHole = (v) => {
  for (let i = 0; i < v.length; i++) if (!(i in v)) return true;
  return false;
};
const optionOf = (t) => {
  if (t.k !== "union") return null;
  const alts = t.alts.filter((a) => a.k !== "none");
  return t.alts.length === 2 && alts.length === 1 ? alts[0] : null;
};

const carry = (v) => {
  if (v === null || typeof v === "boolean") return null;
  if (v === undefined) return ABSENT_REASON;
  if (typeof v === "string") return v.isWellFormed() ? null : LONE;
  if (typeof v === "bigint") {
    return v < -(2n ** 63n) || v > 2n ** 64n - 1n
      ? "an integer past i64/u64 has no serde_json form"
      : null;
  }
  if (typeof v === "number") {
    if (Number.isNaN(v) || v === Infinity || v === -Infinity || Object.is(v, -0)) return NARROWED_JSON;
    if (Number.isInteger(v) && Math.abs(v) > 2 ** 53)
      return "a whole number past 2^53 reaches serde_json as a different integer";
    return null;
  }
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
      if (!k.isWellFormed()) return LONE;
      const r = carry(v[k]);
      if (r !== null) return r;
    }
    return null;
  }
  return "a " + Object.prototype.toString.call(v).slice(8, -1) + " has no serde_json form";
};

const plain = (v) => {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return "[" + v.map(plain).join(",") + "]";
  if (isPlain(v)) return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + plain(v[k])).join(",") + "}";
  return JSON.stringify(v);
};

const first = (ws) => ws.find((w) => typeof w !== "string");

const dv = new DataView(new ArrayBuffer(8));

const wire = (v, t) => {
  if (v === undefined && !(t.k === "none" || optionOf(t))) return narrowed(ABSENT_REASON);
  if (v === undefined || v === null) return "null";
  switch (t.k) {
    case "union": {
      const o = optionOf(t);
      if (o) return wire(v, o);
      return json(v);
    }
    case "f64": {
      if (typeof v !== "number") return narrowed("not an f64 value");
      let b;
      if (Number.isNaN(v)) b = 0x7ff8000000000000n;
      else {
        dv.setFloat64(0, v);
        b = dv.getBigUint64(0);
      }
      return JSON.stringify(b.toString(16).padStart(16, "0"));
    }
    case "text":
      if (typeof v !== "string") return narrowed("not a text value");
      return v.isWellFormed() ? JSON.stringify(v) : narrowed(LONE);
    case "bool":
      return typeof v === "boolean" ? String(v) : narrowed("not a bool value");
    case "i64":
    case "u64": {
      const ok = (typeof v === "number" && Number.isSafeInteger(v)) || typeof v === "bigint";
      if (ok) {
        const b = BigInt(v);
        const [lo, hi] = t.k === "i64" ? [-(2n ** 63n), 2n ** 63n - 1n] : [0n, 2n ** 64n - 1n];
        if (b >= lo && b <= hi) return b.toString();
      }
      return narrowed("not a " + t.k + " value");
    }
    case "list": {
      if (!Array.isArray(v)) return narrowed("not a list value");
      if (hasHole(v)) return narrowed(HOLE_TEXT);
      const ws = v.map((e) => wire(e, t.item));
      return first(ws) ?? "[" + ws.join(",") + "]";
    }
    case "tuple": {
      if (Array.isArray(v) && hasHole(v)) return narrowed(HOLE_TEXT);
      if (!Array.isArray(v) || v.length !== t.items.length) return narrowed("not a " + t.items.length + "-tuple");
      const ws = v.map((e, i) => wire(e, t.items[i]));
      return first(ws) ?? "[" + ws.join(",") + "]";
    }
    case "record": {
      if (!isPlain(v)) return narrowed("not a record value");
      const ws = t.fields.map(([n, ft]) => wire(Object.hasOwn(v, n) ? v[n] : undefined, ft));
      const f = first(ws);
      if (f !== undefined) return f;
      return "{" + t.fields.map(([n], i) => JSON.stringify(n) + ":" + ws[i]).join(",") + "}";
    }
    case "json":
    case "map":
      return json(v);
    default:
      return narrowed("the rust harness has no route for " + t.k);
  }
};

const json = (v) => {
  const r = carry(v);
  return r !== null ? narrowed(r) : plain(v);
};

export default function wireLine(args, sig) {
  const nFixed = sig.args.filter((a) => !a.rest).length;
  const REST = sig.args.find((a) => a.rest)?.type ?? null;
  if (!Array.isArray(args)) return narrowed("the args are not a list");
  if (REST === null && args.length !== nFixed)
    return narrowed(args.length + " args for a " + nFixed + "-parameter SIG");
  if (hasHole(args)) return narrowed(HOLE_TEXT);
  const ws = [];
  for (let j = 0; j < args.length; j++) {
    let w;
    try {
      w = wire(args[j], j < nFixed ? sig.args[j].type : REST);
    } catch (e) {
      w = narrowed("wire: " + e.message);
    }
    if (typeof w !== "string") return w;
    ws.push(w);
  }
  return "[" + ws.join(",") + "]";
}
