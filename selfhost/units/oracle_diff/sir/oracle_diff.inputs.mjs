// oracle_diff input generator: genInputs(n, rnd) -> list of [beforeJson, afterJson] (two texts).
// Curated coverage prefix first (every branch, throw path, display tag and equality quirk found in the code), then a seeded
// random fill of mutations of a base sir-canonical-v1 oracle. Deterministic from rnd().

// ---- tagged-value builders (the sir-canonical-v1 node shapes)
const bitsOf = (x) => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return d.getBigUint64(0).toString(16).padStart(16, '0'); };
const T = (v) => ({ t: 'text', v, cu: 'utf8' });
const F = (x, v) => ({ t: 'f64', v: v ?? (Object.is(x, -0) ? '-0' : String(x)), bits: bitsOf(x) });
const I = (v) => ({ t: 'i64', v: String(v) });
const U = (v) => ({ t: 'u64', v: String(v) });
const B = (v) => ({ t: 'bool', v });
const N = { t: 'none' };
const L = (...v) => ({ t: 'list', v });
const TU = (...v) => ({ t: 'tuple', v });
const M = (...v) => ({ t: 'map', v });
const R = (...v) => ({ t: 'record', v });
const TH = (msg) => ({ t: 'throw', msg });
const BY = (v) => ({ t: 'bytes', v });
const c = (name, args, expected) => ({ name, args, expected });
const J = (o) => JSON.stringify(o);
const ora = (frozen, heldout) => ({ unit: 'x', sig: 'x(a: text) -> json', encoding: 'sir-canonical-v1', frozen, heldout });

