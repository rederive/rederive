const BREAK = /[\r  ]/;
const linesOf = (t) => t.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
const isOneLine = (l) => /^\s*```.*```\s*$/.test(l) && l.trim().length > 6;
const isFence = (l) => /^\s*(?:```|~~~)/.test(l) && !isOneLine(l);
const fenceRun = (l) => {
  const m = /^\s*(`{3,}|~{3,})/.exec(l);
  return m ? m[1] : "";
};
const closes = (l, open) => {
  const r = fenceRun(l);
  return r !== "" && r[0] === open[0] && r.length >= open.length && l.trim().slice(r.length).trim() === "";
};
const normalize = (s) => s.replace(/\s+/g, " ").trim();

function headingT(l) {
  const m = /^#+/.exec(l);
  if (!m || m[0].length > 6) return null;
  const T = l.slice(m[0].length);
  if (T.length < 2 || !/^\s/.test(T)) return null;
  const lead = /^\s*/.exec(T)[0].length;
  for (let i = 0; i < T.length; i++) {
    if (BREAK.test(T[i]) && (i >= lead || i === T.length - 1)) return null;
  }
  return T;
}

function keyOf(T) {
  const c = T.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();
  return c.split(/[^a-z0-9]+/).filter((x) => x !== "").join(" ");
}

function scan(lines) {
  const heads = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (open !== null) {
      if (closes(l, open)) open = null;
      continue;
    }
    if (isFence(l)) {
      open = fenceRun(l);
      continue;
    }
    const T = headingT(l);
    if (T !== null) heads.push({ line: i, key: keyOf(T) });
  }
  return heads;
}

export default function adopt_find_duplicate(existing, section) {
  if (/<!--\s*rederive:begin\b/.test(existing)) return null;
  let body = linesOf(section).join("\n");
  const bm = /<!--\s*rederive:begin\b(?:(?!<!--)[\s\S])*?-->/.exec(body);
  if (bm) body = body.slice(bm.index + bm[0].length);
  const em = /<!--\s*rederive:end\s*-->/.exec(body);
  if (em) body = body.slice(0, em.index);
  body = body.trim();

  const bl = body.split("\n");
  const keys = new Set();
  const headLines = new Set();
  for (const h of scan(bl)) {
    headLines.add(h.line);
    if (h.key !== "") keys.add(h.key);
  }
  if (keys.size === 0) return null;
  const pool = new Set();
  bl.forEach((l, i) => {
    if (l.trim() === "" || headLines.has(i) || isFence(l)) return;
    const n = normalize(l);
    if (n.length > 15) pool.add(n);
  });

  const el = linesOf(existing);
  const heads = scan(el);
  const matched = (h) => h.key !== "" && keys.has(h.key);
  let i = 0;
  while (i < heads.length) {
    if (!matched(heads[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < heads.length && matched(heads[j + 1])) j++;
    const start = heads[i].line;
    const end = j + 1 < heads.length ? heads[j + 1].line : el.length;
    const seen = new Set();
    for (let k = start; k < end; k++) seen.add(normalize(el[k]));
    let count = 0;
    for (const p of pool) if (seen.has(p)) count++;
    if (count >= 2) return { heading: el[start].trim(), startLine: start, endLine: end };
    i = j + 1;
  }
  return null;
}
