const VISIBLE = /[^\s\p{Cf}]/u;
const BLANK = /^[ \t\r]*$/;
const CRLF = /\r\n/;
const CONVERT = /\r\n|\r|\n/g;
const KEPT_END = /[\r\n]+$/;
const HEADER = "## Project rules (kept by `rdv init --adopt` — review and merge)";

export default function adopt_replace_block(existing, block, managed, kept) {
  const lines = existing.split("\n");
  const N = lines.length;
  const S = block.startLine;
  const E = block.endLine;
  if (!(S >= 0 && S < E && E <= N)) throw new Error("adopt: block lines not a range");
  if (!VISIBLE.test(managed)) throw new Error("adopt: the managed section is empty");
  const outside = lines.slice(0, S).concat(lines.slice(E));
  const EOL = CRLF.test(outside.join("\n")) ? "\r\n" : "\n";
  const conv = (t) => t.replace(CONVERT, EOL);

  let before = "";
  let p = -1;
  for (let i = S - 1; i >= 0; i--) {
    if (!BLANK.test(lines[i])) { p = i; break; }
  }
  if (p >= 0) {
    let off = 0;
    for (let i = 0; i < p; i++) off += lines[i].length + 1;
    let end = off + lines[p].length;
    if (EOL === "\r\n" && lines[p].endsWith("\r")) end -= 1;
    before = existing.slice(0, end);
  }

  let after = "";
  for (let i = E; i < N; i++) {
    if (!BLANK.test(lines[i])) { after = lines.slice(i).join("\n"); break; }
  }

  const man = conv(managed.trim());
  const vis = kept.filter((k) => VISIBLE.test(k));
  let rules = "";
  if (vis.length > 0) {
    rules = HEADER + EOL + EOL + vis.map((k) => conv(k.replace(KEPT_END, ""))).join(EOL + EOL);
  }
  const parts = [before, man, rules, after].filter((s) => s !== "");
  let out = parts.join(EOL + EOL);
  if (after === "") out += EOL;
  return out;
}
