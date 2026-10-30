const WHAT = "carried data declared under DEPENDS-ON — use CARRIED (§" + "18)";
const OPEN = " \t([{,=:;|<>!&-~";
const isSp = (c) => c === " " || c === "\t";

// quoted spans as [open, close] code-unit index pairs
function spans(s) {
  const out = [];
  let lastClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPEN.includes(s[i - 1]) || i === lastClose + 1)) {
      let j = i + 1;
      let close = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === "\\") {
          if (j + 1 >= s.length) { j += 1; continue; }
          const hi = s.charCodeAt(j + 1);
          const lo = j + 2 < s.length ? s.charCodeAt(j + 2) : 0;
          j += hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff ? 3 : 2;
          continue;
        }
        if (c === '"') { close = j; break; }
        j++;
      }
      if (close < 0) break;
      out.push([i, close]);
      lastClose = close;
      i = close + 1;
    } else i++;
  }
  return out;
}
const inside = (sp, p) => sp.some(([a, b]) => p > a && p < b);

function attrs(code) {
  const piece = " " + code;
  const sp = spans(piece);
  const marks = [];
  for (const w of ["CITED", "EARNED", "ANCHOR"]) {
    let from = 0;
    for (;;) {
      const p = piece.indexOf(w, from);
      if (p < 0) break;
      from = p + 1;
      if (p === 0 || !isSp(piece[p - 1])) continue;
      const e = p + w.length;
      if (e < piece.length && !isSp(piece[e])) continue;
      if (inside(sp, p)) continue;
      let r = p;
      while (r > 0 && isSp(piece[r - 1])) r--;
      marks.push({ p, e, r });
    }
  }
  marks.sort((a, b) => a.p - b.p);
  const trim = (t) => {
    let a = 0, b = t.length;
    while (a < b && isSp(t[a])) a++;
    while (b > a && isSp(t[b - 1])) b--;
    return t.slice(a, b);
  };
  const body = trim(marks.length ? piece.slice(0, marks[0].r) : piece);
  const values = marks.map((m, k) => trim(piece.slice(m.e, k + 1 < marks.length ? marks[k + 1].r : piece.length)));
  return { body, values };
}

function hasCarriedWord(s) {
  return /(?<![A-Za-z])carried(?![A-Za-z])/i.test(s);
}
const isWord = (c) => c !== undefined && /^[A-Za-z0-9_]$/.test(c);

function hasName(s, name) {
  let from = 0;
  for (;;) {
    const p = s.indexOf(name, from);
    if (p < 0) return false;
    if (!isWord(s[p - 1]) && !isWord(s[p + name.length])) return true;
    from = p + 1;
  }
}

export default function schema_lint(text, carried_name) {
  const lines = text.split(/\r\n|\r|\n/);
  const dirs = [];
  let cur = null;
  for (let n = 0; n < lines.length; n++) {
    let raw = lines[n];
    let k = 0;
    let lead = "";
    while (k < raw.length && (isSp(raw[k]) || raw[k] === "﻿")) {
      if (raw[k] !== "﻿") lead += raw[k];
      k++;
    }
    let line = lead + raw.slice(k);
    let end = line.length;
    while (end > 0 && isSp(line[end - 1])) end--;
    line = line.slice(0, end);
    if (line === "") continue;
    let q = 0;
    while (q < line.length && isSp(line[q])) q++;
    const part = line.slice(q);
    if (part[0] === "#") {
      let t = 0;
      while (part[t] === "#") t++;
      let c = part.slice(t);
      if (c.length && isSp(c[0])) c = c.slice(1);
      if (cur) cur.comments.push(c);
      continue;
    }
    const sp = spans(part);
    let code = part;
    let trailing = null;
    for (let i = 1; i < part.length; i++) {
      if (part[i] === "#" && isSp(part[i - 1]) && (i + 1 === part.length || isSp(part[i + 1])) && !inside(sp, i)) {
        let b = i;
        while (b > 0 && isSp(part[b - 1])) b--;
        code = part.slice(0, b);
        let t = part.slice(i + 1);
        let a = 0, z = t.length;
        while (a < z && isSp(t[a])) a++;
        while (z > a && isSp(t[z - 1])) z--;
        trailing = t.slice(a, z);
        break;
      }
    }
    let opened = false;
    if (q === 0) {
      let ne = 0;
      while (ne < code.length && !isSp(code[ne])) ne++;
      const name = code.slice(0, ne);
      let word = null;
      if (/^[A-Z][A-Z0-9-]*$/.test(name)) word = name;
      else if (name.endsWith(":") && /^[A-Z][A-Z0-9-]*$/.test(name.slice(0, -1))) word = name.slice(0, -1);
      if (word !== null && word !== "CITED") {
        const a = attrs(code.slice(ne));
        cur = { isDep: word === "DEPENDS-ON", line: n + 1, text: line, args: a.body, conts: [], attrs: a.values.slice(), comments: [] };
        dirs.push(cur);
        opened = true;
      }
    }
    if (!opened && cur) {
      const a = attrs(code);
      if (a.body !== "") cur.conts.push(a.body);
      for (const v of a.values) cur.attrs.push(v);
    }
    if (trailing !== null && cur) cur.comments.push(trailing);
  }
  const useName = typeof carried_name === "string" && carried_name !== "" && carried_name !== "none";
  const hits = [];
  for (const d of dirs) {
    if (!d.isDep) continue;
    const content = [d.args, ...d.conts, ...d.attrs, ...d.comments].join(" ");
    if (hasCarriedWord(content) || (useName && hasName(content, carried_name))) {
      hits.push({ line: d.line, what: WHAT, text: Array.from(d.text).slice(0, 96).join("") });
    }
  }
  return { hits };
}
