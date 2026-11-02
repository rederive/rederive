const LB = new RegExp("\\r\\n|\\r|\\n|\\u2028|\\u2029", "g");
const PASS_ICON = "✅";
const FAIL_ICON = "❌";

function cell(v) {
  let t = String(v === undefined || v === null ? '' : v);
  t = t.replace(LB, ' ').replace(/\|/g, '\\|');
  if (t === '') return '';
  let k = 0;
  const runs = t.match(/`+/g);
  if (runs) for (const r of runs) if (r.length > k) k = r.length;
  const fence = '`'.repeat(k + 1);
  const pad = (/^`|`$/.test(t) || (/^ .* $/.test(t) && t.trim() !== '')) ? ' ' : '';
  return fence + pad + t + pad + fence;
}

function stopsBlock(stops) {
  if (!(stops > 0)) return '';
  return '\n' + `${stops} ` + (stops === 1 ? 'Stop' : 'Stops') +
    ': each one is an annotation on its line, explained in full in the review.' + '\n';
}

export default function review_summary(units, stops) {
  if (!units.length) return '## SIR review\nNo SIR contract changed.\n' + stopsBlock(stops);
  const n = units.length;
  const rows = [];
  let f = 0;
  for (let i = 0; i < n; i++) {
    const r = units[i];
    const pass = r.status === 'pass';
    if (!pass) f++;
    rows.push('| ' + (pass ? PASS_ICON : FAIL_ICON) + ' | ' + cell(r.unit) + ' | ' + cell(r.change) + ' | ' +
      cell(r.tests) + ' | ' + cell(r.bindings) + ' | ' + cell(r.citations) + ' |');
  }
  const noun = n === 1 ? 'contract' : 'contracts';
  const verdict = f >= 1 ? `${FAIL_ICON} ${f} of ${n} ${noun} failing` : `${PASS_ICON} ${n} ${noun} passing`;
  return '## SIR review: ' + verdict + '\n\n| | unit | change | tests | bindings | citations |\n|---|---|---|---|---|---|\n' +
    rows.join('\n') + '\n' + stopsBlock(stops);
}
