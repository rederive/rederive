type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Shown = { name: string; hidden: boolean; input: string; to: string };
type Rewritten = { name: string; hidden: boolean; input: string; from: string; to: string; inputChanged: boolean };
type Changed = { name: string; hidden: boolean; from: string; to: string };
type Moved = { name: string; from: string; to: string };
type Other = { name: string; keys: string[] };
type Result = { before: string; after: string; added: Shown[]; removed: Shown[]; rewritten: Rewritten[]; inputsChanged: Changed[]; moved: Moved[]; otherChanged: Other[]; fileChanged: string[]; reordered: boolean };
type Case = { key: string; name: string; hidden: boolean; args: unknown; expected: unknown; other: Map<string, string> };
type Parsed = { shape: string; cases: Case[]; file: Map<string, string> };

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ESCAPED = /\\u00([0-9a-f]{2})|\\u([0-9a-f]{4})/g;
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");
const BITS = /^[0-9a-f]{16}$/;

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const own = (o: object, k: string): unknown => {
  const d = Object.getOwnPropertyDescriptor(o, k);
  return d ? d.value : undefined;
};
const isMap = (v: unknown): v is object => typeof v === "object" && v !== null && !Array.isArray(v);

function keyOf(v: unknown, depth: number = 0): string {
  if (depth > 2000) return "!deep";
  if (v === null) return "z";
  if (v === undefined) return "u";
  if (typeof v === "number") return "n" + (Object.is(v, -0) ? "-0" : String(v));
  if (typeof v === "string") return "s" + JSON.stringify(v);
  if (typeof v === "boolean") return "b" + String(v);
  if (Array.isArray(v)) {
    const arr: unknown[] = v;
    const parts: string[] = [];
    for (let i = 0; i < arr.length; i++) parts.push(keyOf(arr[i], depth + 1));
    return "[" + parts.join(",") + "]";
  }
  if (typeof v === "object") {
    const parts: string[] = [];
    for (const k of Object.keys(v)) parts.push(JSON.stringify(k) + ":" + keyOf(own(v, k), depth + 1));
    return "{" + parts.join(",") + "}";
  }
  return "u";
}

function canonical(x: unknown, depth: number): boolean {
  if (depth > 416) return false;
  if (x === undefined || x === null || typeof x === "number") return false;
  if (typeof x === "string" || typeof x === "boolean") return true;
  if (Array.isArray(x)) {
    const arr: unknown[] = x;
    for (let i = 0; i < arr.length; i++) if (!canonical(arr[i], depth + 1)) return false;
    return true;
  }
  if (typeof x === "object") {
    const t = own(x, "t");
    if (t === "f64") {
      const bits = own(x, "bits");
      if (!canonical(t, depth + 1) || !canonical(bits, depth + 1)) return false;
      return typeof bits === "string" && BITS.test(bits);
    }
    if (t === "throw") return canonical(t, depth + 1);
    for (const k of Object.keys(x)) if (!canonical(own(x, k), depth + 1)) return false;
    return true;
  }
  return false;
}

function nodeKind(x: object): string {
  const t = own(x, "t");
  return t === "f64" ? "f64" : t === "throw" ? "throw" : "map";
}

function canonEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "string" || typeof a === "boolean") return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    const x: unknown[] = a;
    const y: unknown[] = b;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!canonEqual(x[i], y[i])) return false;
    return true;
  }
  if (isMap(a)) {
    if (!isMap(b)) return false;
    const ka = nodeKind(a);
    if (ka !== nodeKind(b)) return false;
    if (ka === "f64") return own(a, "bits") === own(b, "bits");
    if (ka === "throw") return true;
    const keysA = Object.keys(a);
    if (keysA.length !== Object.keys(b).length) return false;
    for (const k of keysA) {
      if (!hasOwn(b, k)) return false;
      if (!canonEqual(own(a, k), own(b, k))) return false;
    }
    return true;
  }
  return false;
}

function equal(x: unknown, y: unknown): boolean {
  if (canonical(x, 0) && canonical(y, 0)) return canonEqual(x, y);
  return keyOf(x) === keyOf(y);
}

class DispFail {}

function textOf(x: unknown): string {
  return String(x);
}

