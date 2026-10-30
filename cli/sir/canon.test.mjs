// canonicalString's DOMAIN (fixed 2026-10-26, found by selfhost/units/canonical_string): a canonical tree only. Out of
// domain THROWS instead of rendering something no other language could reproduce. Run: node --test cli/sir/canon.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalString, encode } from './canon.mjs';

test('in domain: strings, booleans, arrays, plain maps; t-tags reduce; keys sort by UTF-16 code units', () => {
  assert.equal(canonicalString({ t: 'f64', v: '1', bits: '3ff0000000000000' }), '{"bits":"3ff0000000000000","t":"f64"}');
  assert.equal(canonicalString({ t: 'throw', msg: 'x' }), '{"t":"throw"}');
  assert.equal(canonicalString([true, 'a ', { b: false, a: [] }]), '[true,"a ",{"a":[],"b":false}]');
  assert.equal(canonicalString({ '\u{1F600}': true, '': true }), '{"\u{1F600}":true,"":true}', 'astral (D83D…) sorts before U+E000 in UTF-16');
});

test('out of domain THROWS (each of these used to render)', () => {
  for (const [x, why] of [[{ t: 'f64' }, /16-hex bits/], [{ t: 'f64', bits: 'NaN' }, /16-hex bits/], [NaN, /number/], [-0, /number/], [1, /number/],
    [null, /null/], [undefined, /undefined/], [[1, , 2], /hole/], [new Map(), /Map/], [10n, /bigint/], [{ a: undefined }, /undefined/]])
    assert.throws(() => canonicalString(x), why, String(x));
});

test('the json encoder rejects a lone-surrogate map KEY, as it already did a lone-surrogate value', () => {
  assert.throws(() => encode({ '\ud800': 1 }, { k: 'json' }), /lone surrogate/);
  assert.throws(() => encode('\ud800', { k: 'json' }), /lone surrogate/);
});

// ---- Tier 1 strictness (rederive's self re-derivation, 2026-10-26; selfhost/FINDINGS.md #2 #4 #16 #20 #24 #29) ----
import { parseType, parseSig, decode, f64fromBits } from './canon.mjs';

test('#16/#20 one strict grammar: what the old splitter silently accepted now throws', () => {
  for (const t of ['record[text]', 'record[a]: text]', 'list[text, i64]', 'list[]', 'map[text]', 'text || none', 'text |', 'tuple[]', 'record[a: text, a: i64]', 'Text', '\u0085text'])
    assert.throws(() => parseType(t), undefined, t);
  assert.deepEqual(parseType('list [text]'), parseType('list[text]'), 'round 2 (#44): one whitespace rule — space between a keyword and [ is grammar whitespace');
  assert.deepEqual(parseType(' list[ text | none ] '), { k: 'list', item: { k: 'union', alts: [{ k: 'text' }, { k: 'none' }] } });
  assert.deepEqual(parseType('record[a: i64, b_2: map[text, json]]'), { k: 'record', fields: [['a', { k: 'i64' }], ['b_2', { k: 'map', key: { k: 'text' }, val: { k: 'json' } }]] });
  for (const s of ['f(text) -> i64', 'f(a: text, # note\n b: i64) -> text', 'f(a: text, g) -> x(b: i64) -> i64', 'f(: text) -> none', 'f(a: text, a: i64) -> none', '2f(a: text) -> text', 'f(...a: text, b: i64) -> none', 'f(a: text,) -> none'])
    assert.throws(() => parseSig(s), /bad SIG/, s);
  assert.deepEqual(parseSig('pub fn f(a: text, ...rest: json): text | none').args.map((a) => [a.name, !!a.rest]), [['a', false], ['rest', true]]);
});

test('#4 f64fromBits takes exactly 16 lowercase hex digits', () => {
  for (const b of ['ffff3ff0000000000000', '1', '3FF0000000000000', '3ff0000000000000 ', ' 3ff0000000000000', '0b1', 123]) assert.throws(() => f64fromBits(b), /16 lowercase hex/, String(b));
  assert.equal(f64fromBits('3ff0000000000000'), 1);
});

test('#2 legacy num/bigint tags are strict literals', () => {
  for (const v of ['abc', '', ' 1 ', '0x10']) assert.throws(() => encode({ __t: 'num', v }, { k: 'f64' }), /not a number literal/, v);
  assert.equal(encode({ __t: 'num', v: '-0' }, { k: 'f64' }).bits, '8000000000000000');
  for (const v of [' 12 ', '0x10', '1.5']) assert.throws(() => encode({ __t: 'bigint', v }, { k: 'i64' }), /not a decimal integer/, v);
});

