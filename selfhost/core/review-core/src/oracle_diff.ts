type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Shown = { name: string; hidden: boolean; input: string; to: string };
type Rewritten = { name: string; hidden: boolean; input: string; from: string; to: string; inputChanged: boolean };
type Changed = { name: string; hidden: boolean; from: string; to: string };
type Moved = { name: string; from: string; to: string };
type Other = { name: string; keys: string[] };
type Rec = { [key: string]: unknown };
type Case = { key: string; name: string; hidden: boolean; args: unknown; expected: unknown; other: Rec; otherKeys: string[] };
type File = { shape: string; cases: Case[]; fileObj: Rec; fileKeys: string[] };

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BITS = /^[0-9a-f]{16}$/;
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");
const ESCAPED = new RegExp("\\\\u([0-9a-f]{4})", "g");
const LQ = String.fromCharCode(0x2039);
const RQ = String.fromCharCode(0x203a);

function isMap(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function has(o: Rec, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}
function own(o: Rec, k: string): unknown {
  return has(o, k) ? o[k] : undefined;
}

function keyOf(v: unknown, depth: number): string {
  if (depth > 2000) return "!deep";
  if (v === null) return "z";
  if (v === undefined) return "u";
  if (typeof v === "number") return "n" + (Object.is(v, -0) ? "-0" : String(v));
  if (typeof v === "string") return "s" + JSON.stringify(v);
  if (typeof v === "boolean") return "b" + String(v);
  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (const e of v) parts.push(keyOf(e, depth + 1));
    return "[" + parts.join(",") + "]";
  }
  if (isMap(v)) {
    const parts: string[] = [];
    for (const k of Object.keys(v)) parts.push(JSON.stringify(k) + ":" + keyOf(v[k], depth + 1));
    return "{" + parts.join(",") + "}";
  }
  return "u";
}

function isNode(v: unknown, t: string): v is Rec {
  return isMap(v) && own(v, "t") === t;
}

function canonical(x: unknown): boolean {
  const stack: Array<[unknown, number]> = [[x, 0]];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    const v = item[0];
    const lvl = item[1];
    if (lvl > 416) return false;
    if (v === undefined || v === null || typeof v === "number") return false;
    if (Array.isArray(v)) {
      for (const e of v) stack.push([e, lvl + 1]);
    } else if (isMap(v)) {
      if (isNode(v, "f64")) {
        const bits = own(v, "bits");
        if (typeof bits !== "string" || !BITS.test(bits)) return false;
        stack.push([own(v, "t"), lvl + 1]);
        stack.push([bits, lvl + 1]);
      } else if (isNode(v, "throw")) {
        stack.push([own(v, "t"), lvl + 1]);
      } else {
        for (const k of Object.keys(v)) stack.push([v[k], lvl + 1]);
      }
    }
  }
  return true;
}

function canonEqual(x: unknown, y: unknown): boolean {
  if (typeof x === "string" || typeof y === "string") return x === y;
  if (typeof x === "boolean" || typeof y === "boolean") return x === y;
  if (Array.isArray(x)) {
    if (!Array.isArray(y) || x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!canonEqual(x[i], y[i])) return false;
    return true;
  }
  if (Array.isArray(y)) return false;
  if (isMap(x) && isMap(y)) {
    const xf = isNode(x, "f64");
    const yf = isNode(y, "f64");
    if (xf || yf) return xf && yf && own(x, "bits") === own(y, "bits");
    const xt = isNode(x, "throw");
    const yt = isNode(y, "throw");
    if (xt || yt) return xt && yt;
    const xk = Object.keys(x);
    const yk = Object.keys(y);
    if (xk.length !== yk.length) return false;
    for (const k of xk) {
      if (!has(y, k)) return false;
      if (!canonEqual(x[k], y[k])) return false;
    }
    return true;
  }
  return false;
}

function equal(x: unknown, y: unknown): boolean {
  if (canonical(x) && canonical(y)) return canonEqual(x, y);
  return keyOf(x, 0) === keyOf(y, 0);
}

function field(n: unknown): string {
  if (typeof n === "string") return IDENT.test(n) ? n : JSON.stringify(n);
  if (n === undefined) return "undefined";
  if (n === null) return "null";
  if (typeof n === "boolean" || typeof n === "number") return String(n);
  const j: string | undefined = JSON.stringify(n);
  return j === undefined ? "undefined" : j;
}

function entryPart(e: unknown, i: number): unknown {
  if (Array.isArray(e)) return e[i];
  if (typeof e === "string") return e[i];
  return undefined;
}

