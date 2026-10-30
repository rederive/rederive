const VISIBLE = /[^\s\p{Cf}]/u;
const BLANK = /^[ \t\r]*$/;
const CRLF = /\r\n/;
const CONVERT = /\r\n|\r|\n/g;
const KEPT_END = /[\r\n]+$/;
const HEADER = "## Project rules (kept by `rdv init --adopt` — review and merge)";

export default function adopt_replace_block(existing: string, block: { heading: string; startLine: number; endLine: number }, managed: string, kept: string[]): string {
  const lines = existing.split("\n");
  const n = lines.length;
  const s = block.startLine;
  const e = block.endLine;
  if (!(s >= 0 && s < e && e <= n)) {
    throw new Error("adopt: block lines [" + s + ", " + e + ") are not a range of this " + n + "-line file");
  }
  if (!VISIBLE.test(managed)) {
    throw new Error("adopt: the managed section is empty");
  }
  const outside = lines.slice(0, s).concat(lines.slice(e));
  const eol = CRLF.test(outside.join("\n")) ? "\r\n" : "\n";
  const conv = (t: string): string => t.replace(CONVERT, eol);

  let before = "";
  for (let p = s - 1; p >= 0; p--) {
    if (!BLANK.test(lines[p])) {
      before = lines.slice(0, p + 1).join("\n");
      if (eol === "\r\n" && before.endsWith("\r")) before = before.slice(0, -1);
      break;
    }
  }

  let after = "";
  for (let q = e; q < n; q++) {
    if (!BLANK.test(lines[q])) {
      after = lines.slice(q).join("\n");
      break;
    }
  }

  const mng = conv(managed.trim());
  const vis = kept.filter((k) => VISIBLE.test(k));
  const rules = vis.length === 0
    ? ""
    : HEADER + eol + eol + vis.map((k) => conv(k.replace(KEPT_END, ""))).join(eol + eol);

  const parts = [before, mng, rules, after].filter((x) => x !== "");
  let out = parts.join(eol + eol);
  if (after === "") out += eol;
  return out;
}
