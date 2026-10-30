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
  if (!(S >= 0 && S < E && E <= N)) {
    throw new Error(`adopt: block lines [${S}, ${E}) are not a range of this ${N}-line file`);
  }
  if (!VISIBLE.test(managed)) {
    throw new Error("adopt: the managed section is empty");
  }
  const outside = lines.slice(0, S).concat(lines.slice(E));
  const EOL = CRLF.test(outside.join("\n")) ? "\r\n" : "\n";
  const conv = (t) => t.replace(CONVERT, EOL);

  let p = -1;
  for (let i = S - 1; i >= 0; i--) {
    if (!BLANK.test(lines[i])) { p = i; break; }
  }
  let before = "";
  if (p >= 0) {
    let start = 0;
    for (let i = 0; i < p; i++) start += lines[i].length + 1;
    let end = start + lines[p].length;
    if (EOL === "\r\n" && lines[p].endsWith("\r")) end -= 1;
    before = existing.slice(0, end);
  }

  let q = -1;
  for (let i = E; i < N; i++) {
    if (!BLANK.test(lines[i])) { q = i; break; }
  }
  let after = "";
  if (q >= 0) {
    let start = 0;
    for (let i = 0; i < q; i++) start += lines[i].length + 1;
    after = existing.slice(start);
  }

  const mg = conv(managed.trim());
  const items = kept.filter((k) => VISIBLE.test(k)).map((k) => conv(k.replace(KEPT_END, "")));
  const rules = items.length ? HEADER + EOL + EOL + items.join(EOL + EOL) : "";

  const parts = [before, mg, rules, after].filter((x) => x !== "");
  let out = parts.join(EOL + EOL);
  if (after === "") out += EOL;
  return out;
}