test('#29 records and maps take plain objects; fields are own properties', () => {
  assert.throws(() => encode(['x', 'y'], parseType('map[text, text]')), /not map/);
  assert.throws(() => encode(['x'], parseType('record[length: i64]')), /not record/);
  assert.deepEqual(encode({}, parseType('record[constructor: text | none]')).v[0][1], { t: 'none' }, 'an inherited name is absent, not Object.prototype.constructor');
});

test('#24 decode accepts exactly what encode emits', () => {
  for (const [tv, why] of [[{ t: 'bool', v: 'hello' }, /bool v/], [{ t: 'i64', v: ' 12\n' }, /decimal/], [{ t: 'i64', v: '0x1F' }, /decimal/], [{ t: 'u64', v: '-1' }, /out of range/], [{ t: 'i64', v: String(10n ** 23n) }, /out of range/],
    [{ t: 'bytes', v: 'base64:AQID😀AQID' }, /base64/], [{ t: 'map', v: [[{ t: 'f64', v: '0', bits: '0000000000000000' }, { t: 'none' }]] }, /text only/], [{ t: 'map', v: [[{ t: 'text', v: 'a', cu: 'utf8' }]] }, /entry/], [{ t: 'nope' }, /unknown tag/], [null, /node/]])
    assert.throws(() => decode(tv), why, JSON.stringify(tv));
  const o = decode({ t: 'map', v: [[{ t: 'text', v: '__proto__', cu: 'utf8' }, { t: 'bool', v: true }]] });
  assert.ok(Object.hasOwn(o, '__proto__') && Object.getPrototypeOf(o) === Object.prototype, '"__proto__" is an own key, never the prototype');
  assert.equal(decode({ t: 'undefined' }), undefined, 'the js-native tag decodes');
});

test('#28 one map entry order: a typed map and a json map with the same text keys order them identically', () => {
  const keys = (e) => e.v.map(([k]) => k.v); const v = { a: 1, 'a ': 2, 'a!': 3, aA: 4, 'a\n': 5, '\u{1F600}': 6, '': 7 };
  assert.deepEqual(keys(encode(v, parseType('map[text, f64]'))), keys(encode(v, { k: 'json' })));
  assert.deepEqual(keys(encode(v, { k: 'json' })), ['a', 'a\n', 'a ', 'a!', 'aA', '\u{1F600}', ''], 'UTF-16 code units: the astral key (D83D…) before U+E000');
});