function disp(x: unknown): unknown {
  if (x === undefined || x === null) throw new Error("fails");
  if (!isMap(x)) return "?";
  const t = own(x, "t");
  if (typeof t !== "string") return "?";
  const v = own(x, "v");
  switch (t) {
    case "none":
      return "null";
    case "undefined":
      return "undefined";
    case "bool":
      return String(v);
    case "bigint":
      return String(v) + "n";
    case "text":
      return JSON.stringify(v);
    case "f64":
    case "i64":
    case "u64":
    case "bytes":
      return v;
    case "throw": {
      const m = own(x, "msg");
      const j: string | undefined = JSON.stringify(m === undefined || m === null ? "" : m);
      return "throw(" + String(j) + ")";
    }
    case "list":
    case "tuple": {
      if (!Array.isArray(v)) throw new Error("fails");
      const parts: unknown[] = [];
      for (const e of v) parts.push(disp(e));
      return "[" + parts.join(",") + "]";
    }
    case "map":
    case "record": {
      if (!Array.isArray(v)) throw new Error("fails");
      const parts: string[] = [];
      for (const e of v) {
        if (e === null || typeof e === "boolean" || typeof e === "number" || isMap(e)) throw new Error("fails");
        const e0 = entryPart(e, 0);
        const e1 = entryPart(e, 1);
        if (t === "map") parts.push(String(disp(e0)) + ":" + String(disp(e1)));
        else parts.push(field(e0) + ":" + String(disp(e1)));
      }
      return "{" + parts.join(t === "map" ? "," : ", ") + "}";
    }
    default:
      return "?";
  }
}

function label(c: number): string {
  let n: string;
  if (c === 0) n = "NUL";
  else if (c === 7) n = "BEL";
  else if (c === 9) n = "\\t";
  else if (c === 10) n = "\\n";
  else if (c === 13) n = "\\r";
  else if (c === 27) n = "ESC";
  else if (c === 0x9b) n = "CSI";
  else n = "U+" + ("0000" + c.toString(16).toUpperCase()).slice(-4);
  return LQ + n + RQ;
}

function isControl(c: number): boolean {
  return (c >= 0 && c <= 0x1f) || (c >= 0x7f && c <= 0x9f);
}

function nameControls(s: string): string {
  const p1 = s.replace(ESCAPED, (m: string, h: string) => {
    const c = parseInt(h, 16);
    return isControl(c) ? label(c) : m;
  });
  return p1.replace(CONTROL, (m: string) => label(m.charCodeAt(0)));
}

function shown(x: unknown): string {
  try {
    let d: unknown;
    try {
      d = disp(x);
    } catch {
      d = "?";
    }
    let s: string;
    if (typeof d !== "string" || d === "?") {
      const j: string | undefined = JSON.stringify(x);
      s = j === undefined ? "undefined" : j;
    } else {
      s = d;
    }
    return nameControls(s);
  } catch {
    return "?";
  }
}

function input(c: Case): string {
  if (Array.isArray(c.args)) {
    const parts: string[] = [];
    for (const e of c.args) parts.push(shown(e));
    return parts.join(", ");
  }
  return "(args: " + shown(c.args) + ")";
}

function tooDeep(root: unknown): boolean {
  const stack: Array<[unknown, number]> = [[root, 0]];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    const v = item[0];
    const d = item[1];
    if (d > 2000) return true;
    if (Array.isArray(v)) {
      for (const e of v) stack.push([e, d + 1]);
    } else if (isMap(v)) {
      for (const k of Object.keys(v)) stack.push([v[k], d + 1]);
    }
  }
  return false;
}

function restKeys(o: Rec, skip: string[]): string[] {
  return Object.keys(o).filter((k) => skip.indexOf(k) < 0);
}

