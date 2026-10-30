const WHAT = "carried data declared under DEPENDS-ON — use CARRIED (§" + "18)";
const OPENERS = " \t([{,=:;|<>!&-~";
const isSP = (c) => c === " " || c === "\t";
const isWord = (c) => c !== undefined && /^[A-Za-z0-9_]$/.test(c);
const CARRIED = /(?<![A-Za-z])carried(?![A-Za-z])/i;
const NAMERE = /^[A-Z][A-Z0-9-]*$/;

function trimSP(s) {
  let a = 0, b = s.length;
  while (a < b && isSP(s[a])) a++;
  while (b > a && isSP(s[b - 1])) b--;
  return s.slice(a, b);
}
function trimEndSP(s) {
  let b = s.length;
  while (b > 0 && isSP(s[b - 1])) b--;
  return s.slice(0, b);
}

function spans(s) {
  const out = [];
  let lastClose = -2;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '"') continue;
    if (!(i === 0 || OPENERS.includes(s[i - 1]) || i === lastClose + 1)) continue;
    let j = i + 1, close = -1;
    while (j < s.length) {
      const c = s[j];
      if (c === "\\") {
        j++;
        if (j < s.length) {
          const cp = s.codePointAt(j);
          j += cp > 0xffff ? 2 : 1;
        }
        continue;
      }
      if (c === '"') { close = j; break; }
      j++;
    }
    if (close < 0) break;
    out.push([i, close]);
    lastClose = close;
    i = close;
  }
  return out;
}
const inside = (sp, p) => sp.some(([a, b]) => a < p && p < b);

function attrs(code) {
  const piece = " " + code;
  const sp = spans(piece);
  const marks = [];
  for (let p = 1; p < piece.length; p++) {
    if (!isSP(piece[p - 1])) continue;
    for (const w of ["CITED", "EARNED", "ANCHOR"]) {
      if (piece.startsWith(w, p)) {
        const n = piece[p + w.length];
        if ((n === undefined || isSP(n)) && !inside(sp, p)) marks.push([p, w.length]);
      }
    }
  }
  const body = trimSP(marks.length ? piece.slice(0, marks[0][0]) : piece);
  const vals = marks.map(([p, l], k) =>
    trimSP(piece.slice(p + l, k + 1 < marks.length ? marks[k + 1][0] : piece.length)));
  return { body, vals };
}

function hasName(content, name) {
  let from = 0;
  for (;;) {
    const i = content.indexOf(name, from);
    if (i < 0) return false;
    if (!isWord(content[i - 1]) && !isWord(content[i + name.length])) return true;
    from = i + 1;
  }
}

export default function schema_lint(text, carried_name) {
  const lines = text.split(/\r\n|\r|\n/).map((raw) => {
    let k = 0;
    while (k < raw.length && (isSP(raw[k]) || raw[k] === "﻿")) k++;
    const lead = raw.slice(0, k).split("﻿").join("");
    return trimEndSP(lead + raw.slice(k));
  });
  const dirs = [];
  let cur = null;
  lines.forEach((line, idx) => {
    if (line === "") return;
    let k = 0;
    while (k < line.length && isSP(line[k])) k++;
    const part = line.slice(k);
    if (part[0] === "#") {
      let h = 0;
      while (part[h] === "#") h++;
      let t = part.slice(h);
      if (isSP(t[0])) t = t.slice(1);
      if (cur) cur.comments.push(t);
      return;
    }
    const sp = spans(part);
    let code = part, trailing = null;
    for (let i = 1; i < part.length; i++) {
      if (part[i] === "#" && isSP(part[i - 1]) && (i + 1 === part.length || isSP(part[i + 1])) && !inside(sp, i)) {
        code = trimEndSP(part.slice(0, i));
        trailing = trimSP(part.slice(i + 1));
        break;
      }
    }
    let opened = false;
    if (k === 0) {
      let e = 0;
      while (e < code.length && !isSP(code[e])) e++;
      let name = code.slice(0, e);
      let word = null;
      if (NAMERE.test(name)) word = name;
      else if (name.endsWith(":") && NAMERE.test(name.slice(0, -1))) word = name.slice(0, -1);
      if (word !== null && !(word === "CITED" && name === "CITED:") && word !== "CITED") {
        const a = attrs(code.slice(name.length));
        cur = { line: idx + 1, text: line, dep: word === "DEPENDS-ON" && true, args: a.body, conts: [], vals: a.vals.slice(), comments: [] };
        dirs.push(cur);
        opened = true;
      }
    }
    if (!opened && cur) {
      const a = attrs(code);
      if (a.body !== "") cur.conts.push(a.body);
      for (const v of a.vals) cur.vals.push(v);
    }
    if (trailing !== null && cur) cur.comments.push(trailing);
  });
  const useName = carried_name !== null && carried_name !== undefined && carried_name !== "" && carried_name !== "none";
  const hits = [];
  for (const d of dirs) {
    if (!d.dep) continue;
    const content = [d.args, ...d.conts, ...d.vals, ...d.comments].join(" ");
    if (CARRIED.test(content) || (useName && hasName(content, carried_name))) {
      hits.push({ line: d.line, what: WHAT, text: Array.from(d.text).slice(0, 96).join("") });
    }
  }
  return { hits };
}