function field(n: unknown): string {
  if (typeof n === "string") return IDENT.test(n) ? n : JSON.stringify(n);
  if (n === undefined) return "undefined";
  if (n === null) return "null";
  if (typeof n === "boolean") return n ? "true" : "false";
  if (typeof n === "number") return String(n);
  return JSON.stringify(n) ?? "undefined";
}

function elem(e: unknown, i: number): unknown {
  if (typeof e === "string") return i < e.length ? e[i] : undefined;
  if (Array.isArray(e)) {
    const arr: unknown[] = e;
    return i < arr.length ? arr[i] : undefined;
  }
  return undefined;
}

function disp(x: unknown): unknown {
  if (x === undefined || x === null) throw new DispFail();
  if (!isMap(x)) return "?";
  const t = own(x, "t");
  const v = own(x, "v");
  if (typeof t !== "string") return "?";
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
      const msg = own(x, "msg");
      return "throw(" + JSON.stringify(msg === undefined || msg === null ? "" : msg) + ")";
    }
    case "list":
    case "tuple": {
      if (!Array.isArray(v)) throw new DispFail();
      const arr: unknown[] = v;
      const parts: unknown[] = [];
      for (let i = 0; i < arr.length; i++) parts.push(disp(arr[i]));
      return "[" + parts.join(",") + "]";
    }
    case "map":
    case "record": {
      if (!Array.isArray(v)) throw new DispFail();
      const arr: unknown[] = v;
      const parts: string[] = [];
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (e === null || typeof e === "boolean" || typeof e === "number" || isMap(e)) throw new DispFail();
        const e0 = elem(e, 0);
        const e1 = elem(e, 1);
        if (t === "map") {
          parts.push(textOf(disp(e0)) + ":" + textOf(disp(e1)));
        } else {
          parts.push(field(e0) + ":" + textOf(disp(e1)));
        }
      }
      return "{" + parts.join(t === "map" ? "," : ", ") + "}";
    }
    default:
      return "?";
  }
}

function label(c: number): string {
  let name: string;
  switch (c) {
    case 0x00: name = "NUL"; break;
    case 0x07: name = "BEL"; break;
    case 0x09: name = "\\t"; break;
    case 0x0a: name = "\\n"; break;
    case 0x0d: name = "\\r"; break;
    case 0x1b: name = "ESC"; break;
    case 0x9b: name = "CSI"; break;
    default: name = "U+" + c.toString(16).toUpperCase().padStart(4, "0");
  }
  return "‹" + name + "›";
}

function isControl(c: number): boolean {
  return (c >= 0 && c <= 0x1f) || (c >= 0x7f && c <= 0x9f);
}

function shown(x: unknown): string {
  try {
    let d: unknown;
    try {
      d = disp(x);
    } catch {
      d = "?";
    }
    if (typeof d !== "string" || d === "?") d = JSON.stringify(x) ?? "undefined";
    const s = String(d);
    const p1 = s.replace(ESCAPED, (m: string) => {
      const n = parseInt(m.slice(2), 16);
      return isControl(n) ? label(n) : m;
    });
    return p1.replace(CONTROL, (m: string) => label(m.charCodeAt(0)));
  } catch {
    return "?";
  }
}

function inputOf(c: Case): string {
  if (Array.isArray(c.args)) {
    const arr: unknown[] = c.args;
    return arr.map((e) => shown(e)).join(", ");
  }
  return "(args: " + shown(c.args) + ")";
}

function tooDeep(root: unknown): boolean {
  const stack: [unknown, number][] = [[root, 0]];
  while (stack.length > 0) {
    const top = stack.pop();
    if (top === undefined) break;
    const [v, d] = top;
    if (d > 2000) return true;
    if (Array.isArray(v)) {
      const arr: unknown[] = v;
      for (let i = 0; i < arr.length; i++) stack.push([arr[i], d + 1]);
    } else if (isMap(v)) {
      for (const k of Object.keys(v)) stack.push([own(v, k), d + 1]);
    }
  }
  return false;
}

function keyMap(o: object, skip: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const k of Object.keys(o)) if (!skip.includes(k)) m.set(k, keyOf(own(o, k)));
  return m;
}

