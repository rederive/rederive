type Hit = { line: number; what: string; text: string };

const WHAT = "carried data declared under DEPENDS-ON — use CARRIED (§" + "18)";
const BOM = String.fromCharCode(0xfeff);
const OPENERS = " \t([{,=:;|<>!&-~";
const CARRIED_WORD = /(?<![A-Za-z])carried(?![A-Za-z])/i;

type Dir = { line: string; no: number; dep: boolean; args: string; cont: string[]; attrs: string[]; comments: string[] };

function isSp(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function trimSp(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && isSp(s[a])) a++;
  while (b > a && isSp(s[b - 1])) b--;
  return s.slice(a, b);
}

function trimEnd(s: string): string {
  let b = s.length;
  while (b > 0 && isSp(s[b - 1])) b--;
  return s.slice(0, b);
}

function isWord(c: string | undefined): boolean {
  return c !== undefined && /^[A-Za-z0-9_]$/.test(c);
}

function spans(s: string): [number, number][] {
  const out: [number, number][] = [];
  let prevClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '"') {
      i++;
      continue;
    }
    const opens = i === 0 || OPENERS.includes(s[i - 1] ?? "") || i === prevClose + 1;
    if (!opens) {
      i++;
      continue;
    }
    let j = i + 1;
    let close = -1;
    while (j < s.length) {
      const c = s[j];
      if (c === "\\") {
        const cp = s.codePointAt(j + 1);
        j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
        continue;
      }
      if (c === '"') {
        close = j;
        break;
      }
      j++;
    }
    if (close < 0) break;
    out.push([i, close]);
    prevClose = close;
    i = close + 1;
  }
  return out;
}

function inside(sp: [number, number][], p: number): boolean {
  for (const [a, b] of sp) if (p > a && p < b) return true;
  return false;
}

function attrs(piece: string): { body: string; values: string[] } {
  const s = " " + piece;
  const sp = spans(s);
  const words = ["CITED", "EARNED", "ANCHOR"];
  const marks: { runStart: number; end: number }[] = [];
  let i = 0;
  while (i < s.length) {
    if (isSp(s[i]) && (i === 0 || !isSp(s[i - 1]))) {
      let j = i;
      while (j < s.length && isSp(s[j])) j++;
      let hit = false;
      for (const w of words) {
        if (s.startsWith(w, j)) {
          const after = s[j + w.length];
          if ((after === undefined || isSp(after)) && !inside(sp, j)) {
            marks.push({ runStart: i, end: j + w.length });
            i = j + w.length;
            hit = true;
            break;
          }
        }
      }
      if (hit) continue;
      i = j;
      continue;
    }
    i++;
  }
  const first = marks[0];
  const body = trimSp(first === undefined ? s : s.slice(0, first.runStart));
  const values: string[] = [];
  for (let k = 0; k < marks.length; k++) {
    const m = marks[k];
    if (m === undefined) continue;
    const nx = marks[k + 1];
    values.push(trimSp(s.slice(m.end, nx === undefined ? s.length : nx.runStart)));
  }
  return { body, values };
}

function nameHit(content: string, name: string): boolean {
  let from = 0;
  for (;;) {
    const p = content.indexOf(name, from);
    if (p < 0) return false;
    if (!isWord(content[p - 1]) && !isWord(content[p + name.length])) return true;
    from = p + 1;
  }
}

export default function schema_lint(text: string, carried_name: string | null): { hits: Hit[] } {
  const dirs: Dir[] = [];
  let cur: Dir | undefined;
  const raw = text.split(/\r\n|\r|\n/);
  for (let n = 0; n < raw.length; n++) {
    let l = raw[n] ?? "";
    let k = 0;
    while (k < l.length && (isSp(l[k]) || l[k] === BOM)) k++;
    l = l.slice(0, k).split(BOM).join("") + l.slice(k);
    l = trimEnd(l);
    if (l === "") continue;
    let a = 0;
    while (a < l.length && isSp(l[a])) a++;
    const part = l.slice(a);
    if (part[0] === "#") {
      let h = 0;
      while (part[h] === "#") h++;
      let c = part.slice(h);
      if (isSp(c[0])) c = c.slice(1);
      if (cur !== undefined) cur.comments.push(c);
      continue;
    }
    const sp = spans(part);
    let code = part;
    let trailing: string | null = null;
    for (let p = 1; p < part.length; p++) {
      if (part[p] === "#" && isSp(part[p - 1]) && (p + 1 >= part.length || isSp(part[p + 1])) && !inside(sp, p)) {
        code = trimEnd(part.slice(0, p));
        trailing = trimSp(part.slice(p + 1));
        break;
      }
    }
    let opened = false;
    if (a === 0) {
      let e = 0;
      while (e < code.length && !isSp(code[e])) e++;
      const name = code.slice(0, e);
      if (/^[A-Z][A-Z0-9-]*:?$/.test(name)) {
        const word = name.endsWith(":") ? name.slice(0, -1) : name;
        if (word !== "CITED") {
          const at = attrs(code.slice(e));
          cur = { line: l, no: n + 1, dep: word === "DEPENDS-ON", args: at.body, cont: [], attrs: at.values, comments: [] };
          dirs.push(cur);
          opened = true;
        }
      }
    }
    if (!opened && cur !== undefined) {
      const at = attrs(code);
      if (at.body !== "") cur.cont.push(at.body);
      for (const v of at.values) cur.attrs.push(v);
    }
    if (trailing !== null && cur !== undefined) cur.comments.push(trailing);
  }
  const hits: Hit[] = [];
  const useName = carried_name !== null && carried_name !== "" && carried_name !== "none";
  for (const d of dirs) {
    if (!d.dep) continue;
    const content = [d.args, ...d.cont, ...d.attrs, ...d.comments].join(" ");
    if (CARRIED_WORD.test(content) || (useName && carried_name !== null && nameHit(content, carried_name))) {
      hits.push({ line: d.no, what: WHAT, text: Array.from(d.line).slice(0, 96).join("") });
    }
  }
  return { hits };
}
