type Result = { heading: string; startLine: number; endLine: number };
type Head = { line: number; key: string };

const HEADING = /^(#{1,6})\s+(.+)$/;
const FENCE = /^\s*(?:```|~~~)/;
const ONE_LINE_FENCE = /^\s*```.*```\s*$/;
const FENCE_RUN = /^\s*(`{3,}|~{3,})/;
const TRAILING_PAREN = /\s*\([^)]*\)\s*$/;
const BEGIN_MENTION = /<!--\s*rederive:begin\b/;
const BEGIN_MARKER = /<!--\s*rederive:begin\b(?:(?!<!--)[\s\S])*?-->/;
const END_MARKER = /<!--\s*rederive:end\s*-->/;

function linesOf(text: string): string[] {
  return text.split("\n").map((p) => (p.endsWith("\r") ? p.slice(0, -1) : p));
}

function isFence(line: string): boolean {
  if (!FENCE.test(line)) return false;
  const oneLine = ONE_LINE_FENCE.test(line) && line.trim().length > 6;
  return !oneLine;
}

function runOf(line: string): string {
  const m = FENCE_RUN.exec(line);
  return m && m[1] !== undefined ? m[1] : "";
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function headingKey(t: string): string {
  let s = t;
  const m = TRAILING_PAREN.exec(s);
  if (m) s = s.slice(0, m.index);
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function headingT(line: string): string | null {
  const m = HEADING.exec(line);
  if (!m || m[1] === undefined) return null;
  return line.slice(m[1].length);
}

function walk(lines: string[]): Head[] {
  const out: Head[] = [];
  let opener = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (opener !== "") {
      const run = runOf(line);
      if (
        run !== "" &&
        run[0] === opener[0] &&
        run.length >= opener.length &&
        line.trim().slice(run.length).trim() === ""
      ) {
        opener = "";
      }
      continue;
    }
    if (isFence(line)) {
      opener = runOf(line);
      continue;
    }
    const t = headingT(line);
    if (t !== null) out.push({ line: i, key: headingKey(t) });
  }
  return out;
}

export default function adopt_find_duplicate(existing: string, section: string): { heading: string; startLine: number; endLine: number } | null {
  if (BEGIN_MENTION.test(existing)) return null;

  let body = linesOf(section).join("\n");
  const bm = BEGIN_MARKER.exec(body);
  if (bm) body = body.slice(bm.index + bm[0].length);
  const em = END_MARKER.exec(body);
  if (em) body = body.slice(0, em.index);
  body = body.trim();

  const bodyLines = body.split("\n");
  const keys = new Set<string>();
  const headLines = new Set<number>();
  for (const h of walk(bodyLines)) {
    headLines.add(h.line);
    if (h.key !== "") keys.add(h.key);
  }
  if (keys.size === 0) return null;
  const pool = new Set<string>();
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i] ?? "";
    if (line.trim() === "") continue;
    if (headLines.has(i)) continue;
    if (isFence(line)) continue;
    const n = normalize(line);
    if (n.length > 15) pool.add(n);
  }

  const exLines = linesOf(existing);
  const heads = walk(exLines);
  const matched = (h: Head): boolean => h.key !== "" && keys.has(h.key);

  let i = 0;
  while (i < heads.length) {
    const first = heads[i];
    if (first === undefined || !matched(first)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < heads.length) {
      const nx = heads[j + 1];
      if (nx === undefined || !matched(nx)) break;
      j++;
    }
    const next = heads[j + 1];
    const start = first.line;
    const end = next === undefined ? exLines.length : next.line;
    const seen = new Set<string>();
    for (let k = start; k < end; k++) seen.add(normalize(exLines[k] ?? ""));
    let count = 0;
    for (const p of pool) if (seen.has(p)) count++;
    if (count >= 2) {
      const result: Result = { heading: (exLines[start] ?? "").trim(), startLine: start, endLine: end };
      return result;
    }
    i = j + 1;
  }
  return null;
}