function parse(text: string): Parsed {
  const empty = (shape: string): Parsed => ({ shape, cases: [], file: new Map<string, string>() });
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return empty("unparseable");
  }
  if (!isMap(v)) return empty("unknown-shape");
  const frozen = own(v, "frozen");
  const heldout = own(v, "heldout");
  if (!hasOwn(v, "frozen") || !hasOwn(v, "heldout") || !Array.isArray(frozen) || !Array.isArray(heldout)) return empty("unknown-shape");
  if (tooDeep(v)) return empty("too-deep");
  const cases: Case[] = [];
  const seen = new Map<string, number>();
  let malformed = false;
  const lists: [unknown[], boolean][] = [[frozen, false], [heldout, true]];
  for (const [list, hidden] of lists) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!isMap(e)) {
        malformed = true;
        continue;
      }
      const has = hasOwn(e, "name");
      const nm = own(e, "name");
      const id = JSON.stringify([has ? keyOf(nm) : null, has]);
      const k = (seen.get(id) ?? 0) + 1;
      seen.set(id, k);
      let name = !has ? "(no name)" : typeof nm === "string" ? nm : (JSON.stringify(nm) ?? "undefined");
      if (k >= 2) name += " (#" + k + ")";
      cases.push({
        key: JSON.stringify([id, k]),
        name,
        hidden,
        args: own(e, "args"),
        expected: own(e, "expected"),
        other: keyMap(e, ["name", "args", "expected"]),
      });
    }
  }
  return { shape: malformed ? "malformed-cases" : "ok", cases, file: keyMap(v, ["frozen", "heldout", "canonicalSha256"]) };
}

function changedKeys(x: Map<string, string>, y: Map<string, string>): string[] {
  const all = new Set<string>([...x.keys(), ...y.keys()]);
  const out: string[] = [];
  for (const k of all) {
    const a = x.has(k) ? x.get(k) : "!absent";
    const b = y.has(k) ? y.get(k) : "!absent";
    if (a !== b) out.push(k);
  }
  return out.sort();
}

export function oracle_diff(before: string, after: string): { before: string; after: string; added: Shown[]; removed: Shown[]; rewritten: Rewritten[]; inputsChanged: Changed[]; moved: Moved[]; otherChanged: Other[]; fileChanged: string[]; reordered: boolean } {
  const b = parse(before);
  const a = parse(after);
  const bMap = new Map<string, Case>();
  for (const c of b.cases) bMap.set(c.key, c);
  const aKeys = new Set<string>();
  for (const c of a.cases) aKeys.add(c.key);
  const res: Result = { before: b.shape, after: a.shape, added: [], removed: [], rewritten: [], inputsChanged: [], moved: [], otherChanged: [], fileChanged: [], reordered: false };
  for (const c of a.cases) {
    const o = bMap.get(c.key);
    if (o === undefined) {
      res.added.push({ name: c.name, hidden: c.hidden, input: inputOf(c), to: shown(c.expected) });
      continue;
    }
    const argsDiffer = !equal(o.args, c.args);
    if (argsDiffer) res.inputsChanged.push({ name: c.name, hidden: c.hidden, from: inputOf(o), to: inputOf(c) });
    if (!equal(o.expected, c.expected)) {
      res.rewritten.push({ name: c.name, hidden: c.hidden, input: inputOf(c), from: shown(o.expected), to: shown(c.expected), inputChanged: argsDiffer });
    }
    if (o.hidden !== c.hidden) res.moved.push({ name: c.name, from: o.hidden ? "hidden" : "visible", to: c.hidden ? "hidden" : "visible" });
    const keys = changedKeys(o.other, c.other);
    if (keys.length > 0) res.otherChanged.push({ name: c.name, keys });
  }
  for (const c of b.cases) {
    if (!aKeys.has(c.key)) res.removed.push({ name: c.name, hidden: c.hidden, input: inputOf(c), to: shown(c.expected) });
  }
  res.fileChanged = changedKeys(b.file, a.file);
  const seqB = b.cases.filter((c) => aKeys.has(c.key)).map((c) => c.key);
  const seqA = a.cases.filter((c) => bMap.has(c.key)).map((c) => c.key);
  res.reordered = seqB.length !== seqA.length || seqB.some((k, i) => k !== seqA[i]);
  return res;
}
