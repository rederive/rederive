const WHAT = "carried data declared under DEPENDS-ON — use CARRIED (§" + "18)";
const OPENERS = new Set([" ", "\t", "(", "[", "{", ",", "=", ":", ";", "|", "<", ">", "!", "&", "-", "~"]);
const isSP = (c) => c === " " || c === "\t";
const CARRIED_WORD = /(?<![A-Za-z])carried(?![A-Za-z])/i;
const NAME_RE = /^[A-Z][A-Z0-9-]*:?$/;

// inside[i] true when position i lies strictly within a quoted span
function spans(s) {
  const n = s.length;
  const inside = new Array(n).fill(false);
  let prevClose = -2;
  let i = 0;
  while (i < n) {
    if (s[i] === '"') {
      if (i === 0 || OPENERS.has(s[i - 1]) || i - 1 === prevClose) {
        let j = i + 1;
        let close = -1;
        while (j < n) {
          if (s[j] === "\\") {
            if (j + 1 >= n) { j = n; break; }
            const cp = s.codePointAt(j + 1);
            j += 1 + (cp > 0xffff ? 2 : 1);
          } else if (s[j] === '"') { close = j; break; } else j++;
        }
        if (close < 0) break;
        for (let k = i + 1; k < close; k++) inside[k] = true;
        prevClose = close;
        i = close + 1;
        continue;
      }
    }
    i++;
  }
  return inside;
}

function trimSP(s) {
  let a = 0;
  let b = s.length;
  while (a < b && isSP(s[a])) a++;
  while (b > a && isSP(s[b - 1])) b--;
  return s.slice(a, b);
}

function attrs(piece) {
  const s = " " + piece;
  const inside = spans(s);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const marks = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    const wordStart = m.index + m[0].length - m[1].length;
    if (inside[wordStart]) continue;
    marks.push({ start: m.index, end: m.index + m[0].length });
  }
  if (marks.length === 0) return { body: trimSP(s), values: [] };
  const body = trimSP(s.slice(0, marks[0].start));
  const values = [];
  for (let k = 0; k < marks.length; k++) {
    const to = k + 1 < marks.length ? marks[k + 1].start : s.length;
    values.push(trimSP(s.slice(marks[k].end, to)));
  }
  return { body, values };
}

function isWord(c) {
  return c !== undefined && /[A-Za-z0-9_]/.test(c);
}

function hasName(content, name) {
  let from = 0;
  for (;;) {
    const idx = content.indexOf(name, from);
    if (idx < 0) return false;
    const before = idx > 0 ? content[idx - 1] : undefined;
    const after = content[idx + name.length];
    if (!isWord(before) && !isWord(after)) return true;
    from = idx + 1;
  }
}

export default function schema_lint(text, carried_name) {
  const lines = text.split(/\r\n|\r|\n/);
  const dirs = [];
  let cur = null;
  for (let ln = 0; ln < lines.length; ln++) {
    let raw = lines[ln];
    let k = 0;
    while (k < raw.length && (isSP(raw[k]) || raw[k] === "﻿")) k++;
    raw = raw.slice(0, k).replace(/﻿/g, "") + raw.slice(k);
    raw = raw.replace(/[ \t]+$/, "");
    const line = raw;
    if (line === "") continue;
    let p = 0;
    while (p < line.length && isSP(line[p])) p++;
    const part = line.slice(p);
    if (part[0] === "#") {
      let q = 0;
      while (q < part.length && part[q] === "#") q++;
      let ct = part.slice(q);
      if (ct.length > 0 && isSP(ct[0])) ct = ct.slice(1);
      if (cur) cur.comments.push(ct);
      continue;
    }
    const inside = spans(part);
    let mk = -1;
    for (let i = 1; i < part.length; i++) {
      if (part[i] === "#" && isSP(part[i - 1]) && (i + 1 === part.length || isSP(part[i + 1])) && !inside[i]) {
        mk = i;
        break;
      }
    }
    let code = part;
    let trailing = null;
    if (mk >= 0) {
      code = part.slice(0, mk).replace(/[ \t]+$/, "");
      trailing = trimSP(part.slice(mk + 1));
    }
    let opened = false;
    if (p === 0) {
      let e = 0;
      while (e < code.length && !isSP(code[e])) e++;
      const name = code.slice(0, e);
      if (NAME_RE.test(name)) {
        const word = name.endsWith(":") ? name.slice(0, -1) : name;
        if (word !== "CITED") {
          const a = attrs(code.slice(e));
          cur = {
            line: ln + 1,
            text: line,
            dep: word === "DEPENDS-ON",
            args: a.body,
            cont: [],
            vals: a.values.slice(),
            comments: [],
          };
          dirs.push(cur);
          opened = true;
        }
      }
    }
    if (!opened && cur) {
      const a = attrs(code);
      if (a.body !== "") cur.cont.push(a.body);
      for (const v of a.values) cur.vals.push(v);
    }
    if (cur && trailing !== null) cur.comments.push(trailing);
  }
  const hits = [];
  const useName = typeof carried_name === "string" && carried_name !== "" && carried_name !== "none";
  for (const d of dirs) {
    if (!d.dep) continue;
    const content = [d.args, ...d.cont, ...d.vals, ...d.comments].join(" ");
    if (CARRIED_WORD.test(content) || (useName && hasName(content, carried_name))) {
      hits.push({ line: d.line, what: WHAT, text: Array.from(d.text).slice(0, 96).join("") });
    }
  }
  return { hits };
}
