// SIR_SCHEMA §23a must be the parser's directive table, row for row. The schema lives in the sir-spec repo; this test
// reads it from SIR_SPEC (a path to SIR_SCHEMA.md) or a sibling checkout (../sir-spec), and SKIPS — loudly — without one.
// Run: node --test cli/sir/directive-table.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DIRECTIVES } from './sir-parse.mjs';
import { MEANINGS, table } from './directive-table.mjs';

const spec = process.env.SIR_SPEC || new URL('../../../sir-spec/SIR_SCHEMA.md', import.meta.url).pathname;

test('every directive the parser knows has a meaning, and nothing else does', () => {
  assert.deepEqual(Object.keys(MEANINGS).sort(), Object.keys(DIRECTIVES).sort());
});

test('SIR_SCHEMA §23a carries exactly the generated table', { skip: !existsSync(spec) && `no sir-spec checkout at ${spec} (set SIR_SPEC)` }, () => {
  const s = readFileSync(spec, 'utf8');
  const start = s.indexOf('## 23a.'), end = s.indexOf('\n## ', start + 1);
  assert.ok(start >= 0, '§23a not found');
  assert.ok(s.slice(start, end).includes(table()), '§23a table differs from `node cli/sir/directive-table.mjs` — regenerate it');
});
