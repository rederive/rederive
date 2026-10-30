type Result = { heading: string; startLine: number; endLine: number };

const HEADING = /^(#{1,6})\s+(.+)$/;
const FENCE = /^\s*(?:```|~~~)/;
const ONE_LINE_FENCE = /^\s*```.*```\s*$/;
const FENCE_RUN = /^\s*(`{3,}|~{3,})/;
const TRAILING_PAREN = /\s*\([^)]*\)\s*$/;
const BEGIN_MENTION = /<!--\s*rederive:begin\b/;
const BEGIN_MARKER = /<!--\s*rederive:begin\b(?:(?!<!--)[\s\S])*?-->/;
const END_MARKER = /<!--\s*rederive:end\s*-->/;

function linesOf(text: string): string[] {
  return text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
}

function isOneLineFence(line: string): boolean {
  return ONE_LINE_FENCE.test(line) && line.trim().length > 6;
}

function isFence(line: string): boolean {
  return FENCE.test(line) && !isOneLineFence(line);
}

function runOf(line: string): string {
  const m = FENCE_RUN.exec(line);
  if (m === null) return "";
  const r = m[1];
  return r === undefined ? "" : r;
}

function closesFence(line: string, opener: string): boolean {
  const run = runOf(line);
  if (run === "") return false;
  return (
    run[0] === opener[0] &&
    run.length >= opener.length &&
    line.trim().slice(run.length).trim() === ""
  );
}

function headingKey(t: string): string {
  const m = TRAILING_PAREN.exec(t);
  let s = t;
  if (m !== null) s = t.slice(0, m.index);
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// For each line: heading text T (or null if not a heading).
function headingTexts(lines: string[]): (string | null)[] {
  const out: (string | null)[] = [];
  let opener = "";
  for (const line of lines) {
    if (opener !== "") {
      if (closesFence(line, opener)) opener = "";
      out.push(null);
      continue;
    }
    if (isFence(line)) {
      opener = runOf(line);
      out.push(null);
      continue;
    }
    const m = HEADING.exec(line);
    if (m === null) {
      out.push(null);
      continue;
    }
    const t = m[2];
    out.push(t === undefined ? null : t);
  }
  return out;
}

function normalize(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

export default function adopt_find_duplicate(existing: string, section: string): Result | null {
  if (BEGIN_MENTION.test(existing)) return null;

  let body = linesOf(section).join("\n");
  const bm = BEGIN_MARKER.exec(body);
  if (bm !== null) body = body.slice(bm.index + bm[0].length);
  const em = END_MARKER.exec(body);
  if (em !== null) body = body.slice(0, em.index);
  body = body.trim();

  const bodyLines = body.split("\n");
  const bodyHeads = headingTexts(bodyLines);
  const keys = new Set<string>();
  const pool = new Set<string>();
  bodyLines.forEach((line, i) => {
    const t = bodyHeads[i];
    if (t !== undefined && t !== null) {
      const k = headingKey(t);
      if (k !== "") keys.add(k);
      return;
    }
    if (line.trim() === "") return;
    if (isFence(line)) return;
    const n = normalize(line);
    if (n.length > 15) pool.add(n);
  });
  if (keys.size === 0) return null;

  const lines = linesOf(existing);
  const heads = headingTexts(lines);
  const headings: { line: number; matched: boolean }[] = [];
  heads.forEach((t, i) => {
    if (t === null || t === undefined) return;
    const k = headingKey(t);
    headings.push({ line: i, matched: k !== "" && keys.has(k) });
  });

  let i = 0;
  while (i < headings.length) {
    const h = headings[i];
    if (h === undefined || !h.matched) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < headings.length) {
      const nx = headings[j + 1];
      if (nx === undefined || !nx.matched) break;
      j++;
    }
    const next = headings[j + 1];
    const start = h.line;
    const end = next === undefined ? lines.length : next.line;
    const seen = new Set<string>();
    for (let l = start; l < end; l++) {
      const ln = lines[l];
      if (ln !== undefined) seen.add(normalize(ln));
    }
    let count = 0;
    for (const p of pool) if (seen.has(p)) count++;
    if (count >= 2) {
      const first = lines[start];
      return { heading: (first === undefined ? "" : first).trim(), startLine: start, endLine: end };
    }
    i = j + 1;
  }
  return null;
}
