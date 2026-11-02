const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");
const ESCAPED = /\\u([0-9a-f]{4})/g;
const BITS = /^[0-9a-f]{16}$/;
const NAMES = { 0: "NUL", 7: "BEL", 9: "\\t", 10: "\\n", 13: "\\r", 27: "ESC", 155: "CSI" };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isMap = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isCtl = (n) => n <= 0x1f || (n >= 0x7f && n <= 0x9f);

function label(n) {
  const nm = Object.prototype.hasOwnProperty.call(NAMES, n) ? NAMES[n] : "U+" + n.toString(16).toUpperCase().padStart(4, "0");
  return "‹" + nm + "›";
}

function keyOf(v, depth = 0) {
  if (depth > 2000) return "!deep";
  if (v === null) return "z";
  if (v === undefined) return "u";
  if (typeof v === "number") return "n" + (Object.is(v, -0) ? "-0" : String(v));
  if (typeof v === "string") return "s" + JSON.stringify(v);
  if (typeof v === "boolean") return "b" + v;
  if (Array.isArray(v)) return "[" + v.map((e) => keyOf(e, depth + 1)).join(",") + "]";
  return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + keyOf(v[k], depth + 1)).join(",") + "}";
}

function textOf(x) {
  if (typeof x === "string") return x;
  if (x === undefined) return "undefined";
  if (x === null) return "null";
  return String(x);
}

function field(n) {
  if (typeof n === "string") return IDENT.test(n) ? n : JSON.stringify(n);
  if (n !== null && typeof n === "object") return JSON.stringify(n);
  if (n === undefined) return "undefined";
  const s = String(n);
  if (IDENT.test(s)) return s;
  return JSON.stringify(n) ?? s;
}

function fail() {
  throw new Error("fail");
}

function disp(x) {
  if (x === undefined || x === null) fail();
  if (!isMap(x)) return "?";
  const t = has(x, "t") ? x.t : undefined;
  const v = has(x, "v") ? x.v : undefined;
  if (typeof t !== "string") return "?";
  switch (t) {
    case "none": return "null";
    case "undefined": return "undefined";
    case "bool": return textOf(v);
    case "bigint": return textOf(v) + "n";
    case "text": return v === undefined ? undefined : JSON.stringify(v);
    case "f64": case "i64": case "u64": case "bytes": return v;
    case "throw": {
      const m = has(x, "msg") ? x.msg : undefined;
      return "throw(" + JSON.stringify(m === undefined || m === null ? "" : m) + ")";
    }
    case "list": case "tuple": {
      if (!Array.isArray(v)) fail();
      return "[" + v.map((e) => disp(e)).join(",") + "]";
    }
    case "map": case "record": {
      if (!Array.isArray(v)) fail();
      for (const e of v) if (e === null || typeof e === "boolean" || typeof e === "number" || isMap(e)) fail();
      const parts = v.map((e) => {
        const l = t === "map" ? textOf(disp(e[0])) : field(e[0]);
        return l + ":" + textOf(disp(e[1]));
      });
      return "{" + parts.join(t === "map" ? "," : ", ") + "}";
    }
    default: return "?";
  }
}

function shown(x) {
  try {
    let d;
    try { d = disp(x); } catch { d = "?"; }
    if (typeof d !== "string" || d === "?") d = JSON.stringify(x) ?? "undefined";
    d = d.replace(ESCAPED, (m, h) => {
      const n = parseInt(h, 16);
      return isCtl(n) ? label(n) : m;
    });
    return d.replace(CONTROL, (c) => label(c.charCodeAt(0)));
  } catch {
    return "?";
  }
}

function isNode(x, t) {
  return isMap(x) && has(x, "t") && x.t === t;
}

function canonical(x) {
  const st = [[x, 0]];
  while (st.length) {
    const [v, d] = st.pop();
    if (d > 416) return false;
    if (v === undefined || v === null || typeof v === "number") return false;
    if (typeof v === "string" || typeof v === "boolean") continue;
    if (Array.isArray(v)) { for (const e of v) st.push([e, d + 1]); continue; }
    if (isNode(v, "f64")) {
      const b = has(v, "bits") ? v.bits : undefined;
      if (typeof b !== "string" || !BITS.test(b)) return false;
      if (d + 1 > 416) return false;
      continue;
    }
    if (isNode(v, "throw")) {
      if (d + 1 > 416) return false;
      continue;
    }
    for (const k of Object.keys(v)) st.push([v[k], d + 1]);
  }
  return true;
}

