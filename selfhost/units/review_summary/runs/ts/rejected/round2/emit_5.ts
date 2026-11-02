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
  const pad =
    t.startsWith("`") || t.endsWith("`") || (t.startsWith(" ") && t.endsWith(" ") && t.trim() !== "")
      ? " "
      : "";
  return fence + pad + t + pad + fence;
}

function stopsBlock(stops: number | bigint): string {
  if (!(stops > 0)) return "";
  const noun = stops === 1 ? "Stop" : "Stops";
  return `\n${stops} ${noun}${STOPS_TAIL}\n`;
}

export default function review_summary(units: readonly Row[], stops: number | bigint): string {
  const block = stopsBlock(stops);
  if (units.length === 0) return "## SIR review\nNo SIR contract changed.\n" + block;
  const n = units.length;
  let f = 0;
  const rows: string[] = [];
  for (const u of units) {
    const pass = u.status === "pass";
    if (!pass) f++;
    rows.push(
      "| " + (pass ? PASS_ICON : FAIL_ICON) + " | " + cell(u.unit) + " | " + cell(u.change) + " | " +
        cell(u.tests) + " | " + cell(u.bindings) + " | " + cell(u.citations) + " |",
    );
  }
  const noun = n === 1 ? "contract" : "contracts";
  const verdict = f >= 1 ? `${FAIL_ICON} ${f} of ${n} ${noun} failing` : `${PASS_ICON} ${n} ${noun} passing`;
  return (
    "## SIR review: " + verdict + "\n\n| | unit | change | tests | bindings | citations |\n|---|---|---|---|---|---|\n" +
    rows.join("\n") + "\n" + block
  );
}
