const HEADING = /^(#{1,6})\s+(.+)$/;
const FENCE = /^\s*(?:```|~~~)/;
const ONE = /^\s*```.*```\s*$/;
const RUN = /^\s*(`{3,}|~{3,})/;
const MENTION = /<!--\s*rederive:begin\b/;
const BEGIN = /<!--\s*rederive:begin\b(?:(?!<!--)[\s\S])*?-->/;
const END = /<!--\s*rederive:end\s*-->/;

const linesOf = (t) => t.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
const isOne = (l) => ONE.test(l) && l.trim().length > 6;
const isFence = (l) => FENCE.test(l) && !isOne(l);
const norm = (s) => s.replace(/\s+/g, " ").trim();
const keyOf = (t) =>
  t.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function findHeadings(lines) {
  const out = [];
  const heads = new Array(lines.length).fill(null);
  let opener = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (opener) {
      const m = RUN.exec(l);
      if (m && m[1][0] === opener[0] && m[1].length >= opener.length && l.trim().slice(m[1].length).trim() === "") opener = null;
      continue;
    }
    if (isFence(l)) {
      opener = RUN.exec(l)[1];
      continue;
    }
    const h = HEADING.exec(l);
    if (h) {
      const o = { line: i, key: keyOf(h[2]) };
      out.push(o);
      heads[i] = o;
    }
  }
  return { list: out, heads };
}

export default function adopt_find_duplicate(existing, section) {
  if (MENTION.test(existing)) return null;
  let body = linesOf(section).join("\n");
  const b = BEGIN.exec(body);
  if (b) body = body.slice(b.index + b[0].length);
  const e = END.exec(body);
  if (e) body = body.slice(0, e.index);
  body = body.trim();
  const bl = body.split("\n");
  const { list: bh, heads } = findHeadings(bl);
  const keys = new Set(bh.map((h) => h.key).filter((k) => k !== ""));
  if (keys.size === 0) return null;
  const pool = new Set();
  for (let i = 0; i < bl.length; i++) {
    const l = bl[i];
    if (l.trim() === "" || heads[i] || isFence(l)) continue;
    const n = norm(l);
    if (n.length > 15) pool.add(n);
  }
  const lines = linesOf(existing);
  const { list } = findHeadings(lines);
  let i = 0;
  while (i < list.length) {
    if (!(list[i].key !== "" && keys.has(list[i].key))) { i++; continue; }
    let j = i;
    while (j + 1 < list.length && list[j + 1].key !== "" && keys.has(list[j + 1].key)) j++;
    const start = list[i].line;
    const end = j + 1 < list.length ? list[j + 1].line : lines.length;
    const have = new Set();
    for (let k = start; k < end; k++) have.add(norm(lines[k]));
    let c = 0;
    for (const p of pool) if (have.has(p)) c++;
    if (c >= 2) return { heading: lines[start].trim(), startLine: start, endLine: end };
    i = j + 1;
  }
  return null;
}
