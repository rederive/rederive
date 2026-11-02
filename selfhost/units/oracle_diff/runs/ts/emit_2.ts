type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Shown = { name: string; hidden: boolean; input: string; to: string };
type Rewritten = { name: string; hidden: boolean; input: string; from: string; to: string; inputChanged: boolean };
type Changed = { name: string; hidden: boolean; from: string; to: string };
type Moved = { name: string; from: string; to: string };
type Other = { name: string; keys: string[] };
type Obj = { [key: string]: Json };
type Raw = Json | undefined;
type Case = { key: string; name: string; hidden: boolean; args: Raw; expected: Raw; other: Map<string, Json> };
type Parsed = { shape: string; cases: Case[]; file: Map<string, Json> };

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ESCAPED = /\\u00([0-9a-f]{2})|\\u([0-9a-f]{4})/g;
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");
const BITS = /^[0-9a-f]{16}$/;
const MARK = "#absent";
const LO = "‹";
const HI = "›";

function isObj(x: unknown): x is Obj {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function has(o: Obj, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function own(o: Obj, k: string): Raw {
  return has(o, k) ? o[k] : undefined;
}

function keyOf(v: Raw, depth: number): string {
  if (depth > 2000) return "!deep";
  if (v === undefined) return "u";
  if (v === null) return "z";
  if (typeof v === "number") return "n" + (Object.is(v, -0) ? "-0" : String(v));
  if (typeof v === "string") return "s" + JSON.stringify(v);
  if (typeof v === "boolean") return "b" + String(v);
  if (Array.isArray(v)) return "[" + v.map((e) => keyOf(e, depth + 1)).join(",") + "]";
  return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + keyOf(v[k], depth + 1)).join(",") + "}";
}

function canonical(x: Raw, depth: number): boolean {
  if (depth > 416) return false;
  if (x === undefined || x === null || typeof x === "number") return false;
  if (typeof x === "string" || typeof x === "boolean") return true;
  if (Array.isArray(x)) {
    for (const e of x) if (!canonical(e, depth + 1)) return false;
    return true;
  }
  const t = own(x, "t");
  if (t === "f64") {
    const b = own(x, "bits");
    return typeof b === "string" && BITS.test(b) && depth + 1 <= 416;
  }
  if (t === "throw") return true;
  for (const k of Object.keys(x)) if (!canonical(x[k], depth + 1)) return false;
  return true;
}

function nodeKind(x: Json): string {
  if (isObj(x)) {
    const t = own(x, "t");
    if (t === "f64") return "f64";
    if (t === "throw") return "throw";
  }
  return "";
}

function canonEqual(x: Json, y: Json): boolean {
  if (typeof x === "string" || typeof x === "boolean") return x === y;
  if (Array.isArray(x)) {
    if (!Array.isArray(y) || x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!canonEqual(x[i], y[i])) return false;
    return true;
  }
  if (!isObj(x) || !isObj(y)) return false;
  const kx = nodeKind(x);
  const ky = nodeKind(y);
  if (kx !== ky) return false;
  if (kx === "f64") return own(x, "bits") === own(y, "bits");
  if (kx === "throw") return true;
  const ax = Object.keys(x);
  const ay = Object.keys(y);
  if (ax.length !== ay.length) return false;
  for (const k of ax) {
    if (!has(y, k)) return false;
    if (!canonEqual(x[k], y[k])) return false;
  }
  return true;
}

function equal(x: Raw, y: Raw): boolean {
  if (canonical(x, 0) && canonical(y, 0) && x !== undefined && y !== undefined) return canonEqual(x, y);
  return keyOf(x, 0) === keyOf(y, 0);
}

function label(c: number): string {
  const names: { [k: number]: string } = { 0: "NUL", 7: "BEL", 9: "\\t", 10: "\\n", 13: "\\r", 27: "ESC", 155: "CSI" };
  const n = names[c];
  return LO + (n !== undefined ? n : "U+" + c.toString(16).toUpperCase().padStart(4, "0")) + HI;
}

function isControl(c: number): boolean {
  return c <= 0x1f || (c >= 0x7f && c <= 0x9f);
}

function nameControls(s: string): string {
  const p1 = s.replace(ESCAPED, (m: string, a: string | undefined, b: string | undefined) => {
    const c = parseInt(a !== undefined ? a : (b === undefined ? "0" : b), 16);
    return isControl(c) ? label(c) : m;
  });
  return p1.replace(CONTROL, (m: string) => label(m.charCodeAt(0)));
}

function textOf(x: Raw): string {
  return String(x);
}

function joinPart(x: Raw): string {
  if (x === undefined || x === null) return "";
  if (typeof x === "string") return x;
  return String(x);
}

function at(e: Json, i: number): Raw {
  if (typeof e === "string") return e.length > i ? e.charAt(i) : undefined;
  if (Array.isArray(e)) return i < e.length ? e[i] : undefined;
  return undefined;
}

function fail(): never {
  throw new Error("fail");
}

function field(n: Raw): string {
  if (typeof n === "string") return IDENT.test(n) ? n : JSON.stringify(n);
  if (n === undefined) return "undefined";
  if (n === null) return "null";
  if (typeof n === "boolean") return n ? "true" : "false";
  if (typeof n === "number") return String(n);
  return JSON.stringify(n);
}

function badEntry(e: Json): boolean {
  return e === null || typeof e === "boolean" || typeof e === "number" || isObj(e);
}

function disp(x: Raw): Raw {
  if (x === undefined || x === null) return fail();
  if (!isObj(x)) return "?";
  const t = own(x, "t");
  const v = own(x, "v");
  switch (t) {
    case "none":
      return "null";
    case "undefined":
      return "undefined";
    case "bool":
      return textOf(v);
    case "bigint":
      return textOf(v) + "n";
    case "text":
      return v === undefined ? undefined : JSON.stringify(v);
    case "f64":
    case "i64":
    case "u64":
    case "bytes":
      return v;
    case "throw": {
      const m = own(x, "msg");
      return "throw(" + (m === undefined || m === null ? "\"\"" : JSON.stringify(m)) + ")";
    }
    case "list":
    case "tuple": {
      if (!Array.isArray(v)) return fail();
      return "[" + v.map((e) => joinPart(disp(e))).join(",") + "]";
    }
    case "map": {
      if (!Array.isArray(v)) return fail();
      for (const e of v) if (badEntry(e)) return fail();
      return "{" + v.map((e) => textOf(disp(at(e, 0))) + ":" + textOf(disp(at(e, 1)))).join(",") + "}";
    }
    case "record": {
      if (!Array.isArray(v)) return fail();
      for (const e of v) if (badEntry(e)) return fail();
      return "{" + v.map((e) => field(at(e, 0)) + ":" + textOf(disp(at(e, 1)))).join(", ") + "}";
    }
    default:
      return "?";
  }
}

function shown(x: Raw): string {
  try {
    let d: Raw;
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
  if (Array.isArray(c.args)) return c.args.map((e) => shown(e)).join(", ");
  return "(args: " + shown(c.args) + ")";
}

function tooDeep(root: Json): boolean {
  const stack: Array<[Json, number]> = [[root, 0]];
  while (stack.length > 0) {
    const top = stack.pop();
    if (top === undefined) break;
    const [v, d] = top;
    if (d > 2000) return true;
    if (Array.isArray(v)) {
      for (const e of v) stack.push([e, d + 1]);
    } else if (isObj(v)) {
      for (const k of Object.keys(v)) stack.push([v[k], d + 1]);
    }
  }
  return false;
}

function parse(text: string): Parsed {
  const empty = (shape: string): Parsed => ({ shape, cases: [], file: new Map<string, Json>() });
  let p: Json;
  try {
    p = JSON.parse(text);
  } catch {
    return empty("unparseable");
  }
  if (!isObj(p)) return empty("unknown-shape");
  const fr = own(p, "frozen");
  const ho = own(p, "heldout");
  if (!Array.isArray(fr) || !Array.isArray(ho)) return empty("unknown-shape");
  if (tooDeep(p)) return empty("too-deep");
  let shape = "ok";
  const cases: Case[] = [];
  const counts = new Map<string, number>();
  const add = (list: Json[], hidden: boolean): void => {
    for (const el of list) {
      if (!isObj(el)) {
        shape = "malformed-cases";
        continue;
      }
      const hn = has(el, "name");
      const nm = own(el, "name");
      const id = JSON.stringify([hn ? keyOf(nm, 0) : null, hn]);
      const k = (counts.get(id) ?? 0) + 1;
      counts.set(id, k);
      let name: string;
      if (!hn) name = "(no name)";
      else if (typeof nm === "string") name = nm;
      else {
        const j: string | undefined = JSON.stringify(nm);
        name = j === undefined ? "undefined" : j;
      }
      if (k >= 2) name += " (#" + k + ")";
      const other = new Map<string, Json>();
      for (const key of Object.keys(el)) if (key !== "name" && key !== "args" && key !== "expected") other.set(key, el[key]);
      cases.push({ key: JSON.stringify([id, k]), name, hidden, args: own(el, "args"), expected: own(el, "expected"), other });
    }
  };
  add(fr, false);
  add(ho, true);
  const file = new Map<string, Json>();
  for (const key of Object.keys(p)) if (key !== "frozen" && key !== "heldout" && key !== "canonicalSha256") file.set(key, p[key]);
  return { shape, cases, file };
}

function changedKeys(x: Map<string, Json>, y: Map<string, Json>): string[] {
  const all = new Set<string>();
  for (const k of x.keys()) all.add(k);
  for (const k of y.keys()) all.add(k);
  const out: string[] = [];
  for (const k of Array.from(all).sort()) {
    const a = x.has(k) ? keyOf(x.get(k), 0) : MARK;
    const b = y.has(k) ? keyOf(y.get(k), 0) : MARK;
    if (a !== b) out.push(k);
  }
  return out;
}

export function oracle_diff(before: string, after: string): { before: string; after: string; added: Shown[]; removed: Shown[]; rewritten: Rewritten[]; inputsChanged: Changed[]; moved: Moved[]; otherChanged: Other[]; fileChanged: string[]; reordered: boolean } {
  const b = parse(before);
  const a = parse(after);
  const added: Shown[] = [];
  const removed: Shown[] = [];
  const rewritten: Rewritten[] = [];
  const inputsChanged: Changed[] = [];
  const moved: Moved[] = [];
  const otherChanged: Other[] = [];
  const bMap = new Map<string, Case>();
  for (const c of b.cases) bMap.set(c.key, c);
  const aMap = new Map<string, Case>();
  for (const c of a.cases) aMap.set(c.key, c);
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
    const ck = changedKeys(o.other, c.other);
    if (ck.length > 0) otherChanged.push({ name: c.name, keys: ck });
  }
  for (const o of b.cases) {
    if (!aMap.has(o.key)) removed.push({ name: o.name, hidden: o.hidden, input: input(o), to: shown(o.expected) });
  }
  const seqB = b.cases.filter((c) => aMap.has(c.key)).map((c) => c.key);
  const seqA = a.cases.filter((c) => bMap.has(c.key)).map((c) => c.key);
  let reordered = false;
  for (let i = 0; i < seqB.length; i++) if (seqB[i] !== seqA[i]) reordered = true;
  return {
    before: b.shape,
    after: a.shape,
    added,
    removed,
    rewritten,
    inputsChanged,
    moved,
    otherChanged,
    fileChanged: changedKeys(b.file, a.file),
    reordered,
  };
}
