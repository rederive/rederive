// Compare pinned escapeProperty (rederive@c41c5fcd84e0 cli/lsp/pr-review.mjs) with @actions/core@3.0.1's property escaping,
// captured through the PUBLIC surface: core.error('m', { title: v }) with process.stdout.write intercepted.
import * as core from './node_modules/@actions/core/lib/core.js';
import { genInputs } from '../sir/escape_property.inputs.mjs';
const { escapeProperty } = await import('../../../.authority/c41c5fcd84e0/cli/lsp/pr-review.mjs');
function anchor(v) {
  let line = ''; const w = process.stdout.write; process.stdout.write = (s) => { line += s; return true; };
  try { core.error('m', { title: v }); } catch (e) { process.stdout.write = w; return { throw: e.message }; }
  process.stdout.write = w;
  const m = line.match(/^::error ?(?:title=([^]*?))?::m\r?\n$/); if (!m) return { raw: line };
  return m[1] === undefined ? { omitted: true } : { v: m[1] };
}
const real = (v) => { try { return { v: escapeProperty(v) }; } catch (e) { return { throw: e.message }; } };
const rnd = ((a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(7);
const probes = ['%', '\r', '\n', '\r\n', ':', ',', '::', '=', 'é', '日', '\u{1F600}', '\ud800', '\udfff', '%3A', 'a=b,c:d\r\n%'].map((s) => [s]);
const all = [...genInputs(20000, rnd), ...probes];
// the rule the SIR states (R1): per-code-unit map, others copied
const MAP = { '%': '%25', '\r': '%0D', '\n': '%0A', ':': '%3A', ',': '%2C' };
const rule = (s) => { let o = ''; for (let i = 0; i < s.length; i++) o += MAP[s[i]] ?? s[i]; return o; };
let text = 0, textAgree = 0, ruleAgree = 0, ruleText = 0; const diffs = [];
for (const [v] of all) {
  const r = real(v), a = anchor(v);
  if (typeof v === 'string') { text++; ruleText++; if (r.v === rule(v)) ruleAgree++;
    const av = a.omitted ? '' : a.v; if (r.v === av) textAgree++; else diffs.push({ v, r, a }); }
  else { const av = a.omitted ? '(omitted)' : a.v ?? `throw:${a.throw}`; const rv = r.v ?? `throw:${r.throw}`;
    if (av !== rv) diffs.push({ kind: Object.prototype.toString.call(v), v: String((() => { try { return JSON.stringify(v, (k, x) => typeof x === 'bigint' ? x + 'n' : x); } catch { return '?'; } })()), real: rv, anchor: av }); }
}
console.log(`text inputs: ${text}, pinned == anchor: ${textAgree}; pinned == R1 rule: ${ruleAgree}/${ruleText}`);
console.log(`non-text inputs: ${all.length - text}, disagreements: ${diffs.length}`);
for (const d of diffs.filter((d) => typeof d.v === "string" && !d.kind).slice(0, 5)) console.log("TEXT", JSON.stringify(d));
const seen = new Set(); for (const d of diffs) { const k = d.kind + '|' + String(d.real).slice(0, 3); if (seen.has(k)) continue; seen.add(k); console.log(JSON.stringify(d)); }
