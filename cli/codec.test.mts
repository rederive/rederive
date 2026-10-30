// The legacy codec's in-band markers (selfhost Tier 1 #18 #26 #31): a user's map carrying __t / __throw / __threw is escaped
// as {__t:'obj', v}, own keys only — and rdv compares LIKE WITH LIKE (the expected value decoded, then both sides encoded).
// Run: npx tsx --test cli/codec.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revive, vectorPass, eq } from './verdict.mts';

test('a tag-shaped user map round-trips as a map, never as a tag or a throw', () => {
  const stored = { __t: 'obj', v: { __t: 'num', v: '1' } };              // what the factory codec writes for the user map {__t:'num', v:'1'}
  assert.ok(eq({ __t: 'num', v: '1' }, stored), 'an artifact returning that map passes');
  assert.ok(!eq(1, stored), 'and the NUMBER 1 does not');
  // the codec writes a num tag only for NaN / ±Infinity / -0: any other spelling is a malformed oracle and THROWS (selfhost #55),
  // never a second spelling of 1
  assert.throws(() => eq(1, { __t: 'num', v: '1' }), /#55/);
  assert.throws(() => eq(1, { __t: 'num', v: '1e999' }), /#55/);
  assert.throws(() => revive({ __t: 'obj', v: [1] }), /plain map/);
  assert.ok(Object.is(revive({ __t: 'num', v: '-0' }), -0), 'a real num tag still means its number');
  assert.ok(!eq(-0, { __t: 'obj', v: { __t: 'num', v: '-0' } }), '-0 is not the user map {__t:"num", v:"-0"}');
  assert.ok(vectorPass({ __throw: 'boom' }, { __throw: 'other message' }), 'a real throw still matches a throw (message not graded)');
  assert.ok(!vectorPass({ __throw: 'x' }, 7), 'a throw does not match a value');
});

test('an own "__proto__" key is a key, never the prototype', () => {
  const r = revive(JSON.parse('{"__proto__": 5, "a": 1}'));
  assert.ok(Object.hasOwn(r, '__proto__') && r.__proto__ === 5 && Object.getPrototypeOf(r) === Object.prototype);
  const nested = revive({ __t: 'obj', v: JSON.parse('{"__proto__": {"x": 1}}') });
  assert.ok(Object.hasOwn(nested, '__proto__'));
});