function canonEq(a, b) {
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  const aa = Array.isArray(a), ba = Array.isArray(b);
  if (aa || ba) {
    if (!(aa && ba) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!canonEq(a[i], b[i])) return false;
    return true;
  }
  if (isNode(a, "f64") || isNode(b, "f64")) return isNode(a, "f64") && isNode(b, "f64") && a.bits === b.bits;
  if (isNode(a, "throw") || isNode(b, "throw")) return isNode(a, "throw") && isNode(b, "throw");
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!has(b, k)) return false;
    if (!canonEq(a[k], b[k])) return false;
  }
  return true;
}

function equal(x, y) {
  if (canonical(x) && canonical(y)) return canonEq(x, y);
  return keyOf(x) === keyOf(y);
}

const MARK = {};
function changedKeys(x, y) {
  const set = new Set([...Object.keys(x), ...Object.keys(y)]);
  const out = [];
  for (const k of [...set].sort()) {
    const a = has(x, k) ? keyOf(x[k]) : MARK;
    const b = has(y, k) ? keyOf(y[k]) : MARK;
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
      for (const k of Object.keys(v)) st.push([v[k], d + 1]);
    }
  }
  return false;
}

function readFile(text) {
  const res = { shape: "unparseable", cases: [], file: Object.create(null) };
  let p;
  try { p = JSON.parse(text); } catch { return res; }
  if (!isMap(p) || !has(p, "frozen") || !has(p, "heldout") || !Array.isArray(p.frozen) || !Array.isArray(p.heldout)) {
    res.shape = "unknown-shape";
    return res;
  }
  if (tooDeep(p)) { res.shape = "too-deep"; return res; }
  let junk = false;
  const counts = new Map();
  let k = 0;
  for (const [list, hidden] of [[p.frozen, false], [p.heldout, true]]) {
    for (const c of list) {
      if (!isMap(c)) { junk = true; continue; }
      k++;
      const hn = has(c, "name");
      const id = JSON.stringify([hn ? keyOf(c.name) : null, hn]);
      const n = (counts.get(id) || 0) + 1;
      counts.set(id, n);
      let name = hn ? (typeof c.name === "string" ? c.name : JSON.stringify(c.name)) : "(no name)";
      if (n >= 2) name += " (#" + n + ")";
      const other = Object.create(null);
      for (const key of Object.keys(c)) if (key !== "name" && key !== "args" && key !== "expected") other[key] = c[key];
      res.cases.push({
        key: JSON.stringify([id, n]),
        name,
        hidden,
        args: has(c, "args") ? c.args : undefined,
        expected: has(c, "expected") ? c.expected : undefined,
        other,
      });
    }
  }
  res.shape = junk ? "malformed-cases" : "ok";
  for (const key of Object.keys(p)) if (key !== "frozen" && key !== "heldout" && key !== "canonicalSha256") res.file[key] = p[key];
  return res;
}

function input(c) {
  return Array.isArray(c.args) ? c.args.map(shown).join(", ") : "(args: " + shown(c.args) + ")";
}

export function oracle_diff(before, after) {
  const B = readFile(before), A = readFile(after);
  const bm = new Map(B.cases.map((c) => [c.key, c]));
  const am = new Map(A.cases.map((c) => [c.key, c]));
  const added = [], removed = [], rewritten = [], inputsChanged = [], moved = [], otherChanged = [];
  for (const c of A.cases) {
    const o = bm.get(c.key);
    if (!o) {
      added.push({ name: c.name, hidden: c.hidden, input: input(c), to: shown(c.expected) });
      continue;
    }
    const argsDiff = !equal(o.args, c.args);
    if (argsDiff) inputsChanged.push({ name: c.name, hidden: c.hidden, from: input(o), to: input(c) });
    if (!equal(o.expected, c.expected)) {
      rewritten.push({ name: c.name, hidden: c.hidden, input: input(c), from: shown(o.expected), to: shown(c.expected), inputChanged: argsDiff });
    }
    if (o.hidden !== c.hidden) moved.push({ name: c.name, from: o.hidden ? "hidden" : "visible", to: c.hidden ? "hidden" : "visible" });
    const ck = changedKeys(o.other, c.other);
    if (ck.length) otherChanged.push({ name: c.name, keys: ck });
  }
  for (const c of B.cases) {
    if (!am.has(c.key)) removed.push({ name: c.name, hidden: c.hidden, input: input(c), to: shown(c.expected) });
  }
  const fileChanged = changedKeys(B.file, A.file);
  const sb = B.cases.filter((c) => am.has(c.key)).map((c) => c.key);
  const sa = A.cases.filter((c) => bm.has(c.key)).map((c) => c.key);
  const reordered = sb.length !== sa.length || sb.some((k, i) => k !== sa[i]);
  return { before: B.shape, after: A.shape, added, removed, rewritten, inputsChanged, moved, otherChanged, fileChanged, reordered };
}
