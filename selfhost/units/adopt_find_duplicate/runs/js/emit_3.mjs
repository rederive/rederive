const HEADING = /^(#{1,6})\s+(.+)$/;
const FENCE = /^\s*(?:```|~~~)/;
const ONE = /^\s*```.*```\s*$/;
const RUN = /^\s*(`{3,}|~{3,})/;
const PAREN = /\s*\([^)]*\)\s*$/;
const MENTION = /<!--\s*rederive:begin\b/;
const BMARK = /<!--\s*rederive:begin\b(?:(?!<!--)[\s\S])*?-->/;
const EMARK = /<!--\s*rederive:end\s*-->/;

const linesOf = (t) => t.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
const isOne = (l) => ONE.test(l) && l.trim().length > 6;
const isFence = (l) => FENCE.test(l) && !isOne(l);
const norm = (l) => l.replace(/\s+/g, " ").trim();

function closes(l, op) {
  const m = RUN.exec(l);
  if (!m) return false;
  const r = m[1];
  return r[0] === op[0] && r.length >= op.length && l.trim().slice(r.length).trim() === "";
}

function headings(lines) {
  const out = [];
  const isH = new Array(lines.length).fill(false);
  let op = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (op !== null) {
      if (closes(l, op)) op = null;
      continue;
    }
    if (isFence(l)) {
      op = RUN.exec(l)[1];
      continue;
    }
    const m = HEADING.exec(l);
    if (m) {
      isH[i] = true;
      out.push({ line: i, key: keyOf(l.slice(m[1].length)) });
    }
  }
  return { list: out, isH };
}

function keyOf(t) {
  t = t.replace(PAREN, "").toLowerCase();
  return t.replace(/[^a-z0-9]+/g, " ").trim();
}

export function adopt_find_duplicate(existing, section) {
  if (MENTION.test(existing)) return null;
  let body = linesOf(section).join("\n");
  const bm = BMARK.exec(body);
  if (bm) body = body.slice(bm.index + bm[0].length);
  const em = EMARK.exec(body);
  if (em) body = body.slice(0, em.index);
  body = body.trim();
  const bl = body.split("\n");
  const bh = headings(bl);
  const keys = new Set();
  for (const h of bh.list) if (h.key !== "") keys.add(h.key);
  if (keys.size === 0) return null;
  const pool = new Set();
  for (let i = 0; i < bl.length; i++) {
    const l = bl[i];
    if (l.trim() === "" || bh.isH[i] || isFence(l)) continue;
    const n = norm(l);
    if (n.length > 15) pool.add(n);
  }
  const lines = linesOf(existing);
  const eh = headings(lines).list;
  const matched = eh.map((h) => h.key !== "" && keys.has(h.key));
  let i = 0;
  while (i < eh.length) {
    if (!matched[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < eh.length && matched[j + 1]) j++;
    const start = eh[i].line;
    const end = j + 1 < eh.length ? eh[j + 1].line : lines.length;
    const set = new Set();
    for (let k = start; k < end; k++) set.add(norm(lines[k]));
    let c = 0;
    for (const p of pool) if (set.has(p)) c++;
    if (c >= 2) return { heading: lines[start].trim(), startLine: start, endLine: end };
    i = j + 1;
  }
  return null;
}

export default adopt_find_duplicate;
