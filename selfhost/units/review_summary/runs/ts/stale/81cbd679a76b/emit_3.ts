type Row = { readonly unit: string; readonly status: string; readonly change: string; readonly tests: string; readonly bindings: string; readonly citations: string }

const LINE_BREAK = new RegExp("\\r\\n|\\r|\\n|\\u2028|\\u2029", "g");
const PASS_ICON = "✅";
const FAIL_ICON = "❌";

function cell(field: string): string {
  const t = field.replace(LINE_BREAK, " ").replace(/\|/g, "\\|");
  if (t === "") return "";
  const runs = t.match(/`+/g);
  let k = 0;
  if (runs !== null) {
    for (const r of runs) if (r.length > k) k = r.length;
  }
  const fence = "`".repeat(k + 1);
  const pad = /^`|`$/.test(t) || (/^ .* $/.test(t) && t.trim() !== "") ? " " : "";
  return fence + pad + t + pad + fence;
}

export default function review_summary(units: readonly Row[], stops: number | bigint): string {
  let block = "";
  if (stops > 0) {
    block = "\n" + `${stops}` + (stops === 1 ? " Stop" : " Stops") + ": each one is an annotation on its line, explained in full in the review." + "\n";
  }
  if (units.length === 0) return "## SIR review\nNo SIR contract changed.\n" + block;
  const n = units.length;
  let f = 0;
  const rows: string[] = [];
  for (const u of units) {
    const fail = u.status !== "pass";
    if (fail) f++;
    rows.push("| " + (fail ? FAIL_ICON : PASS_ICON) + " | " + cell(u.unit) + " | " + cell(u.change) + " | " + cell(u.tests) + " | " + cell(u.bindings) + " | " + cell(u.citations) + " |");
  }
  const noun = n === 1 ? "contract" : "contracts";
  const verdict = f >= 1 ? FAIL_ICON + " " + f + " of " + n + " " + noun + " failing" : PASS_ICON + " " + n + " " + noun + " passing";
  return "## SIR review: " + verdict + "\n\n| | unit | change | tests | bindings | citations |\n|---|---|---|---|---|---|\n" + rows.join("\n") + "\n" + block;
}
