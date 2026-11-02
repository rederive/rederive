const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ESCAPED = new RegExp("\\\\u([0-9a-f]{4})", "g");
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");
const BITS = /^[0-9a-f]{16}$/;
const NAMES = { 0: "NUL", 7: "BEL", 9: "\\t", 10: "\\n", 13: "\\r", 27: "ESC", 155: "CSI" };
const FAIL = { fail: true };
const MARK = "!absent";
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function keyOf(v, depth = 0) {
  if (depth > 2000) return "!deep";
  if (v === null) return "z";
  if (v === undefined) return "u";
  if (typeof v === "number") return "n" + (Object.is(v, -0) ? "-0" : String(v));
  if (typeof v === "string") return "s" + JSON.stringify(v);
  if (typeof v === "boolean") return "b" + v;
  if (Array.isArray(v)) return "[" + v.map((x) => keyOf(x, depth + 1)).join(",") + "]";
  return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + keyOf(v[k], depth + 1)).join(",") + "}";
}

function label(c) {
  const n = NAMES[c] !== undefined ? NAMES[c] : "U+" + c.toString(16).toUpperCase().padStart(4, "0");
  return "‹" + n + "›";
}
const isCtl = (c) => c <= 0x1f || (c >= 0x7f && c <= 0x9f);
function naming(d) {
  d = d.replace(ESCAPED, (m, h) => {
    const c = parseInt(h, 16);
    return isCtl(c) ? label(c) : m;
  });
  return d.replace(CONTROL, (ch) => label(ch.charCodeAt(0)));
}

function textOf(x) {
  if (typeof x === "string") return x;
  if (x === undefined) return "undefined";
  if (x === null) return "null";
  if (typeof x === "object") return JSON.stringify(x);
  return String(x);
}
function field(n) {
  if (typeof n === "string") return IDENT.test(n) ? n : JSON.stringify(n);
  if (n !== null && typeof n === "object") return JSON.stringify(n);
  return String(n);
}
function joinPart(p) {
  if (typeof p === "string") return p;
  if (p === undefined || p === null) return "";
  return textOf(p);
}
function disp(x) {
  if (x === undefined || x === null) throw FAIL;
  if (!isMap(x)) return "?";
  const t = has(x, "t") ? x.t : undefined;
  const v = has(x, "v") ? x.v : undefined;
  if (typeof t !== "string") return "?";
  switch (t) {
    case "none": return "null";
    case "undefined": return "undefined";
    case "bool": return textOf(v);
    case "bigint": return textOf(v) + "n";
    case "text": return JSON.stringify(v);
    case "f64": case "i64": case "u64": case "bytes": return v;
    case "throw": {
      const m = has(x, "msg") ? x.msg : undefined;
      return "throw(" + JSON.stringify(m === undefined || m === null ? "" : m) + ")";
    }
    case "list": case "tuple":
      if (!Array.isArray(v)) throw FAIL;
      return "[" + v.map((e) => joinPart(disp(e))).join(",") + "]";
    case "map": case "record": {
      if (!Array.isArray(v)) throw FAIL;
      const parts = v.map((e) => {
        if (e === null || typeof e === "boolean" || typeof e === "number" || isMap(e)) throw FAIL;
        if (t === "map") return textOf(disp(e[0])) + ":" + textOf(disp(e[1]));
        return field(e[0]) + ":" + textOf(disp(e[1]));
      });
      return "{" + parts.join(t === "map" ? "," : ", ") + "}";
    }
    default: return "?";
  }
}
function shown(x) {
  try {
    let d;
    try { d = disp(x); } catch (e) { d = "?"; }
    if (typeof d !== "string" || d === "?") d = JSON.stringify(x) ?? "undefined";
    return naming(d);
  } catch (e) {
    return "?";
  }
}

function canonical(x) {
  const st = [[x, 0]];
  while (st.length) {
    const [v, d] = st.pop();
    if (d > 416) return false;
    if (v === undefined || v === null || typeof v === "number") return false;
    if (typeof v === "string" || typeof v === "boolean") continue;
    if (Array.isArray(v)) { for (const e of v) st.push([e, d + 1]); continue; }
    if (has(v, "t") && v.t === "f64") {
      if (d + 1 > 416) return false;
      if (!(typeof v.bits === "string" && BITS.test(v.bits))) return false;
      continue;
    }
    if (has(v, "t") && v.t === "throw") {
      if (d + 1 > 416) return false;
      continue;
    }
    for (const k of Object.keys(v)) st.push([v[k], d + 1]);
  }
  return true;
}
const nodeT = (v, t) => has(v, "t") && v.t === t;
function canonEq(a, b) {
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  const aa = Array.isArray(a), ba = Array.isArray(b);
  if (aa || ba) {
    if (!(aa && ba) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!canonEq(a[i], b[i])) return false;
    return true;
  }
  if (!isMap(a) || !isMap(b)) return false;
  const af = nodeT(a, "f64"), bf = nodeT(b, "f64");
  if (af || bf) return af && bf && a.bits === b.bits;
  const at = nodeT(a, "throw"), bt = nodeT(b, "throw");
  if (at || bt) return at && bt;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!has(b, k)) return false;
    if (!canonEq(a[k], b[k])) return false;
  }
  return true;
}
function equal(x, y) {
  if (canonical(x) && canonical(y)) return canonEq(x, y);
  return keyOf(x) === keyOf(y);
}

