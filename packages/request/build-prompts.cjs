// Build re-emit prompts for @rederive/request units from spec + FROZEN oracle (plain-JS emits).
// Mirrors rdv resynth prepare, but targets .js and instructs "no TypeScript". Run:
//   node packages/request/build-prompts.cjs
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const N = 3;
const UNITS = [
  { name: 'paramsHaveRequestBody', sig: '(params) => any' },
  { name: 'toBase64', sig: '(str) => string' },
];
for (const u of UNITS) {
  const spec = fs.readFileSync(path.join(DIR, 'specs', u.name + '.md'), 'utf8').trim();
  const oracle = JSON.parse(fs.readFileSync(path.join(DIR, 'oracles', u.name + '.json'), 'utf8'));
  const worked = oracle.vectors
    .map((v) => `  ${u.name}(${(v.args || []).map((a) => JSON.stringify(a)).join(', ')}) -> ${'expected' in v ? JSON.stringify(v.expected) : 'undefined'}`)
    .join('\n');
  const rdir = path.join(DIR, '.resynth', u.name);
  fs.mkdirSync(rdir, { recursive: true });
  for (let k = 1; k <= N; k++) {
    const outAbs = path.join(rdir, `emit_${k}.js`);
    const prompt = `Unit \`${u.name}\`  signature: ${u.sig}

Spec:
${spec}

Reconstruct an implementation from the spec + the FROZEN ORACLE below (worked input->output;
authoritative — reproduce quirks EXACTLY, including value-returns and undefined). You will be scored
on FRESH held-out inputs you cannot see.

FROZEN ORACLE:
${worked}

Write PLAIN JavaScript as an ES module — NO TypeScript, NO type annotations. Export \`${u.name}\`.
The original source is NOT available and you must NOT look for it (this is an original-deleted re-emit).
Write a self-contained module to EXACTLY: ${outAbs}
Then report the path and byte size.`;
    fs.writeFileSync(path.join(rdir, `prompt_${k}.txt`), prompt);
  }
}
console.log('wrote prompts for: ' + UNITS.map((u) => u.name).join(', '));
