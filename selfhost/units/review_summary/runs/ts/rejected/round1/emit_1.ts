type Row = { readonly unit: string; readonly status: string; readonly change: string; readonly tests: string; readonly bindings: string; readonly citations: string };

const PASS_ICON = "✅";
const FAIL_ICON = "❌";
const STOPS_TAIL = ": each one is an annotation on its line, explained in full in the review.";

function cell(field: string): string {
  const t = field.replace(/\r\n|\r|\n| | /g, " ").replace(/\|/g, "\\|");
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
    block = "\n" + `${stops} ${stops === 1 ? "Stop" : "Stops"}` + STOPS_TAIL + "\n";
  }
  const n = units.length;
  if (n === 0) return "## SIR review\nNo SIR contract changed.\n" + block;
  let f = 0;
  const lines: string[] = [];
  for (const row of units) {
    const pass = row.status === "pass";
    if (!pass) f++;
    lines.push(
      "| " + (pass ? PASS_ICON : FAIL_ICON) + " | " + cell(row.unit) + " | " + cell(row.change) + " | " +
        cell(row.tests) + " | " + cell(row.bindings) + " | " + cell(row.citations) + " |"
    );
  }
  const noun = n === 1 ? "contract" : "contracts";
  const verdict = f >= 1 ? `${FAIL_ICON} ${f} of ${n} ${noun} failing` : `${PASS_ICON} ${n} ${noun} passing`;
  return (
    "## SIR review: " + verdict + "\n\n| | unit | change | tests | bindings | citations |\n|---|---|---|---|---|---|\n" +
    lines.join("\n") + "\n" + block
  );
}
