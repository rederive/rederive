// SIR review for pull requests: the plain-English diff (./explain.mjs) of every changed .sir file, posted as ONE sticky PR
// comment (edited on each push) plus inline notes on the changed lines of tested parts. Runs in GitHub Actions on
// `pull_request` with `pull-requests: write`; reads the base and head versions through git, never the network.
// Nothing here writes to a .sir file: the review is a view of the contract, never part of it (a byte added to a primary
// would stale every binding).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, basename, join, posix } from 'node:path';
import { explain, explainDiff, oracleDiff } from './explain.mjs';
import { bindingOf } from './analyze.mjs';
import { vectorSetSha } from '../sir/canon.mjs';
// the review's pure parts live in ./review-parts.mjs, so a build can swap each for its verified copy (rederive/sir-review
// builds from the selfhost-verified bundle); they are re-exported here unchanged
import { hunkLines, gitLine, spans, escapeProperty, escapeData, annotations, summary } from './review-parts.mjs';
export { hunkLines, gitLine, spans, escapeProperty, escapeData, annotations, summary };

export const MARKER = '<!-- sir-review -->';
const NOTE = '<!-- sir-review:inline -->';
const FAMILY_FILE = /^(.+?)\.([^.]+)\.sir$/;
const git = (args) => { try { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const at = (sha, path) => git(['show', `${sha}:${path}`]);
const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const chip = (checked) => (checked ? '🧪 tested' : '📝 note · not tested');
const words = (d) => d.map((p) => (p.op === '=' ? esc(p.text) : p.op === '+' ? `<ins><b>${esc(p.text)}</b></ins>` : `<del>${esc(p.text)}</del>`)).join('');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// the RIGHT-side lines a PR changed in one file (GitHub accepts inline comments only on lines inside the diff)
const changedLines = (base, head, path) => new Set(hunkLines(git(['diff', '-U0', base, head, '--', path]) ?? ''));

/** Review one PR → { body (the sticky comment), inline: [{ path, line, body }] (PR line notes), findings: [{ level, path,
 *  line?, title, message }] (check annotations: error = a Stop), units: [{ unit, path, status, change, tests, bindings,
 *  citations }] (the per-contract report), stops }. */
export function review({ base, head, files = null }) {
  const changed = files ?? (git(['diff', '--name-only', '--diff-filter=AMDR', base, head, '--', '*.sir', '**/oracles/*.json']) ?? '').split('\n').filter(Boolean);
  const sirChanged = changed.filter((f) => f.endsWith('.sir'));
  const primaries = new Set(), langOnly = [];
  for (const f of changed.filter((x) => x.endsWith('.json'))) { const root = dirname(dirname(f)); const unit = basename(f).split('.')[0]; const p = posix.join(root, 'sir', `${unit}.sir`); if (at(head, p) !== null) primaries.add(p); }
  for (const f of sirChanged) { const m = basename(f).match(FAMILY_FILE); if (m) { const p = posix.join(dirname(f), `${m[1]}.sir`); if (!sirChanged.includes(p)) langOnly.push(f); } else primaries.add(f); }
  const blocks = [], inline = [], oracleNotes = [], findings = [], units = []; let stops = 0;
  const plain = (s) => s.replace(/<[^>]+>/g, '');
  for (const path of primaries) {
    const before = at(base, path), after = at(head, path); const unit = basename(path, '.sir'); const root = basename(dirname(path)) === 'sir' ? dirname(dirname(path)) : dirname(path);
    if (after === null) { blocks.push(`### \`${path}\` · removed\nThe contract for \`${unit}\` is deleted in this PR.`); units.push({ unit, path, status: 'pass', change: 'contract removed', tests: '–', bindings: '–', citations: '–' }); continue; }
    const langs = (git(['ls-tree', '--name-only', head, dirname(path) + '/']) ?? '').split('\n').map((f) => basename(f).match(FAMILY_FILE)).filter((m) => m && m[1] === unit).map((m) => ({ lang: m[2], path: posix.join(dirname(path), m[0]) }));
    if (before === null) {   // a new contract: where its tests came from, whether they still hash, and its language files' bindings
      const rel = after.match(/^ORACLE\b.*?->\s*(\S+)/m)?.[1]; const declared = after.match(/^ORACLE\b.*?CANONICAL-SHA256\s+([0-9a-f]{64})/m)?.[1];
      let o = null; try { o = rel ? JSON.parse(at(head, posix.join(root, rel)) ?? 'null') : null; } catch {}
      let vs = null; try { vs = o ? vectorSetSha(o) : null; } catch {}
      const anchor = after.match(/^ANCHOR\s+(\S+(?:\s+\S+)?)/m)?.[1];
      const checks = [o ? (vs && vs === o.canonicalSha256 && vs === declared ? `✅ ${o.frozen.length + o.heldout.length} tests (${o.heldout.length} hidden from the builders)${o.anchor ? `, captured from ${esc(o.anchor)}` : ''}; the fingerprint the contract declares matches the file.` : '🛑 The test file does not match the fingerprint the contract declares.') : '⚠️ No test file: nothing checks this contract yet.',
        ...langs.map((l) => { const t = at(head, l.path); const b = t === null ? 'missing' : bindingOf(t, after).status; return `${b === 'ok' ? '✅' : '🛑'} ${l.lang} file ${b === 'ok' ? 'bound to this contract' : b}.`; })];
      stops += checks.filter((c) => c.startsWith('🛑')).length;
      for (const c of checks.filter((x) => x.startsWith('🛑'))) findings.push({ level: 'error', path, line: 1, title: `${unit}: new contract`, message: plain(c.slice(3)) });
      units.push({ unit, path, status: checks.some((c) => c.startsWith('🛑')) ? 'fail' : 'pass', change: 'new contract', tests: o ? (vs === o.canonicalSha256 && vs === declared ? `✓ ${o.frozen.length + o.heldout.length}${o.anchor ? ` from ${o.anchor.split(/\s+/)[0]}` : ''}` : '✗ fingerprint mismatch') : '– none',
        bindings: langs.length ? langs.map((l) => { const t = at(head, l.path); return `${l.lang} ${t !== null && bindingOf(t, after).status === 'ok' ? '✓' : '✗'}`; }).join(' ') : '–', citations: '✓' });
      blocks.push(`### \`${path}\` · new contract${anchor ? ` · anchored to ${esc(anchor)}` : ''}\n${checks.map((c) => `> ${c}`).join('\n>\n')}\n\n${readable(explain(after))}`); continue; }
    const oracleRel = after.match(/^ORACLE\b.*?->\s*(\S+)/m)?.[1]; const op = oracleRel ? posix.join(root, oracleRel) : null;
    const oracleChanged = op ? at(base, op) !== at(head, op) : null;
    const stale = langs.filter((l) => { const t = at(head, l.path); return t !== null && bindingOf(t, after).status !== 'ok'; }).map((l) => l.lang);
    const d = explainDiff(before, after, { oracleChanged, langs: stale });   // only the files this PR left bound to the old version
    const od = oracleChanged ? oracleDiff(at(base, op) ?? '', at(head, op) ?? '') : null;
    const anchorOf = (t) => t.match(/^ANCHOR\s+(.*)$/m)?.[1] ?? null; const pkgFidelity = /^FIDELITY\s+package\b/m.test(before);
    if (od && od.rewritten.length && pkgFidelity && anchorOf(before) === anchorOf(after)) {
      const src = (anchorOf(after) ?? 'the original package').split(/\s+/)[0]; const hid = od.rewritten.filter((x) => x.hidden).length;
      d.warnings.unshift({ level: 'stop', text: `${od.rewritten.length} existing test answer${od.rewritten.length > 1 ? 's were' : ' was'} rewritten${hid ? ` (${hid} of them hidden from the builders)` : ''}. These answers were captured by running ${src}, and the contract still says to match ${src} exactly. Running it again gives back the old answer, so the new one came from the author, not the package. The gate passes because the test now agrees with the change it is supposed to check.` });
    }
    if (od && od.rewritten.length && pkgFidelity && anchorOf(before) === anchorOf(after)) d.warnings[0].kind = 'rewritten';
    if (od && od.after !== 'ok') { d.warnings.unshift({ level: 'stop', kind: 'oracle-unreadable', text: `After this PR the test file ${op} is ${od.after === 'unparseable' ? 'not valid JSON' : od.after === 'malformed-cases' ? 'not a valid oracle (some cases are not maps)' : od.after === 'too-deep' ? 'nested too deep to compare (over 2000 levels)' : 'not an oracle (no frozen and heldout lists)'}: nothing can check this contract.` }); findings.push({ level: 'error', path: op, title: `${unit}: test file unreadable`, message: d.warnings[0].text }); }
    if (!d.changes.length && !(od && (od.added.length || od.removed.length || od.rewritten.length || od.inputsChanged.length || od.moved.length || od.otherChanged.length || od.fileChanged.length || od.reordered || od.after !== 'ok'))) { blocks.push(`### \`${path}\`\nFormatting only: nothing a reader or a test can see changed.`); units.push({ unit, path, status: 'pass', change: 'formatting only', tests: '✓ unchanged', bindings: '✓', citations: '✓' }); continue; }
    stops += d.warnings.filter((w) => w.level === 'stop').length;
    if (od && od.rewritten.length && pkgFidelity && anchorOf(before) === anchorOf(after)) oracleNotes.push([op, od.rewritten, (anchorOf(after) ?? 'the original package').split(/\s+/)[0]]);
    const icon = { stop: '🛑 **Stop.**', note: '⚠️ **Heads up.**', ok: '✅' };
    const warn = d.warnings.map((w) => `> ${icon[w.level]} ${esc(w.text)}`).join('\n>\n');
    const staleLine = stale.length ? `\n\n> 🔗 In this PR, the ${stale.join(', ')} file${stale.length > 1 ? 's are' : ' is'} still bound to the old contract (STALE): \`rdv check\` refuses ${stale.length > 1 ? 'them' : 'it'} until re-bound.` : '';
    const rows = d.changes.map((c) => `#### ${esc(c.label)} · ${c.kind} · ${chip(c.checked)}\n${c.diff ? words(c.diff) : (c.kind === 'removed' ? `<del>${esc(c.text)}</del>` : `<ins><b>${esc(c.text)}</b></ins>`)}${c.whyDiff ? `\n\n<sub>Why: ${words(c.whyDiff)}</sub>` : ''}`).join('\n\n');
    const t = od ? [...od.rewritten.map((x) => `- ${x.hidden ? '🙈 Hidden' : '👀 Visible'} test \`${x.name}\`: for input ${esc(x.input)}, the expected answer was **rewritten** from <del>${esc(x.from)}</del> to <ins><b>${esc(x.to)}</b></ins>`),
      ...od.inputsChanged.map((x) => `- ${x.hidden ? '🙈 Hidden' : '👀 Visible'} test \`${x.name}\`: its input changed from ${esc(x.from)} to ${esc(x.to)}`),
      ...od.otherChanged.map((x) => `- Test \`${esc(x.name)}\`: its ${x.keys.map((k) => `\`${esc(k)}\``).join(', ')} changed`),
      ...od.fileChanged.map((k) => `- The test file's \`${esc(k)}\` changed${k === 'encoding' ? ': this changes what every value means' : ''}`),
      ...(od.reordered ? ['- The order of the tests changed.'] : []),
      ...od.moved.map((x) => `- Test \`${x.name}\` moved from the ${x.from} set to the ${x.to} set${x.to === 'visible' ? ': the builders can now see it' : ''}`),
      ...od.added.map((x) => `- New ${x.hidden ? 'hidden' : 'visible'} test \`${x.name}\`: ${esc(x.input)} → ${esc(x.to)}`),
      ...od.removed.map((x) => `- Removed ${x.hidden ? 'hidden' : 'visible'} test \`${x.name}\`: ${esc(x.input)} → ${esc(x.to)}`)] : [];
    const tests = od ? `#### Tests · \`${op}\`\n${t.length ? t.join('\n') : 'Re-hashed only: no case changed.'}` : '';
    blocks.push(`### \`${path}\` · unit \`${d.unit}\`\n${warn}${staleLine}\n\n${rows}${tests ? '\n\n' + tests : ''}\n\n<details><summary>Read the whole contract in plain English (after this PR)</summary>\n\n${readable(explain(after))}\n</details>`);
    // inline notes: each changed TESTED part, on the first line of it this PR touched
    const lines = changedLines(base, head, path), sp = spans(after); const testsMoved = oracleChanged !== false;
    const e = explain(after); const gl = gitLine(after); const lineOf = new Map(e.sections.flatMap((s) => s.items.map((it) => [`${s.title}|${it.id}`, gl(it.line)])));
    for (const c of d.changes.filter((x) => x.checked && x.kind !== 'removed')) {
      const start = lineOf.get(`${c.section}|${c.id}`); if (!start) continue; const end = sp.get(start) ?? start;
      let line = null; for (let i = start; i <= end; i++) if (lines.has(i)) { line = i; break; } if (!line) continue;
      inline.push({ path, line, body: `${NOTE}\n**${esc(c.label)}** changed · ${chip(true)}${testsMoved ? '' : '\n\n🛑 **No test changed in this PR.** The hidden tests still expect the old behavior, so nothing proves this one.'}\n\n${c.diff ? words(c.diff) : esc(c.text)}${stale.length ? `\n\n🔗 Still bound to the old version: ${stale.join(', ')}.` : ''}` });
      findings.push(testsMoved ? { level: 'notice', path, line, title: `${unit}: ${c.label} changed`, message: plain(c.diff ? c.diff.filter((p) => p.op !== '-').map((p) => p.text).join('') : c.text) }
        : { level: 'error', path, line, title: `${unit}: ${c.label} changed, no test did`, message: 'The hidden tests still expect the old behavior, so nothing in this PR proves the new one.' });
    }
    const first = inline.find((x) => x.path === path)?.line;
    for (const w of d.warnings.filter((x) => x.kind === 'citation')) findings.push({ level: 'error', path, ...(first ? { line: first } : {}), title: `${unit}: contradicts its own citation`, message: w.text });
    if (stale.length) findings.push({ level: 'warning', path, title: `${unit}: language files left on the old contract`, message: `${stale.join(', ')} still bound to the old version (STALE): rdv check refuses them until re-bound.` });
    const tested = d.changes.filter((c) => c.checked);
    units.push({ unit, path, status: d.warnings.some((w) => w.level === 'stop') ? 'fail' : 'pass', change: tested.length ? tested.map((c) => c.label).join(', ') : d.changes.length ? 'prose only' : 'tests only',
      tests: od ? (od.after !== 'ok' ? '✗ unreadable' : od.rewritten.length ? `✗ ${od.rewritten.length} answer${od.rewritten.length > 1 ? 's' : ''} rewritten` : `✓ ${[od.added.length && `${od.added.length} added`, od.removed.length && `${od.removed.length} removed`].filter(Boolean).join(', ') || 're-hashed'}`) : tested.length ? '✗ unchanged' : '✓ unchanged',
      bindings: stale.length ? `✗ ${stale.join(', ')} stale` : '✓', citations: d.warnings.some((w) => w.kind === 'citation') ? '✗ contradicted' : '✓' });
  }
  for (const [op, cases, src] of oracleNotes) { const lines = changedLines(base, head, op); const text = (at(head, op) ?? '').split('\n');
    for (const x of cases) { const at0 = text.findIndex((l) => l.includes(`"name": "${x.name}"`)); if (at0 < 0) continue;
      let line = null; for (let i = at0 + 1; i <= Math.min(text.length, at0 + 60); i++) if (lines.has(i)) { line = i; break; } if (!line) continue;
      findings.push({ level: 'error', path: op, line, title: `${x.hidden ? 'Hidden' : 'Visible'} test ${x.name}: answer rewritten`, message: `For input ${x.input} it expected ${x.from}, captured from ${src}. Now it expects ${x.to}. ${src} still gives the old answer.` });
      inline.push({ path: op, line, body: `${NOTE}\n${x.hidden ? '🙈 **Hidden test' : '👀 **Visible test'} \`${x.name}\`: answer rewritten.** For input ${esc(x.input)} it expected <del>${esc(x.from)}</del>, captured from ${src}. Now it expects <ins><b>${esc(x.to)}</b></ins>.\n\n🛑 ${src} still gives the old answer. Edit the contract's anchor (or add a new unit) instead of the test.` }); } }
  for (const f of langOnly) { const t = at(head, f), m = basename(f).match(FAMILY_FILE); const p = at(head, posix.join(dirname(f), `${m[1]}.sir`));
    const b = t === null ? null : p === null ? { status: 'no-primary' } : bindingOf(t, p);
    blocks.push(`### \`${f}\` · ${m[2]} language file\n${t === null ? 'Removed.' : b.status === 'ok' ? 'Changed. Still bound to the current primary.' : `🛑 Changed, and its binding is **${b.status}**: \`rdv check\` refuses it until it is re-bound.`}`);
    const bad = t !== null && b.status !== 'ok'; if (bad) { stops++; findings.push({ level: 'error', path: f, title: `${m[1]}: ${m[2]} file ${b.status}`, message: `Changed, and its binding is ${b.status}: rdv check refuses it until it is re-bound.` }); }
    units.push({ unit: m[1], path: f, status: bad ? 'fail' : 'pass', change: t === null ? `${m[2]} file removed` : `${m[2]} file only`, tests: '–', bindings: t === null ? '–' : `${m[2]} ${bad ? '✗ ' + b.status : '✓'}`, citations: '–' }); }
  const head1 = stops ? `🛑 **${stops} problem${stops > 1 ? 's' : ''} to read before approving.**` : changed.length ? '✅ **Nothing to stop on.** Plain-English review of the contract changes in this PR.' : 'No SIR contract changed in this PR.';
  const body = `${MARKER}\n## SIR review\n${head1}\n\n${blocks.join('\n\n---\n\n')}\n\n<sub>Generated from the .sir files by rederive (no AI): every line is the contract's own text or a fixed phrase. 🧪 tested = held by the hidden tests · 📝 note = prose nobody grades.</sub>`;
  return { body, inline, findings, units, stops };
}
function readable(e) {
  return [e.summary.map((s) => `- ${esc(s)}`).join('\n'), ...e.sections.map((s) => `**${esc(s.title)}** · ${chip(s.checked)}\n${s.items.map((it) => `- ${it.label ? `*${esc(it.label)}:* ` : ''}${esc(it.text)}${it.why.length ? ` <sub>(why: ${esc(it.why.join('; '))})</sub>` : ''}`).join('\n')}`)].join('\n\n');
}

// ---- GitHub: the sticky comment and the inline notes (replaced on every run, so a push never stacks duplicates) --------
async function gh(method, url, body) {
  const r = await fetch(`https://api.github.com${url}`, { method, headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${await r.text()}`); return r.status === 204 ? null : r.json();
}
const all = async (url) => { const out = []; for (let p = 1; ; p++) { const page = await gh('GET', `${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${p}`); out.push(...page); if (page.length < 100) return out; } };
/** The GitHub Action: comment, line notes, annotations, the job summary; → the exit code (1 = a Stop, unless failOn is 'never'). */
export async function run({ failOn = 'stop', comment = true, notes = true } = {}) {
  const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')); const pr = ev.pull_request; const repo = process.env.GITHUB_REPOSITORY;
  if (!pr) { console.log('sir-review: not a pull_request event; nothing to review'); return 0; }
  const r = review({ base: pr.base.sha, head: pr.head.sha }); const { body, inline } = r;
  if (r.findings.length) console.log(annotations(r.findings));
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary(r), { flag: 'a' });
  if (!comment) return r.stops && failOn === 'stop' ? 1 : 0;
  const mine = (await all(`/repos/${repo}/issues/${pr.number}/comments`)).find((c) => c.body?.startsWith(MARKER));
  if (mine) await gh('PATCH', `/repos/${repo}/issues/comments/${mine.id}`, { body }); else await gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body });
  for (const c of (await all(`/repos/${repo}/pulls/${pr.number}/comments`)).filter((c) => c.body?.startsWith(NOTE))) await gh('DELETE', `/repos/${repo}/pulls/comments/${c.id}`);
  if (notes && inline.length) await gh('POST', `/repos/${repo}/pulls/${pr.number}/reviews`, { commit_id: pr.head.sha, event: 'COMMENT', comments: inline.map((c) => ({ path: c.path, line: c.line, side: 'RIGHT', body: c.body })) });
  console.log(`sir-review: comment ${mine ? 'updated' : 'posted'}, ${notes ? inline.length : 0} line note(s), ${r.stops} stop(s)`);
  return r.stops && failOn === 'stop' ? 1 : 0;
}
