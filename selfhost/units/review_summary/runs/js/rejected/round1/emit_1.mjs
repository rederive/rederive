const PASS_ICON = "✅";
const FAIL_ICON = "❌";
const TAIL = ": each one is an annotation on its line, explained in full in the review.";
const LINE_BREAK = /\r\n|\r|\n| | /g;

function cell(v) {
  const t = String(v === undefined || v === null ? '' : v).replace(LINE_BREAK, ' ').replace(/\|/g, '\\|');
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
  return '\n' + stops + (stops === 1 ? ' Stop' : ' Stops') + TAIL + '\n';
}

export default function review_summary(units, stops) {
  if (!units.length) return '## SIR review\nNo SIR contract changed.\n' + stopsBlock(stops);
  const n = units.length;
  let f = 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const u = units[i];
    const pass = u.status === 'pass';
    if (!pass) f++;
    rows.push('| ' + (pass ? PASS_ICON : FAIL_ICON) + ' | ' + cell(u.unit) + ' | ' + cell(u.change) + ' | ' + cell(u.tests) + ' | ' + cell(u.bindings) + ' | ' + cell(u.citations) + ' |');
  }
  const noun = n === 1 ? 'contract' : 'contracts';
  const verdict = f >= 1 ? FAIL_ICON + ' ' + f + ' of ' + n + ' ' + noun + ' failing' : PASS_ICON + ' ' + n + ' ' + noun + ' passing';
  return '## SIR review: ' + verdict + '\n\n| | unit | change | tests | bindings | citations |\n|---|---|---|---|---|---|\n' + rows.join('\n') + '\n' + stopsBlock(stops);
}
