type Node = { directive: string; name: string; body?: string; args: string; attrs: Record<string, string>; cont: string[]; comments: string[]; line: number; register: string | null; kind: string };
type Diag = { line: number; code: string; msg?: string };
type Result = { ast: Node[]; errors: Diag[]; warnings: Diag[] };

const REG = new Map<string, [string, string]>();
function reg(r: string, k: string, names: string[]): void {
  for (const n of names) REG.set(n, [r, k]);
}
reg("B", "lb", ["UNIT", "SIG", "ENVELOPE", "DEPENDS-ON", "PINNED", "EARNED", "CARRIED"]);
reg("B", "pr", ["DESCRIPTION", "NOTE", "RATIONALE", "PROVENANCE"]);
reg("P", "lb", ["KIND", "FIDELITY", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS", "TRACE-SEAM", "SEAM", "BEHAVIOR", "TABLE",
  "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN", "ORACLE", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "STATE", "EMIT",
  "REQUEST", "BRANCH", "ON-ERROR", "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE"]);
reg("P", "pr", ["INVARIANT", "SCOPE"]);
reg("P", "legacy", ["SIR", "VARIANT", "CARRIED-DATA", "NOTES", "GUARD-PINNED"]);
reg("L", "lb", ["LANG", "PRIMARY-SHA256", "ABI", "MECHANISM"]);

const MARKER = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const R_DIGITS = /^R\d+$/;
const COMMENT_STRIP = /^#+\s?/;

function attrs(t: string): { body: string; found: Array<[string, string]> } {
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const ms: Array<{ index: number; end: number; key: string }> = [];
  let m: RegExpExecArray | null = re.exec(t);
  while (m !== null) {
    ms.push({ index: m.index, end: m.index + m[0].length, key: m[1] ?? "" });
    m = re.exec(t);
  }
  const first = ms[0];
  if (first === undefined) return { body: t.trim(), found: [] };
  const found: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const cur = ms[i];
    if (cur === undefined) continue;
    const nx = ms[i + 1];
    const stop = nx === undefined ? t.length : nx.index;
    found.push([cur.key, t.slice(cur.end, stop).trim()]);
  }
  return { body: t.slice(0, first.index).trim(), found };
}

function store(map: Record<string, string>, found: Array<[string, string]>): void {
  for (const [k, v] of found) {
    if (Object.prototype.hasOwnProperty.call(map, k)) map[k] = (map[k] ?? "") + "; " + v;
    else map[k] = v;
  }
}

function cut40(s: string): string {
  return Array.from(s).slice(0, 40).join("");
}

export default function sir_parse(text: string): Result {
  const ast: Node[] = [];
  const errors: Diag[] = [];
  const warnings: Diag[] = [];
  let current: Node | null = null;
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.replace(/^﻿+/, "").replace(/[ \t]+$/, ""));
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const raw = lines[i] ?? "";
    if (/^\s*$/.test(raw)) continue;
    const im = /^[ \t]*/.exec(raw);
    const indent = im === null ? "" : im[0];
    const content = raw.slice(indent.length);
    if (content.startsWith("#")) {
      warnings.push({ line, code: "W_LEGACY_COMMENT" });
      if (current !== null) {
        current.comments.push(content.replace(COMMENT_STRIP, ""));
      } else {
        ast.push({ directive: "#", name: "#", body: content, args: "", attrs: {}, cont: [], comments: [content], line, register: null, kind: "comment" });
      }
      continue;
    }
    let code = content;
    let comment: string | null = null;
    const mm = MARKER.exec(content);
    if (mm !== null) {
      code = (mm[1] ?? "").replace(/\s+$/, "");
      comment = (mm[2] ?? "").trim();
      warnings.push({ line, code: "W_LEGACY_TRAILING_COMMENT" });
    }
    let prose = false;
    if (indent === "") {
      const sp = code.search(/[ \t]/);
      let name = sp < 0 ? code : code.slice(0, sp);
      const restRaw = sp < 0 ? "" : code.slice(sp + 1);
      const rest = restRaw.replace(/^[ \t]+/, "");
      if (COLON_NAME.test(name)) {
        name = name.slice(0, -1);
        warnings.push({ line, code: "W_LEGACY_COLON", msg: name });
      }
      if (DIRECTIVE_NAME.test(name)) {
        let r: string | null = null;
        let k = "unknown";
        const hit = REG.get(name);
        if (hit !== undefined) {
          r = hit[0];
          k = hit[1];
        } else if (R_DIGITS.test(name)) {
          r = "P";
          k = "lb";
        } else {
          warnings.push({ line, code: "W_UNKNOWN_DIRECTIVE", msg: name });
        }
        const a = attrs(rest);
        const at: Record<string, string> = {};
        store(at, a.found);
        const node: Node = { directive: name, name, args: a.body, attrs: at, cont: [], comments: comment !== null ? [comment] : [], line, register: r, kind: k };
        ast.push(node);
        current = node;
        continue;
      }
      prose = true;
    }
    if (current === null) {
      errors.push({ line, code: prose ? "E_NO_DIRECTIVE" : "E_ORPHAN_CONTINUATION", msg: cut40(code) });
      continue;
    }
    const a = attrs(" " + code);
    current.cont.push(a.body);
    store(current.attrs, a.found);
    if (comment !== null) current.comments.push(comment);
    if (prose) warnings.push({ line, code: "W_UNINDENTED_CONTINUATION" });
  }
  return { ast, errors, warnings };
}
