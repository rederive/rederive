const ABSENT_REASON = "the absent value has no serde_json form";
const HOLE_TEXT = "an array hole has no serde_json form";
const NARROWED_JSON = "json holds no NaN/Inf/-0 in serde_json::Value";
const LONE = "a lone surrogate has no UTF-8 form";
const nar = (r) => ({ __narrowed: r });
const isN = (w) => typeof w !== "string";
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
  const nn = t.alts.filter((a) => a.k !== "none");
  return t.alts.length === 2 && nn.length === 1 ? nn[0] : null;
};

function carry(v) {
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
    for (const k of Object.keys(v)) {
      if (!k.isWellFormed()) return LONE;
      const r = carry(v[k]);
      if (r !== null) return r;
    }
    return null;
  }
  return "a " + Object.prototype.toString.call(v).slice(8, -1) + " has no serde_json form";
}

function plain(v) {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return "[" + v.map(plain).join(",") + "]";
  if (isPlain(v)) return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + plain(v[k])).join(",") + "}";
  return JSON.stringify(v);
}

const dv = new DataView(new ArrayBuffer(8));
function bits(v) {
  dv.setFloat64(0, v);
  let b = dv.getBigUint64(0);
  if (Number.isNaN(v)) b = 0x7ff8000000000000n;
  return JSON.stringify(b.toString(16).padStart(16, "0"));
}

function join(ws, open, close) {
  const f = ws.find(isN);
  return f !== undefined ? f : open + ws.join(",") + close;
}

function wire(v, t) {
  if (v === undefined) {
    if (!(t.k === "none" || optionOf(t))) return nar(ABSENT_REASON);
    return "null";
  }
  if (v === null) return "null";
  switch (t.k) {
    case "union": {
      const o = optionOf(t);
      if (o) return wire(v, o);
      const r = carry(v);
      return r !== null ? nar(r) : plain(v);
    }
    case "f64":
      return typeof v === "number" ? bits(v) : nar("not an f64 value");
    case "text":
      if (typeof v !== "string") return nar("not a text value");
      return v.isWellFormed() ? JSON.stringify(v) : nar(LONE);
    case "bool":
      return typeof v === "boolean" ? String(v) : nar("not a bool value");
    case "i64":
    case "u64": {
      const ok = (typeof v === "number" && Number.isSafeInteger(v)) || typeof v === "bigint";
      if (ok) {
        const b = BigInt(v);
        const inr = t.k === "i64" ? b >= -(2n ** 63n) && b <= 2n ** 63n - 1n : b >= 0n && b <= 2n ** 64n - 1n;
        if (inr) return b.toString();
      }
      return nar("not a " + t.k + " value");
    }
    case "list": {
      if (!Array.isArray(v)) return nar("not a list value");
      if (hasHole(v)) return nar(HOLE_TEXT);
      return join(v.map((e) => wire(e, t.item)), "[", "]");
    }
    case "tuple": {
      if (Array.isArray(v) && hasHole(v)) return nar(HOLE_TEXT);
      const n = t.items.length;
      if (!Array.isArray(v) || v.length !== n) return nar("not a " + n + "-tuple");
      return join(v.map((e, i) => wire(e, t.items[i])), "[", "]");
    }
    case "record": {
      if (!isPlain(v)) return nar("not a record value");
      const ws = t.fields.map(([name, ft]) => wire(Object.hasOwn(v, name) ? v[name] : undefined, ft));
      const f = ws.find(isN);
      if (f !== undefined) return f;
      return "{" + t.fields.map(([name], i) => JSON.stringify(name) + ":" + ws[i]).join(",") + "}";
    }
    case "json":
    case "map": {
      const r = carry(v);
      return r !== null ? nar(r) : plain(v);
    }
    default:
      return nar("the rust harness has no route for " + (t.k === undefined ? "undefined" : t.k));
  }
}

export default function wireLine(args, sig) {
  const nFixed = sig.args.filter((a) => !a.rest).length;
  const REST = sig.args.find((a) => a.rest)?.type ?? null;
  if (!Array.isArray(args)) return nar("the args are not a list");
  if (REST === null && args.length !== nFixed) return nar(args.length + " args for a " + nFixed + "-parameter SIG");
  if (hasHole(args)) return nar(HOLE_TEXT);
  const ws = [];
  for (let j = 0; j < args.length; j++) {
    const t = j < nFixed ? sig.args[j].type : REST;
    let w;
    try {
      w = wire(args[j], t);
    } catch (e) {
      return nar("wire: " + e.message);
    }
    if (isN(w)) return w;
    ws.push(w);
  }
  return "[" + ws.join(",") + "]";
}