// ---- round 2 findings, fixed in round 3 (selfhost/FINDINGS.md). Each case passed the old code.
const node = (t, v, extra = {}) => ({ t, v, ...extra });
test('#34 decode reads ONE text per value: every second spelling throws', () => {
  for (const t of ['i64', 'u64']) assert.throws(() => decode(node(t, '-0')), /canonical tree/, `${t} -0`);
  assert.throws(() => decode(node('bigint', '-0')), /canonical tree/, 'bigint -0 decoded to 0n, so encode∘decode moved it');
  for (const bits of ['7ff0000000000001', 'fff8000000000000', 'fff0000000000001']) assert.throws(() => decode({ t: 'f64', v: 'NaN', bits }), /canonical 7ff8000000000000/, bits);
  assert.ok(Number.isNaN(decode({ t: 'f64', v: 'NaN', bits: '7ff8000000000000' })));
  for (const v of ['base64:AR==', 'base64:AQJ=']) assert.throws(() => decode(node('bytes', v)), /padding bits/, v);
  assert.deepEqual([...decode(node('bytes', 'base64:AQ=='))], [1]);
  assert.throws(() => decode({ t: 'f64', bits: '3ff0000000000000' }), /display v/, 'an f64 node without v');
  assert.throws(() => decode({ t: 'i64', v: '1', x: 1 }), /has only t, v/, 'an extra key on a node');
  assert.throws(() => decode({ t: 'none', v: null }), /has only t/);
  assert.throws(() => decode(node('map', [[node('text', 'a', { cu: 'utf8' }), node('bool', true)], [node('text', 'a', { cu: 'utf8' }), node('bool', false)]])), /repeated map key "a"/);
  assert.throws(() => decode(node('record', [['a', { t: 'none' }], ['a', { t: 'none' }]])), /repeated record field "a"/);
  for (const msg of [undefined, 5]) assert.throws(() => decode({ t: 'throw', ...(msg === undefined ? {} : { msg }) }), /msg as text/, String(msg));
  assert.deepEqual(decode({ t: 'throw', msg: 'boom' }), { __threw: 'boom' });
});
test('#35 the {__t:obj} escape takes a plain map v, else a codec error (never a host TypeError, never a map from a string)', () => {
  for (const v of ['ab', 5, true, [1, 2], null]) assert.throws(() => encode({ __t: 'obj', v }, { k: 'json' }), /obj tag: v must be a plain map/, JSON.stringify(v));
  assert.throws(() => encode({ __t: 'obj' }, { k: 'json' }), /obj tag: v must be a plain map/, 'v missing');
  assert.deepEqual(encode({ __t: 'obj', v: { __t: 'x' } }, parseType('map[text, text]')).v.map(([k, x]) => [k.v, x.v]), [['__t', 'x']], 'a plain-map v unwraps to the user map it escaped');
});
test('#36 the legacy num tag: a finite literal whose value is not -0; the specials keep their own spellings', () => {
  for (const v of ['1e999', '-1e999', '-0.0', '-0e5']) assert.throws(() => encode({ __t: 'num', v }, { k: 'f64' }), /own spelling/, v);
  assert.equal(encode({ __t: 'num', v: 'Infinity' }, { k: 'f64' }).bits, '7ff0000000000000');
  assert.equal(encode({ __t: 'num', v: '1e-7' }, { k: 'f64' }).bits, encode(1e-7, { k: 'f64' }).bits);
  assert.throws(() => encode({ __t: 'bigint', v: '-0' }, { k: 'i64' }), /not a decimal integer/, 'bigint -0: one spelling of 0');
});
test('#38 one plain-object rule and one marker rule across the codec', () => {
  const np = Object.assign(Object.create(null), { a: 1 });
  assert.equal(canonicalString(encode(np, { k: 'json' })), canonicalString(encode({ a: 1 }, { k: 'json' })), 'json takes a null-prototype map, as record and map do');
  assert.equal(canonicalString(encode(np, parseType('map[text, f64]'))), canonicalString(encode({ a: 1 }, parseType('map[text, f64]'))));
  const arr = Object.assign(['x'], { __throw: 'boom' });
  assert.deepEqual(encode(arr, parseType('list[text]')), { t: 'list', v: [{ t: 'text', v: 'x', cu: 'utf8' }] }, 'an array never carries a throw marker');
  assert.equal(encode(Object.assign(Object.create(null), { __threw: 'b' }), { k: 'json' }).t, 'throw', '__throw and __threw read through the same rule');
});
test('#44 parse_sig / parse_type: no duplicate alternative, one whitespace rule, a nesting cap that is a grammar error', () => {
  for (const t of ['none | none', 'text | text', 'list[text | text]', 'record[a: i64 | i64]']) assert.throws(() => parseType(t), /same alternative twice/, t);
  assert.deepEqual(parseType('text | none'), { k: 'union', alts: [{ k: 'text' }, { k: 'none' }] });
  const want = parseSig('pub fn f(a: text) -> text');
  for (const s of ['pub  fn f(a: text) -> text', 'pub\nfn f(a: text) -> text', 'pub fn\nf(a: text) -> text', 'pub\tfn \n f(a: text) -> text']) assert.deepEqual(parseSig(s), want, JSON.stringify(s));
  assert.deepEqual(parseSig('export  default\nfunction f(a: text): text'), want);
  assert.equal(parseSig('pub(fn: text) -> text').name, 'pub', 'keywords are not reserved: a function named pub');
  for (const s of ['pub fn', 'pub fn(a: text) -> text', 'pubfn f(a: text) -> text']) assert.throws(() => parseSig(s), /bad SIG/, s);
  // round 5 (#78): the type cap is 16 — a parsed type must itself be a value the codec (100 levels) carries
  let deep = 'text'; for (let k = 0; k < 17; k++) deep = `list[${deep}]`;
  assert.throws(() => parseType(deep), /nest deeper than 16/);
  let ok = 'text'; for (let k = 0; k < 16; k++) ok = `list[${ok}]`; assert.equal(parseType(ok).k, 'list');
  let huge = 'text'; for (let k = 0; k < 5000; k++) huge = `list[${huge}]`;
  assert.throws(() => parseType(huge), /nest deeper/, 'never the host stack overflow');
});
test('#48 one 16-hex rule: the decoder and the canonical string reject the same bits', () => {
  for (const bits of ['3FF0000000000000', '3ff000000000000', '3ff0000000000000\n']) {
    assert.throws(() => f64fromBits(bits), /16 lowercase hex/);
    assert.throws(() => canonicalString({ t: 'f64', bits }), /16-hex bits/);
  }
});

test('#56 decode: a map whose entries are out of canonical order is a second spelling — refused (encode always sorts)', () => {
  const m = (...keys) => ({ t: 'map', v: keys.map((k) => [encode(k, { k: 'text' }), { t: 'none' }]) });
  assert.deepEqual(Object.keys(decode(m('a', 'b'))), ['a', 'b']);
  assert.throws(() => decode(m('b', 'a')), /out of canonical order/);
  assert.throws(() => decode(m('\uFFFF', '\u{1F600}')), /out of canonical order/, 'UTF-16 order: U+1F600 is D83D DE00, which sorts before FFFF');
  assert.deepEqual(Object.keys(decode(m('\u{1F600}', '\uFFFF'))), ['\u{1F600}', '\uFFFF'], 'the order decode reads is the order encode writes');
});
