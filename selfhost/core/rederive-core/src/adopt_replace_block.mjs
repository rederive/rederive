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
  if (!(0 <= S && S < E && E <= N)) {
    throw new Error(`adopt: block lines [${S}, ${E}) are not a range of this ${N}-line file`);
  }
  if (!VISIBLE.test(managed)) {
    throw new Error("adopt: the managed section is empty");
  }
  const outside = lines.slice(0, S).concat(lines.slice(E));
  const EOL = CRLF.test(outside.join("\n")) ? "\r\n" : "\n";
  let p = -1;
  for (let i = S - 1; i >= 0; i--) {
    if (!BLANK.test(lines[i])) { p = i; break; }
  }
  let before = "";
  if (p >= 0) {
    before = lines.slice(0, p + 1).join("\n");
    if (EOL === "\r\n" && before.endsWith("\r")) before = before.slice(0, -1);
  }
  let q = -1;
  for (let i = E; i < N; i++) {
    if (!BLANK.test(lines[i])) { q = i; break; }
  }
  const after = q >= 0 ? lines.slice(q).join("\n") : "";
  const conv = (t) => t.replace(CONVERT, EOL);
  const mgd = conv(managed.trim());
  const rs = kept.filter((k) => VISIBLE.test(k)).map((k) => conv(k.replace(KEPT_END, "")));
  const rules = rs.length ? HEADER + EOL + EOL + rs.join(EOL + EOL) : "";
  const parts = [before, mgd, rules, after].filter((x) => x !== "");
  let out = parts.join(EOL + EOL);
  if (after === "") out += EOL;
  return out;
}
