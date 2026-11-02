import { readFileSync } from 'node:fs';
// SIR_SCHEMA's numbered sections → their GitHub anchors, so an editor hover can link `§12` to the spec. Generated from the
// schema's `## <n>. …` headings by slug() below; spec-sections.test.mjs compares it with a sir-spec checkout (SIR_SPEC or
// ../sir-spec) and SKIPS — loudly — without one. Regenerate: node cli/lsp/spec-sections.mjs <path/to/SIR_SCHEMA.md>
export const SPEC_URL = 'https://github.com/rederive/sir-spec/blob/main/SIR_SCHEMA.md';
// GitHub's heading anchor: lowercase, drop every character that is not a letter, digit, `_`, `-` or space, spaces → `-`
export const slug = (heading) => heading.toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-');
export const sectionsOf = (schema) => Object.fromEntries([...schema.matchAll(/^## ((\d+[a-z]?)\.\s.*)$/gm)].map(([, h, n]) => [n, slug(h)]));
export const SECTIONS = {
  0: '0-the-invariants-unchanged-restated-as-frozen', 1: '1-common-header-every-unit',
  2: '2-decision-1--loop-accumulator-unit-level-state-only', 3: '3-decision-2--emitinject-duality-emit-may-bind-a-result',
  4: '4-decision-3--on-error-is-a-branch-not-a-kind', 5: '5-decision-4--traces-are-ordered-par-is-an-explicit-unordered-window',
  6: '6-decision-5--off-path-units-are-kept-marked-reach', 7: '7-decision-6--boundary-descriptors-are-domainverb-two-levels',
  8: '8-forced-addition-1--trigger-is-metadata-never-structure',
  9: '9-forced-addition-2--opaque-dependencies-must-be-named-the-parse_to_uint32array-lesson',
  10: '10-forced-addition-3--frozen-oracle-bundle-contract', 11: '11-forced-addition-4--kind-state-earns-kindhood-the-result-post-observable',
  12: '12-forced-addition-5--fidelity-variants-package-anchored-vs-spec-anchored',
  13: '13-forced-addition-6--decision-table-fidelity-verify-every-cell-against-the-original',
  14: '14-bundle-contract-v02--specversion--variants',
  15: '15-forced-addition-7--oracle-class--trace-seam-an-effect-unit-declares-its-injectable-boundary',
  16: '16-forced-addition-8--seam-export-shape-adapters-for-non-callable-exports',
  17: '17-forced-addition-9--envelope-the-verified-input-scope-is-part-of-the-contract',
  18: '18-forced-addition-10--carried-data-byte-exact-extraction--an-independent-authority',
  19: '19-par-verification-semantics--validated-closes-the-5-flag', 20: '20-the-scheduler-is-a-control-effect--timer-races-verify-on-virtual-time',
  21: '21-the-resource-lifecycle-oracle-channel', 22: '22-ring--token-coordinated-concurrency-reduces-to-a-deterministic-schedule',
  '23a': '23a-the-practiced-vocabulary-frozen', '23b': '23b-primary--per-language-files-forced-addition-11',
  '23c': '23c-how-a-verifier-calls-and-judges-an-artifact-revision-2026-10-28',
  '10x': '10x-extension-v05-the-language-neutral-vector-encoding-sir-canonical-v1', '12x': '12x-extension-v05-cross-language-anchors',
};
/** `§12`, `§23a rule 3`, `§2, §11` in a meaning → markdown links into the schema (an unknown section stays plain text). */
export const linkSections = (md) => md.replace(/§(\d+[a-z]?)/g, (all, n) => (SECTIONS[n] ? `[${all}](${SPEC_URL}#${SECTIONS[n]})` : all));
if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(sectionsOf(readFileSync(process.argv[2], 'utf8')), null, 1));
