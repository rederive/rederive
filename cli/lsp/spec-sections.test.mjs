// The hover links must land on real SIR_SCHEMA headings. Reads the schema from SIR_SPEC or a sibling checkout (../sir-spec),
// and SKIPS — loudly — without one. Run: node --test cli/lsp/spec-sections.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SECTIONS, sectionsOf, linkSections, SPEC_URL } from './spec-sections.mjs';

const spec = process.env.SIR_SPEC || new URL('../../../sir-spec/SIR_SCHEMA.md', import.meta.url).pathname;

test('SECTIONS is exactly the schema\'s numbered headings', { skip: !existsSync(spec) && `no sir-spec checkout at ${spec} (set SIR_SPEC)` }, () => {
  assert.deepEqual(Object.fromEntries(Object.entries(SECTIONS).map(([k, v]) => [String(k), v])), sectionsOf(readFileSync(spec, 'utf8')));
});

test('linkSections links known sections and leaves unknown ones as text', () => {
  assert.equal(linkSections('see §12x'), `see [§12x](${SPEC_URL}#${SECTIONS['12x']})`);
  assert.equal(linkSections('§99 stays'), '§99 stays');
  assert.ok(linkSections('§23a rule 3').startsWith('[§23a]('));
});