// ---- the base oracle
const base = () => ora([
  c('upper', [T('abc')], T('ABC')),
  c('num', [F(1.5)], F(3)),
  c('ctl', [T('\x1b[31mred\x07')], T('a\nb\tc')),
  c('uni', [T('café \u{1F600}  ')], L(T('é'), B(true), N)),
  c('rec', [R(['a', I(1)], ['b c', T('x')])], M([T('k'), U(2)])),
], [
  c('boom', [T('')], TH('bad')),
  c('bytes', [BY('base64:AAE=')], TU(F(-0), T('\0'))),
  c('empty', [], N),
]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const edit = (f) => { const o = base(); f(o); return o; };
const pair = (a, b) => [typeof a === 'string' ? a : J(a), typeof b === 'string' ? b : J(b)];
const find = (o, name) => [...o.frozen, ...o.heldout].find((x) => x.name === name);
const nest = (k, inner) => { let s = inner; for (let i = 0; i < k; i++) s = '[' + s + ']'; return s; };

function curated() {
  const b = J(base());
  const v = [];
  // identity and formatting
  v.push(pair(b, b));
  v.push(pair(b, edit((o) => { o.frozen[0] = { expected: T('ABC'), name: 'upper', args: [{ v: 'abc', cu: 'utf8', t: 'text' }] }; })));
  // the four findings
  v.push(pair(b, edit((o) => { find(o, 'upper').expected = T('ABD'); })));
  v.push(pair(b, edit((o) => { find(o, 'num').args = [F(2.5)]; })));
  v.push(pair(b, edit((o) => { find(o, 'ctl').args = [T('\x1b[32mgreen')]; find(o, 'ctl').expected = T('changed'); })));
  v.push(pair(b, edit((o) => { o.frozen.push(c('new1', [T('q'), F(-2.5)], T('\x1b\x07\u0000'))); })));
  v.push(pair(b, edit((o) => { o.heldout.unshift(c('newh', [L(T('z'))], B(false))); })));
  v.push(pair(b, edit((o) => { o.frozen.splice(1, 1); o.heldout.splice(0, 1); })));
  v.push(pair(b, edit((o) => { find(o, 'rec').name = 'rec2'; })));
  // a case moved between frozen and heldout — no change of name, args or expected
  v.push(pair(b, edit((o) => { const x = o.frozen.shift(); o.heldout.push(x); })));
  v.push(pair(b, edit((o) => { const x = o.heldout.shift(); o.frozen.unshift(x); })));
  // control characters and non-ASCII in a rewritten answer
  v.push(pair(b, edit((o) => { find(o, 'ctl').expected = T('a\x1bb\x07c\x9bd\x7fe\r\b\f\x01'); })));
  v.push(pair(b, edit((o) => { find(o, 'uni').expected = L(T('ê'), B(true), N); find(o, 'upper').expected = T('\\u001b ‹ESC› \x1b \ud83d'); })));
  // duplicate names: within frozen, across frozen/heldout
  v.push(pair(b, edit((o) => { o.frozen.push(c('upper', [T('abc')], T('LAST'))); })));
  v.push(pair(b, edit((o) => { o.frozen.unshift(c('upper', [T('zzz')], T('SHADOWED'))); })));
  v.push(pair(edit((o) => { o.frozen.push(c('upper', [T('first')], T('X'))); }), edit((o) => { o.frozen[0].expected = T('EDITED-FIRST'); o.frozen.push(c('upper', [T('first')], T('X'))); })));
  v.push(pair(b, edit((o) => { o.heldout.push(c('num', [F(1.5)], F(4))); })));
  // equality: f64 compares bits only, throw compares nothing but the tag, extra keys
  v.push(pair(b, edit((o) => { find(o, 'num').expected = F(3, '3.0'); })));
  v.push(pair(b, edit((o) => { find(o, 'num').expected = F(3.0000000000000004); })));
  v.push(pair(b, edit((o) => { find(o, 'boom').expected = TH('a different message'); })));
  v.push(pair(b, edit((o) => { find(o, 'boom').expected = { t: 'throw' }; find(o, 'num').expected = { ...F(3), note: 1 }; })));
  v.push(pair(b, edit((o) => { find(o, 'bytes').expected = TU(F(0), T('\0')); })));
  v.push(pair(b, edit((o) => { find(o, 'rec').expected = M([T('k'), U(2)], [T('j'), N]); find(o, 'upper').expected = { ...T('ABC'), cu: 'utf16' }; })));
  // file shapes: unparseable on either side or both, unknown-shape (not a map, a list missing or not a list)
  const fz = (frozen, heldout = '[]') => `{"frozen":${frozen},"heldout":${heldout}}`;
  v.push(pair('{"frozen": [', b));
  v.push(pair(b, b.slice(0, -1)));
  v.push(pair('', 'not json'));
  v.push(pair('﻿' + b, ' \t\r\n' + b + '\n'));
  v.push(pair(b, '"a string"'));
  v.push(pair('true', '{"frozen":[],"heldout":{}}'));
  v.push(pair('{}', J({ frozen: base().frozen })));
  v.push(pair(J({ heldout: base().heldout, frozen: null }), J({ heldout: base().frozen, frozen: base().heldout })));
  v.push(pair('{"mode":"vectors","vectors":[{"name":"v0","args":["a"],"expected":1}]}', '{"mode":"vectors","vectors":[{"name":"v0","args":["b"],"expected":2}]}'));
  v.push(pair('{"__proto__":{"frozen":[],"heldout":[]},"heldout":[]}', fz('[{"name":"p"}]')));
  // duplicate keys in the JSON text: last value wins
  v.push(pair('{"frozen":[{"name":"a","expected":{"t":"text","v":"x","cu":"utf8"}}],"heldout":[],"frozen":[]}', fz('[{"name":"a","expected":{"t":"text","v":"x","v":"y","cu":"utf8"}}]')));
  // malformed cases are skipped; non-list args read as the empty list
  v.push(pair(fz('[5,null,[1],"s",true,{"name":"a"}]'), fz('["z",false,0,{"name":"a"}]', '[null]')));
  v.push(pair(fz('[{"name":"a","args":"x"},{"name":"b","args":[]},{"name":"c","args":null},{"name":"d","args":{"t":"text","v":"q"}}]'),
    fz('[{"name":"a","args":5},{"name":"b"},{"name":"c","args":[]},{"name":"d","args":[{"t":"text","v":"q","cu":"utf8"}]}]')));
  v.push(pair(edit((o) => { find(o, 'num').args = 7; }), edit((o) => { find(o, 'num').name = 'gone'; })));
  // args and expected absent vs none vs empty
  v.push(pair(fz('[{"name":"a","args":[]},{"name":"b","args":[],"expected":null}]'), fz('[{"name":"a","args":[],"expected":null},{"name":"b","args":[]}]')));
  // legacy-coded values: display falls back to JSON; equality falls back to JSON text
  v.push(pair(fz('[{"name":"v0","args":["a",1],"expected":"x"},{"name":"v1","args":[2],"expected":{"__t":"num","v":"NaN"}}]'),
    fz('[{"name":"v0","args":["a",1.0],"expected":"y\\u0085"},{"name":"v1","args":[2e0],"expected":{"__t":"num","v":"Infinity"}}]')));
  v.push(pair(fz('[{"name":"a","expected":null},{"name":"b","expected":-0},{"name":"c","expected":{"2":1,"1":2}},{"name":"d","expected":{"a":1,"b":2}},{"name":"e","expected":100}]'),
    fz('[{"name":"a","expected":1e999},{"name":"b","expected":0},{"name":"c","expected":{"1":2,"2":1}},{"name":"d","expected":{"b":2,"a":1}},{"name":"e","expected":1E2}]')));
  v.push(pair(fz('[{"name":"a","expected":{"t":"f64","v":"1","bits":"3FF0000000000000"}},{"name":"b","expected":{"t":"f64","v":"1","bits":"3ff0000000000000"}}]'),
    fz('[{"name":"a","expected":{"t":"f64","v":"2","bits":"3FF0000000000000"}},{"name":"b","expected":{"t":"f64","v":"2","bits":"3ff0000000000000","x":null}}]')));
  // the canonical depth cap: 415 levels compares canonically (key order immaterial), 416 falls back to JSON text
  const deep = (k, inner) => fz(`[{"name":"d${k}","expected":${nest(k, inner)}}]`);
  v.push(pair(deep(415, '{"a":"1","b":"2"}'), deep(415, '{"b":"2","a":"1"}')));
  v.push(pair(deep(416, '{"a":"1","b":"2"}'), deep(416, '{"b":"2","a":"1"}')));
  // the depth walk: the expected sits at file level 3, so 1997 lists put the text at level 2000 (ok) and 1998 at 2001 (too-deep)
  v.push(pair(deep(1997, '"a"'), deep(1997, '"b"')));
  v.push(pair(deep(2001, '"a"'), deep(2001, '"b"')));
  v.push(pair(deep(1997, '[]'), deep(1998, '"b"').replace('"heldout":[]', '"heldout":[5]')));
  // names: kinds collapse to their JSON text; numbering on repeat, one counter across frozen and heldout
  v.push(pair(fz('[{"name":1,"expected":{"t":"none"}},{"name":true},{"args":[]},{"name":{"k":1,"2":0}},{"name":["l"]}]'),
    fz('[{"name":"1","expected":{"t":"none"}},{"name":"true"},{"name":"null","args":[]},{"name":{"2":0,"k":1}},{"name":["l"]},{"name":-0},{"name":1e999}]')));
  v.push(pair(fz('[{"name":"x","args":[],"expected":{"t":"text","v":"A","cu":"utf8"}},{"name":"x","args":[],"expected":{"t":"text","v":"B","cu":"utf8"}}]', '[{"name":"x","args":[]}]'),
    fz('[{"name":"x","args":[],"expected":{"t":"text","v":"C","cu":"utf8"}},{"name":"x","args":[],"expected":{"t":"text","v":"A","cu":"utf8"}},{"name":"x","args":[],"expected":{"t":"text","v":"B","cu":"utf8"}}]', '[{"name":"x","args":[]}]')));
  v.push(pair(fz('[{"name":"x","args":[]},{"name":"x","args":[],"expected":{"t":"text","v":"old","cu":"utf8"}},{"name":"x #2","args":[],"expected":{"t":"text","v":"new","cu":"utf8"}}]'),
    fz('[{"name":"x","args":[]},{"name":"x","args":[],"expected":{"t":"text","v":"new","cu":"utf8"}},{"name":"x #2","args":[],"expected":{"t":"text","v":"new","cu":"utf8"}}]')));
  v.push(pair(fz('[{"name":"x #2","args":[],"expected":{"t":"text","v":"q","cu":"utf8"}}]'),
    fz('[{"name":"x","args":[]},{"name":"x","args":[],"expected":{"t":"text","v":"r","cu":"utf8"}},{"name":"x #2","args":[],"expected":{"t":"text","v":"q","cu":"utf8"}}]')));
  v.push(pair(fz('[{"name":"y","args":[]},{"name":"y #2","args":[]}]'), fz('[{"name":"y #2","args":[]}]', '[{"name":"y","args":[]}]')));
  // all three findings on one case: inputs changed, answer rewritten, moved to hidden
  v.push(pair(b, edit((o) => { const x = find(o, 'upper'); x.args = [T('abd')]; x.expected = T('ABD'); o.frozen.splice(o.frozen.indexOf(x), 1); o.heldout.push(x); })));
  // a value display cannot render as text: the review throws only where the value is shown
  v.push(pair(J(ora([c('a', [], { t: 'i64' })], [])), J(ora([c('b', [], { t: 'f64', v: 5 }), c('c', [{ t: 'text' }], N), c('d', [], { t: 'bytes', v: null }), c('e', [{ t: 'u64', v: [2] }], { t: 'f64', v: true })], []))));
  v.push(pair(J(ora([c('a', [], { t: 'f64', v: 5 })], [])), J(ora([], [c('a', [], { t: 'f64', v: 5 })]))));
  v.push(pair(J(ora([c('a', [{ t: 'f64', v: true }], { t: 'text' })], [])), J(ora([c('a', [{ t: 'f64', v: true }], { t: 'text' })], []))));
  // round-2 rulings: names keyed by (JSON, presence, occurrence); other case keys; file keys; order; malformed cases
  v.push(pair(fz('[{"name":0,"args":[]},{"name":null},{"name":"(no name)"},{"name":{"a":1,"b":2}},{"name":"z"},{"name":"z"}]'),
    fz('[{"name":-0,"args":[]},{"name":1e999},{},{"name":{"b":2,"a":1}},{"name":"z"},{"name":"z","expected":{"t":"none"}},{"name":"z (#2)"}]')));
  v.push(pair(fz('[{"name":"a","args":[],"note":1,"gone":"x","same":[1,2]},{"name":"b","args":[],"__proto__":{}},{"name":"c","args":[],"__proto__":{"x":1}},{"name":"d","args":[],"tags":{"p":1,"q":2}}]'),
    fz('[{"name":"a","args":[],"note":2,"new":null,"same":[1,2]},{"name":"b","args":[]},{"name":"c","args":[]},{"name":"d","args":[],"constructor":1,"tags":{"q":2,"p":1},"-0":-0}]')));
  v.push(pair(J({ ...base(), canonicalSha256: 'aa', mode: 'vectors', note: 0 }), J({ ...base(), unit: 'y', sig: 'y(a: text) -> text', encoding: 'legacy', canonicalSha256: 'bb', note: -0, extra: [1], __proto__: null })));
  v.push(pair('{"__proto__":{},"zeta":1,"frozen":[],"heldout":[]}', '{"zeta":1,"Alpha":2,"alpha":3,"frozen":[],"heldout":[]}'));
  v.push(pair('{"zeta":null,"eta":0,"frozen":[{"name":"a","args":[],"inf":null,"z":0},{"name":"b","args":[],"constructor":{}}],"heldout":[]}',
    '{"__proto__":{},"zeta":1e999,"eta":-0,"frozen":[{"name":"a","args":[],"inf":1e999,"z":-0,"__proto__":{}},{"name":"b","args":[]}],"heldout":[]}'));
  v.push(pair(fz('[{"name":5,"args":[],"expected":5,"note":5},{"name":"m","args":[],"expected":[-0,1e999]}]', '[]').replace('"heldout":[]', '"heldout":[],"tag":7'),
    fz('[{"name":{"\\u0000n":"5"},"args":[],"expected":{"\\u0000n":"5"},"note":{"\\u0000n":"5"}},{"name":"m","args":[],"expected":[{"\\u0000n":"-0"},{"\\u0000n":"Infinity"}]}]', '[]').replace('"heldout":[]', '"heldout":[],"tag":{"\\u0000n":"7"}')));
  v.push(pair(b, edit((o) => { const x = o.frozen[0]; o.frozen[0] = o.frozen[2]; o.frozen[2] = x; })));
  v.push(pair(b, edit((o) => { o.heldout.reverse(); find(o, 'ctl').note = 'n'; })));
  v.push(pair(b, edit((o) => { o.frozen.push(5); find(o, 'upper').expected = T('ABD'); })));
  // the display of every tag and every odd field, through added cases (before is empty)
  const show = (exps) => pair(J(ora([], [])), J(ora(exps.map((e, i) => ({ name: 's' + i, args: [e], expected: e })), [])));
  v.push(show([N, { t: 'undefined' }, B(true), B(false), { t: 'bool', v: 'yes' }, { t: 'bool', v: 3 }, { t: 'bool' }, { t: 'bool', v: null },
    I('-9223372036854775808'), U('18446744073709551615'), F(-0), F(1e21), F(1e-7), F(NaN), F(Infinity), BY('base64:AAE='), { t: 'bigint', v: '12345678901234567890' }, { t: 'bigint' }, { t: 'bigint', v: 5 }]));
  v.push(show([T(''), T('"q" \\ /'), T('\b\f\n\r\t\x00\x01\x1f\x7f\x80\x9b '), T('\ud800 \udfff \u{1F600}'), { t: 'text', v: 5 }, { t: 'text', v: null },
    { t: 'text', v: true }, { t: 'text', v: [1, 'a'] }, { t: 'text', v: { b: 1, '10': 2, '2': 3, a: [] } }, { t: 'text', v: 1e21 }, { t: 'text', v: 1e999 }, T('  ')]));
  v.push(show([TH('m'), TH(''), { t: 'throw' }, { t: 'throw', msg: null }, { t: 'throw', msg: 7 }, { t: 'throw', msg: '\x1b' }, { t: 'throw', msg: ['a'] }]));
  v.push(show([L(), L(T('a'), F(1)), TU(N, L(B(true))), L(T('x'), { t: 'text' }, { t: 'f64', v: null }, { t: 'f64', v: 2.5 }, { t: 'bool' }, { t: 'f64', v: true }),
    L(5, 'raw', [1], {}), L(null), L({ t: 'f64' }), { t: 'list' }, { t: 'list', v: 'abc' }, { t: 'list', v: {} }, { t: 'list', v: null }]));
  v.push(show([R(), R(['a', T('x')], ['_B9', F(1)], ['9a', N], ['a b', N], ['', N], ['\x1b', N], ['é', N]),
    R([null, N], [true, N], [5, N], [-2.5, N], [{ k: 1 }, N]), R([undefined, N]), R(['a']), R(['a', null]), R(['a', 5]), R(['a', { t: 'text' }], ['b', { t: 'f64', v: null }], ['c', { t: 'f64', v: 4 }]),
    R(['a', T('x'), 'extra']), R(null), R(5), { t: 'record', v: [7] }]));
  v.push(show([M(), M([T('k'), T('v')], [F(1), L()]), M([{ t: 'text' }, { t: 'f64', v: null }]), M([T('k')]), M([T('k'), null]), M(['raw', 'raw']), M([null, N]), { t: 'map', v: {} },
    { t: 'f64', v: '?' }, { t: 'nope' }, { t: 5 }, { t: ['text'] }, {}, 'bare text', 7, [T('a')], true, { v: 'x' }]));
  v.push(show([{ t: 'f64', v: '\\u000a\\u000d\\u0009\\u0000\\u0007\\u001b\\u009b' }, { t: 'bytes', v: '\\u001B \\u001b \\\\u001b \\u00e9 \\u1234' }, { t: 'i64', v: '\\u001b\\u001b' }, { t: 'f64', v: '\x1b\x85\x7f\x01 raw \\u0085 \\u007f \\u0080 \\u00a0' },
    R(['k', T('\x1b')], ['\x07', N]), M([T('\x1b'), T('\x00')]), L(T('\x1b'), T('\x9b'))]));
  return v;
}

// ---- the seeded random fill: random mutations of the base oracle
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const TEXTS = ['', 'a', 'abc', 'x y', '\x1b[0m', '\x07', '\x00', '\n', 'café', '\u{1F600}', ' ', '\\', '"', ' ', '\x9b'];
const randVal = (rnd, d = 0) => {
  const k = Math.floor(rnd() * (d > 1 ? 6 : 10));
  if (k === 0) return T(pick(rnd, TEXTS));
  if (k === 1) return F(pick(rnd, [0, -0, 1, 1.5, -2.5, 1e21, 1e-7, 255, 0.1]));
  if (k === 2) return I(pick(rnd, [0, -1, 42, '9223372036854775807']));
  if (k === 3) return B(rnd() < 0.5);
  if (k === 4) return N;
  if (k === 5) return TH(pick(rnd, ['boom', 'x', '']));
  if (k === 6) return L(...Array.from({ length: Math.floor(rnd() * 3) }, () => randVal(rnd, d + 1)));
  if (k === 7) return R(...Array.from({ length: Math.floor(rnd() * 3) }, (_, i) => [pick(rnd, ['a', 'b c', 'x' + i, '_']), randVal(rnd, d + 1)]));
  if (k === 8) return M(...Array.from({ length: Math.floor(rnd() * 3) }, (_, i) => [T('k' + i), randVal(rnd, d + 1)]));
  return U(pick(rnd, [0, 7, '18446744073709551615']));
};
const NAMES = ['upper', 'num', 'ctl', 'uni', 'rec', 'boom', 'bytes', 'empty'];
function randomPair(rnd) {
  const before = base(); const after = clone(before);
  const ops = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < ops; i++) {
    const op = Math.floor(rnd() * 13); const all = () => [...after.frozen, ...after.heldout];
    const target = all().length ? pick(rnd, all()) : null;
    if (op === 0 && target) target.expected = randVal(rnd);
    else if (op === 1 && target) target.args = [randVal(rnd)];
    else if (op === 2) (rnd() < 0.5 ? after.frozen : after.heldout).push(c('r' + Math.floor(rnd() * 1000), [randVal(rnd)], randVal(rnd)));
    else if (op === 3) { const lst = rnd() < 0.5 ? after.frozen : after.heldout; if (lst.length) lst.splice(Math.floor(rnd() * lst.length), 1); }
    else if (op === 4 && target) target.name = target.name + '_renamed';
    else if (op === 5) { if (after.frozen.length) after.heldout.push(after.frozen.shift()); }
    else if (op === 6) (rnd() < 0.5 ? after.frozen : after.heldout).push(c(pick(rnd, NAMES), [randVal(rnd)], randVal(rnd)));
    else if (op === 7 && target) { target.args = [randVal(rnd)]; target.expected = randVal(rnd); }
    else if (op === 8 && target) (rnd() < 0.5 ? after.frozen : after.heldout).splice(0, 0, c(target.name + pick(rnd, ['', ' #2', ' #3']), [randVal(rnd)], randVal(rnd)));
    else if (op === 9) { if (after.heldout.length) after.frozen.push(after.heldout.pop()); }
    else if (op === 10 && target) target[pick(rnd, ['note', 'tags', 'why'])] = pick(rnd, [1, 'x', [1], { a: 1 }, null]);
    else if (op === 11) after[pick(rnd, ['unit', 'sig', 'encoding', 'canonicalSha256', 'mode'])] = pick(rnd, ['u', 'v', 2]);
    else if (op === 12 && after.frozen.length > 1) after.frozen.reverse();
  }
  const pretty = rnd() < 0.3;
  return [J(before), pretty ? JSON.stringify(after, null, 1) : J(after)];
}

export function genInputs(n, rnd) {
  const out = curated();
  while (out.length < n) out.push(randomPair(rnd));
  return out;
}