function changedKeys(X, Y) {
  const ks = new Set([...X.keys(), ...Y.keys()]);
  const out = [];
  for (const k of [...ks].sort()) {
    const a = X.has(k) ? keyOf(X.get(k)) : MARK;
    const b = Y.has(k) ? keyOf(Y.get(k)) : MARK;
    if (a !== b) out.push(k);
  }
  return out;
}

function tooDeep(root) {
  const st = [[root, 0]];
  while (st.length) {
    const [v, d] = st.pop();
    if (d > 2000) return true;
    if (v !== null && typeof v === "object") {
      if (Array.isArray(v)) { for (const e of v) st.push([e, d + 1]); }
      else for (const k of Object.keys(v)) st.push([v[k], d + 1]);
    }
  }
  return false;
}

function read(text) {
  const r = { shape: "unparseable", cases: [], file: new Map() };
  let p;
  try { p = JSON.parse(text); } catch (e) { return r; }
  if (!isMap(p) || !has(p, "frozen") || !has(p, "heldout") || !Array.isArray(p.frozen) || !Array.isArray(p.heldout)) {
    r.shape = "unknown-shape";
    return r;
  }
  if (tooDeep(p)) { r.shape = "too-deep"; return r; }
  let junk = false;
  const counts = new Map();
  let k = 0;
  for (const [list, hidden] of [[p.frozen, false], [p.heldout, true]]) {
    for (const c of list) {
      if (!isMap(c)) { junk = true; continue; }
      const hn = has(c, "name");
      const id = JSON.stringify([hn ? keyOf(c.name) : null, hn]);
      const n = (counts.get(id) || 0) + 1;
      counts.set(id, n);
      let name = hn ? (typeof c.name === "string" ? c.name : JSON.stringify(c.name)) : "(no name)";
      if (n >= 2) name += " (#" + n + ")";
      const other = new Map();
      for (const key of Object.keys(c)) if (key !== "name" && key !== "args" && key !== "expected") other.set(key, c[key]);
      k++;
      r.cases.push({
        key: JSON.stringify([id, n]), name, hidden,
        args: has(c, "args") ? c.args : undefined,
        expected: has(c, "expected") ? c.expected : undefined,
        other,
      });
    }
  }
  r.shape = junk ? "malformed-cases" : "ok";
  for (const key of Object.keys(p)) if (key !== "frozen" && key !== "heldout" && key !== "canonicalSha256") r.file.set(key, p[key]);
  return r;
}

function input(c) {
  if (Array.isArray(c.args)) return c.args.map(shown).join(", ");
  return "(args: " + shown(c.args) + ")";
}

export function oracle_diff(before, after) {
  const B = read(before), A = read(after);
  const bm = new Map(B.cases.map((c) => [c.key, c]));
  const am = new Map(A.cases.map((c) => [c.key, c]));
  const res = { before: B.shape, after: A.shape, added: [], removed: [], rewritten: [], inputsChanged: [], moved: [], otherChanged: [], fileChanged: [], reordered: false };
  for (const c of A.cases) {
    const o = bm.get(c.key);
    if (!o) {
      res.added.push({ name: c.name, hidden: c.hidden, input: input(c), to: shown(c.expected) });
      continue;
    }
    const argsDiff = !equal(o.args, c.args);
    if (argsDiff) res.inputsChanged.push({ name: c.name, hidden: c.hidden, from: input(o), to: input(c) });
    if (!equal(o.expected, c.expected)) {
      res.rewritten.push({ name: c.name, hidden: c.hidden, input: input(c), from: shown(o.expected), to: shown(c.expected), inputChanged: argsDiff });
    }
    if (o.hidden !== c.hidden) res.moved.push({ name: c.name, from: o.hidden ? "hidden" : "visible", to: c.hidden ? "hidden" : "visible" });
    const ck = changedKeys(o.other, c.other);
    if (ck.length) res.otherChanged.push({ name: c.name, keys: ck });
  }
  for (const c of B.cases) {
    if (!am.has(c.key)) res.removed.push({ name: c.name, hidden: c.hidden, input: input(c), to: shown(c.expected) });
  }
  res.fileChanged = changedKeys(B.file, A.file);
  const bs = B.cases.filter((c) => am.has(c.key)).map((c) => c.key);
  const as = A.cases.filter((c) => bm.has(c.key)).map((c) => c.key);
  res.reordered = bs.length !== as.length || bs.some((k, i) => k !== as[i]);
  return res;
}
