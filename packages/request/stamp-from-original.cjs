// Stamp @rederive/request oracles by EXECUTING the real request@2.88.2 helpers (differential capture).
// The original IS the oracle. Inputs are authored; every `expected` is produced by running the real
// function. Run once against an installed original:
//   npm i request   &&   node packages/request/stamp-from-original.cjs <path-to>/request/lib/helpers.js
const fs = require('fs');
const path = require('path');
const ORIG = process.argv[2] || '/tmp/reqorig/node_modules/request/lib/helpers.js';
const h = require(ORIG);

const stamp = (fn, list) => list.map((it) => {
  let expected;
  try { expected = fn(...it.args); } catch (e) { expected = { __throw: String((e && e.message) || e) }; }
  return { name: it.name, args: it.args, expected };
});

const INPUTS = {
  paramsHaveRequestBody: {
    fn: h.paramsHaveRequestBody,
    frozen: [
      { name: 'has_body', args: [{ body: 'hello' }] },
      { name: 'empty', args: [{}] },
      { name: 'stream', args: [{ requestBodyStream: 's' }] },
      { name: 'json_bool_true', args: [{ json: true }] },
      { name: 'json_object', args: [{ json: { a: 1 } }] },
      { name: 'multipart', args: [{ multipart: [{ body: 'x' }] }] },
    ],
    heldout: [
      { name: 'ho_body_zero', args: [{ body: 0 }] },
      { name: 'ho_body_empty', args: [{ body: '' }] },
      { name: 'ho_json_false', args: [{ json: false }] },
      { name: 'ho_json_string', args: [{ json: 'str' }] },
      { name: 'ho_multipart_empty', args: [{ multipart: [] }] },
      { name: 'ho_body_wins', args: [{ body: 'b', json: { x: 1 } }] },
      { name: 'ho_json_zero', args: [{ json: 0 }] },
    ],
  },
  toBase64: {
    fn: h.toBase64,
    frozen: [
      { name: 'hello', args: ['hello'] },
      { name: 'user_pass', args: ['user:pass'] },
      { name: 'empty', args: [''] },
      { name: 'null', args: [null] },
    ],
    heldout: [
      { name: 'ho_undefined', args: [] },
      { name: 'ho_unicode', args: ['café ☕'] },
      { name: 'ho_colons', args: ['a:b:c'] },
      { name: 'ho_space', args: ['hello world'] },
      { name: 'ho_zerostr', args: ['0'] },
    ],
  },
};

fs.mkdirSync(path.join(__dirname, 'oracles'), { recursive: true });
for (const [unit, spec] of Object.entries(INPUTS)) {
  const oracle = { mode: 'vectors', exportName: unit, unit, vectors: stamp(spec.fn, spec.frozen), heldout: stamp(spec.fn, spec.heldout) };
  fs.writeFileSync(path.join(__dirname, 'oracles', unit + '.json'), JSON.stringify(oracle, null, 2) + '\n');
}
const ver = require(path.join(path.dirname(ORIG), '..', 'package.json')).version;
console.log('stamped @rederive/request oracles from real request@' + ver);
