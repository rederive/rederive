type Result = { heading: string; startLine: number; endLine: number };
type Info = { heading: boolean; key: string };

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

function headingKey(t: string): string {
  const cut = t.replace(TRAILING_PAREN, "");
  return cut
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scan(lines: string[]): Info[] {
  const out: Info[] = [];
  let opener: string | null = null;
  for (const line of lines) {
    const rm = FENCE_RUN.exec(line);
    const run = rm ? rm[1] : "";
    if (opener !== null) {
      if (
        run !== "" &&
        run[0] === opener[0] &&
        run.length >= opener.length &&
        line.trim().slice(run.length).trim() === ""
      ) {
        opener = null;
      }
      out.push({ heading: false, key: "" });
      continue;
    }
    if (isFence(line)) {
      opener = run;
      out.push({ heading: false, key: "" });
      continue;
    }
    const hm = HEADING.exec(line);
    if (hm) {
      out.push({ heading: true, key: headingKey(line.slice(hm[1].length)) });
    } else {
      out.push({ heading: false, key: "" });
    }
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
  if (bm) body = body.slice(bm.index + bm[0].length);
  const em = END_MARKER.exec(body);
  if (em) body = body.slice(0, em.index);
  body = body.trim();

  const bodyLines = body.split("\n");
  const bodyInfo = scan(bodyLines);
  const keys = new Set<string>();
  const pool = new Set<string>();
  for (let i = 0; i < bodyLines.length; i++) {
    const info = bodyInfo[i];
    if (info.heading && info.key !== "") keys.add(info.key);
  }
  if (keys.size === 0) return null;
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    if (bodyInfo[i].heading) continue;
    if (line.trim() === "") continue;
    if (isFence(line)) continue;
    const n = normalize(line);
    if (n.length > 15) pool.add(n);
  }

  const lines = linesOf(existing);
  const info = scan(lines);
  const heads: number[] = [];
  for (let i = 0; i < lines.length; i++) if (info[i].heading) heads.push(i);

  let h = 0;
  while (h < heads.length) {
    const isMatched = (idx: number): boolean => {
      const k = info[heads[idx]].key;
      return k !== "" && keys.has(k);
    };
    if (!isMatched(h)) {
      h++;
      continue;
    }
    let e = h;
    while (e < heads.length && isMatched(e)) e++;
    const start = heads[h];
    const end = e < heads.length ? heads[e] : lines.length;
    const seen = new Set<string>();
    for (let i = start; i < end; i++) seen.add(normalize(lines[i]));
    let count = 0;
    for (const p of pool) if (seen.has(p)) count++;
    if (count >= 2) {
      return { heading: lines[start].trim(), startLine: start, endLine: end };
    }
    h = e;
  }
  return null;
}