function readFile(text: string): File {
  const empty: File = { shape: "", cases: [], fileObj: {}, fileKeys: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...empty, shape: "unparseable" };
  }
  if (!isMap(parsed)) return { ...empty, shape: "unknown-shape" };
  const fr = own(parsed, "frozen");
  const ho = own(parsed, "heldout");
  if (!Array.isArray(fr) || !Array.isArray(ho)) return { ...empty, shape: "unknown-shape" };
  if (tooDeep(parsed)) return { ...empty, shape: "too-deep" };
  let shape = "ok";
  const cases: Case[] = [];
  const counts = new Map<string, number>();
  const all: Array<[unknown, boolean]> = [];
  for (const e of fr) all.push([e, false]);
  for (const e of ho) all.push([e, true]);
  for (const pair of all) {
    const e = pair[0];
    if (!isMap(e)) {
      shape = "malformed-cases";
      continue;
    }
    const hasName = has(e, "name");
    const nm = own(e, "name");
    const id = JSON.stringify([hasName ? keyOf(nm, 0) : null, hasName]);
    const k = (counts.get(id) ?? 0) + 1;
    counts.set(id, k);
    let name: string;
    if (!hasName) name = "(no name)";
    else if (typeof nm === "string") name = nm;
    else {
      const j: string | undefined = JSON.stringify(nm);
      name = j === undefined ? "undefined" : j;
    }
    const totalK = cases.length + 1;
    void totalK;
    cases.push({
      key: JSON.stringify([id, k]),
      name: name,
      hidden: pair[1],
      args: own(e, "args"),
      expected: own(e, "expected"),
      other: e,
      otherKeys: restKeys(e, ["name", "args", "expected"]),
    });
  }
  for (const c of cases) {
    const n = counts;
    void n;
  }
  const nameIdx = new Map<string, number>();
  for (const c of cases) {
    const idKey = JSON.parse(c.key) as unknown;
    const idText = Array.isArray(idKey) ? String(idKey[0]) : "";
    const k = (nameIdx.get(idText) ?? 0) + 1;
    nameIdx.set(idText, k);
    if (k >= 2) c.name = c.name + " (#" + String(k) + ")";
  }
  return { shape, cases, fileObj: parsed, fileKeys: restKeys(parsed, ["frozen", "heldout", "canonicalSha256"]) };
}

function changedKeys(xo: Rec, xk: string[], yo: Rec, yk: string[]): string[] {
  const set = new Set<string>();
  for (const k of xk) set.add(k);
  for (const k of yk) set.add(k);
  const keys = Array.from(set).sort();
  const out: string[] = [];
  for (const k of keys) {
    const inX = xk.indexOf(k) >= 0 && has(xo, k);
    const inY = yk.indexOf(k) >= 0 && has(yo, k);
    if (inX && inY) {
      if (keyOf(xo[k], 0) !== keyOf(yo[k], 0)) out.push(k);
    } else if (inX || inY) {
      out.push(k);
    }
  }
  return out;
}

export function oracle_diff(before: string, after: string): { before: string; after: string; added: Shown[]; removed: Shown[]; rewritten: Rewritten[]; inputsChanged: Changed[]; moved: Moved[]; otherChanged: Other[]; fileChanged: string[]; reordered: boolean } {
  const b = readFile(before);
  const a = readFile(after);
  const added: Shown[] = [];
  const removed: Shown[] = [];
  const rewritten: Rewritten[] = [];
  const inputsChanged: Changed[] = [];
  const moved: Moved[] = [];
  const otherChanged: Other[] = [];
  const bMap = new Map<string, Case>();
  for (const c of b.cases) bMap.set(c.key, c);
  const aKeys = new Set<string>();
  for (const c of a.cases) aKeys.add(c.key);
  for (const c of a.cases) {
    const o = bMap.get(c.key);
    if (o === undefined) {
      added.push({ name: c.name, hidden: c.hidden, input: input(c), to: shown(c.expected) });
      continue;
    }
    const argsDiffer = !equal(o.args, c.args);
    if (argsDiffer) inputsChanged.push({ name: c.name, hidden: c.hidden, from: input(o), to: input(c) });
    if (!equal(o.expected, c.expected)) {
      rewritten.push({ name: c.name, hidden: c.hidden, input: input(c), from: shown(o.expected), to: shown(c.expected), inputChanged: argsDiffer });
    }
    if (o.hidden !== c.hidden) moved.push({ name: c.name, from: o.hidden ? "hidden" : "visible", to: c.hidden ? "hidden" : "visible" });
    const ck = changedKeys(o.other, o.otherKeys, c.other, c.otherKeys);
    if (ck.length > 0) otherChanged.push({ name: c.name, keys: ck });
  }
  for (const c of b.cases) {
    if (!aKeys.has(c.key)) removed.push({ name: c.name, hidden: c.hidden, input: input(c), to: shown(c.expected) });
  }
  const fileChanged = changedKeys(b.fileObj, b.fileKeys, a.fileObj, a.fileKeys);
  const bKeys = new Set<string>();
  for (const c of b.cases) bKeys.add(c.key);
  const seqB = b.cases.filter((c) => aKeys.has(c.key)).map((c) => c.key);
  const seqA = a.cases.filter((c) => bKeys.has(c.key)).map((c) => c.key);
  let reordered = seqA.length !== seqB.length;
  for (let i = 0; !reordered && i < seqA.length; i++) if (seqA[i] !== seqB[i]) reordered = true;
  return { before: b.shape, after: a.shape, added, removed, rewritten, inputsChanged, moved, otherChanged, fileChanged, reordered };
}
