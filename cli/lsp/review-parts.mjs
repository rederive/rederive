// The review's PURE parts: hunk lines, git line numbers, directive spans, workflow-command escapes and annotations, and the
// job-summary report. pr-review.mjs (the orchestration: git, the GitHub API) imports them from here, so a build can swap each
// for its selfhost-VERIFIED copy (selfhost/units/<unit>, rederive/sir-review's vendored review-core).
import { parse } from '../sir/sir-parse.mjs';

/** The new-side lines a unified diff's hunk headers cover (`@@ -a,b +c,d @@` → c … c+d-1; a missing count is 1), ascending,
 *  each once. Pure: the git call is changedLines'. */
// A header is matched only at the start of a line as git ends lines (LF), never after a CR, U+2028 or U+2029 inside content —
// the /m flag made header-shaped text in a changed line count (hunk_lines F1: 700 of 5,000 git pairs). A range past 2^53 is
// dropped (it lost lines or never ended), so is a range longer than MAX_HUNK lines (no review note needs one; a 20-million-line
// count exhausted the Set), and line 0 is not a line.
const MAX_HUNK = 1_000_000;
export function hunkLines(diff) {
  const out = new Set();
  for (const line of diff.split('\n')) { const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/); if (!m) continue;
    const s = Number(m[1]), n = m[2] === undefined ? 1 : Number(m[2]); if (n > MAX_HUNK || !Number.isSafeInteger(s + n - 1)) continue;
    for (let i = Math.max(s, 1); i < s + n; i++) out.add(i); }
  return [...out].sort((a, b) => a - b);
}
// The parser counts a lone CR as a line break; git (and so GitHub's line numbers) counts only LF. gitLine(text) maps a
// parser line (1-based, sirLines) to git's line, so a note lands where GitHub shows the text (directive_spans F1).
export function gitLine(text) { const map = [0]; let lf = 1; for (const m of text.matchAll(/\r\n|\r|\n|$/g)) { map.push(lf); if (m[0] === '\n' || m[0] === '\r\n') lf++; if (m[0] === '') break; } return (line) => map[line] ?? lf; }
// a directive's span in GIT lines (1-based, inclusive): its line to the line before the next directive's, or the file's last
// line (a final line break adds no line)
export function spans(text) { const ast = parse(text).ast.filter((d) => d.kind !== 'comment'); const g = gitLine(text);
  const last = Math.max(1, text.split('\n').length - (text.endsWith('\n') ? 1 : 0));
  return new Map(ast.map((d, i) => { const s = g(d.line); return [s, Math.max(s, ast[i + 1] ? g(ast[i + 1].line) - 1 : last)]; })); }

// GitHub workflow commands: one annotation per finding (shown on the check and on the line in Files changed)
export const escapeProperty = (v) => String(v).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C');
export const escapeData = (v) => String(v).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
// level and line are not escaped by GitHub's toolkit either: they are held to their domain here (a level outside the three is
// an error, a line that is not a positive integer is left out), so no value from a contract can reach them
const LEVELS = new Set(['error', 'warning', 'notice']);
// a missing value is empty (as GitHub's toolkit does), never the word "undefined"; an element that is not a map is skipped,
// never an abort of every annotation; a line is a safe positive integer
const val = (v) => (v === undefined || v === null ? '' : v);
export const annotations = (findings) => findings.filter((f) => f !== null && typeof f === 'object' && !Array.isArray(f)).map((f) => `::${LEVELS.has(f.level) ? f.level : 'error'} file=${escapeProperty(val(f.path))}${Number.isSafeInteger(f.line) && f.line > 0 ? `,line=${f.line}` : ''},title=${escapeProperty(val(f.title))}::${escapeData(val(f.message))}`).join('\n');
/** The per-contract report, like a test run's summary: one row per contract, pass/fail per check. */
// a cell can carry contract text (a unit name is a file name, a label comes from a pin), so it is a CODE SPAN: nothing inside
// one renders — no Markdown (a remote image ![x](…) was a tracking pixel in the job summary), no autolink, no HTML. The fence
// is one backtick longer than the longest run inside; a line break becomes a space and | is \| (GFM splits table cells
// before it reads code spans). An empty value is an empty cell.
const cell = (v) => { const t = String(val(v)).replace(/\r\n|\r|\n|\u2028|\u2029/g, ' ').replace(/\|/g, '\\|'); if (t === '') return '';
  const f = '`'.repeat(Math.max(0, ...(t.match(/`+/g) ?? []).map((r) => r.length)) + 1); const pad = /^`|`$/.test(t) || (/^ .* $/.test(t) && t.trim() !== '') ? ' ' : ''; return f + pad + t + pad + f; };
const stopsLine = (stops) => (stops > 0 ? `\n${stops} Stop${stops === 1 ? '' : 's'}: each one is an annotation on its line, explained in full in the review.\n` : '');
export function summary({ units, stops }) {
  if (!units.length) return `## SIR review\nNo SIR contract changed.\n${stopsLine(stops)}`;
  const failing = (u) => u.status !== 'pass';   // anything but an explicit pass fails closed
  const fail = units.filter(failing).length, n = units.length, cs = n > 1 ? 's' : '';
  return `## SIR review: ${fail ? `❌ ${fail} of ${n} contract${cs} failing` : `✅ ${n} contract${cs} passing`}\n\n| | unit | change | tests | bindings | citations |\n|---|---|---|---|---|---|\n${units.map((u) => `| ${failing(u) ? '❌' : '✅'} | ${cell(u.unit)} | ${cell(u.change)} | ${cell(u.tests)} | ${cell(u.bindings)} | ${cell(u.citations)} |`).join('\n')}\n${stopsLine(stops)}`;
}
