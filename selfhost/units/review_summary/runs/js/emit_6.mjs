const LB = new RegExp("\\r\\n|\\r|\\n|\\u2028|\\u2029", "g");
const PASS = "✅";
const FAIL = "❌";

function cell(v) {
  const t = String(v === undefined || v === null ? "" : v).replace(LB, " ").replace(/\|/g, "\\|");
  if (t === "") return "";
  let k = 0;
  const runs = t.match(/`+/g);
  if (runs) for (const r of runs) if (r.length > k) k = r.length;
  const fence = "`".repeat(k + 1);
  const pad = /^`|`$/.test(t) || (/^ .* $/.test(t) && t.trim() !== "") ? " " : "";
  return fence + pad + t + pad + fence;
}

function stopsBlock(stops) {
  if (!(stops > 0)) return "";
  const noun = stops === 1 ? "Stop" : "Stops";
  return `\n${stops} ${noun}: each one is an annotation on its line, explained in full in the review.\n`;
}

export default function review_summary(units, stops) {
  const block = stopsBlock(stops);
  if (!units.length) return "## SIR review\nNo SIR contract changed.\n" + block;
  const n = units.length;
  let f = 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = units[i];
    const ok = r.status === "pass";
    if (!ok) f++;
    rows.push(
      "| " + (ok ? PASS : FAIL) + " | " + cell(r.unit) + " | " + cell(r.change) + " | " +
        cell(r.tests) + " | " + cell(r.bindings) + " | " + cell(r.citations) + " |"
    );
  }
  const noun = n === 1 ? "contract" : "contracts";
  const verdict = f >= 1 ? `${FAIL} ${f} of ${n} ${noun} failing` : `${PASS} ${n} ${noun} passing`;
  return (
    "## SIR review: " + verdict + "\n\n| | unit | change | tests | bindings | citations |\n|---|---|---|---|---|---|\n" +
    rows.join("\n") + "\n" + block
  );
}
