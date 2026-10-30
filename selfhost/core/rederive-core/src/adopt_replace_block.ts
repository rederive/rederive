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
  const convert = (t: string): string => t.replace(CONVERT, eol);

  let before = "";
  let p = -1;
  for (let i = s - 1; i >= 0; i--) {
    if (!BLANK.test(lines[i] ?? "")) {
      p = i;
      break;
    }
  }
  if (p >= 0) {
    before = lines.slice(0, p + 1).join("\n");
    if (eol === "\r\n" && before.endsWith("\r")) before = before.slice(0, -1);
  }

  let after = "";
  for (let i = e; i < n; i++) {
    if (!BLANK.test(lines[i] ?? "")) {
      after = lines.slice(i).join("\n");
      break;
    }
  }

  const managedText = convert(managed.trim());
  const rules = kept
    .filter((k) => VISIBLE.test(k))
    .map((k) => convert(k.replace(KEPT_END, "")));
  const rulesText = rules.length === 0 ? "" : HEADER + eol + eol + rules.join(eol + eol);

  const parts = [before, managedText, rulesText, after].filter((x) => x !== "");
  let result = parts.join(eol + eol);
  if (after === "") result += eol;
  return result;
}
