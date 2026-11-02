type Row = { readonly unit: string; readonly status: string; readonly change: string; readonly tests: string; readonly bindings: string; readonly citations: string };

const PASS_ICON = "✅";
const FAIL_ICON = "❌";
const TAIL = ": each one is an annotation on its line, explained in full in the review.";

function cell(field: string): string {
  const t = field.replace(new RegExp("\\r\\n|\\r|\\n|\\u2028|\\u2029", "g"), " ").replace(/\|/g, "\\|");
  if (t === "") return "";
  const runs = t.match(/`+/g);
  let k = 0;
  if (runs !== null) {
    for (const r of runs) if (r.length > k) k = r.length;
  }
  const fence = "`".repeat(k + 1);
  const pad =
    t.startsWith("`") || t.endsWith("`") || (t.startsWith(" ") && t.endsWith(" ") && t.trim() !== "") ? " " : "";
  return fence + pad + t + pad + fence;
}

export default function review_summary(units: readonly Row[], stops: number | bigint): string {
  const block = stops > 0 ? "\n" + String(stops) + (stops === 1 ? " Stop" : " Stops") + TAIL + "\n" : "";
  const n = units.length;
  if (n === 0) return "## SIR review\nNo SIR contract changed.\n" + block;
  let f = 0;
  const rows: string[] = [];
  for (const u of units) {
    const ok = u.status === "pass";
    if (!ok) f++;
    rows.push(
      "| " + (ok ? PASS_ICON : FAIL_ICON) + " | " + cell(u.unit) + " | " + cell(u.change) + " | " + cell(u.tests) +
        " | " + cell(u.bindings) + " | " + cell(u.citations) + " |",
    );
  }
  const noun = n === 1 ? "contract" : "contracts";
  const verdict = f >= 1 ? FAIL_ICON + " " + f + " of " + n + " " + noun + " failing" : PASS_ICON + " " + n + " " + noun + " passing";
  return (
    "## SIR review: " + verdict + "\n\n| | unit | change | tests | bindings | citations |\n|---|---|---|---|---|---|\n" +
    rows.join("\n") + "\n" + block
  );
}
