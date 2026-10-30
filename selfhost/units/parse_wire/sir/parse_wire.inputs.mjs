// parse_wire input generator: genInputs(n, rnd) -> n argument lists [line]. Curated prefix first (every branch of the
// integer rule, every grammar edge, every throw path, the depth limit (128), the #51 key sequence, the out-of-domain arguments),
// then a seeded fill of random JSON documents built from the same strata. Never emitted: a result nesting deeper than 100
// levels (no transport carries it — ENVELOPE OUT) and a line holding a raw unpaired surrogate (ENVELOPE: well-formed text).
const B = '\\';
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const SAFE_EDGE = ['9007199254740991', '-9007199254740991', '9007199254740992', '-9007199254740992', '9007199254740993', '-9007199254740993',
  '9007199254740994', '9007199254740995', '-9007199254740995', '18446744073709551615', '18446744073709551614', '9223372036854775807',
  '-9223372036854775808', '-9223372036854775809', '18446744073709551616', '1152921504606846976', '1152921504606846977',
  '36893488147419103232', '100000000000000000000', '123456789012345678901234567890', '-123456789012345678901234567890'];
const FLOATS = ['1.5', '-0.0', '0.1', '1e20', '1E-7', '2.5e+3', '9007199254740993.0', '9007199254740993e0', '1.8446744073709551615e19',
  '1e308', '5e-324', '1e-400', '-1e-400', '0e5', '-0e5', '1E2', '0.30000000000000004', '-2.2250738585072011e-308', '12345678901234567890.5',
  '1.7976931348623157e308', '1e400', '-1e309', '1.7976931348623159e308'];
const SMALL = ['0', '-0', '1', '-1', '42', '-17', '1000000', '65535'];
const digits = (rnd, len) => { let s = String(1 + Math.floor(rnd() * 9)); for (let i = 1; i < len; i++) s += String(Math.floor(rnd() * 10)); return s; };
function numeral(rnd) {
  const r = rnd();
  if (r < 0.25) return pick(rnd, SMALL);
  if (r < 0.5) return pick(rnd, SAFE_EDGE);
  if (r < 0.65) return pick(rnd, FLOATS);
  if (r < 0.83) return (rnd() < 0.3 ? '-' : '') + digits(rnd, 15 + Math.floor(rnd() * 26));   // 15..40 digits, either sign
  if (r < 0.85) return (rnd() < 0.5 ? '-' : '') + digits(rnd, 300 + Math.floor(rnd() * 30));  // an integer near / past the double range
  if (r < 0.93) return String(Math.floor(rnd() * 2000000) - 1000000);
  return (rnd() < 0.5 ? '-' : '') + Math.floor(rnd() * 1000) + '.' + Math.floor(rnd() * 100000) + (rnd() < 0.4 ? 'e' + (Math.floor(rnd() * 40) - 20) : '');
}
const STR_FRAG = ['a', 'ok', 'throw', 'hello world', '', ' ', B + '"', B + B, B + '/', B + 'b', B + 'f', B + 'n', B + 'r', B + 't', B + 'u0041',
  B + 'u00e9', B + 'u2028', B + 'uFFFF', B + 'ud83d' + B + 'ude00', B + 'ud800', B + 'uDC00x', 'é', 'ж', '😀', ' ', '\u007f', '日本', '{', '}', '[', ':', ','];
function strBody(rnd) { let s = ''; const k = Math.floor(rnd() * 4); for (let i = 0; i < k; i++) s += pick(rnd, STR_FRAG); return s; }
const KEYS = ['a', 'b', 'ok', 'throw', '', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '0', '1', '10', '__f64bits', 'x y',
  B + B, B + B + B + B, B + 't', B + 'n', B + 'u0041', B + '"', B + '/', 'a' + B + 'nb', B + 'u00e9', 'é', '😀', 'k' + B + B + 'k', B + '"q'];
function str(rnd) { return '"' + strBody(rnd) + '"'; }
function ws(rnd, p) { if (rnd() >= p) return ''; let s = ''; const k = 1 + Math.floor(rnd() * 2); for (let i = 0; i < k; i++) s += pick(rnd, [' ', '\t', '\n', '\r']); return s; }
function value(rnd, depth, p) {
  const r = rnd();
  if (depth <= 0 || r < 0.45) {
    const s = rnd();
    if (s < 0.5) return numeral(rnd);
    if (s < 0.75) return str(rnd);
    return pick(rnd, ['true', 'false', 'null']);
  }
  const n = Math.floor(rnd() * 4);
  if (r < 0.7) { const items = []; for (let i = 0; i < n; i++) items.push(ws(rnd, p) + value(rnd, depth - 1, p) + ws(rnd, p)); return '[' + (items.length ? items.join(',') : ws(rnd, p)) + ']'; }
  const ents = []; const used = [];
  for (let i = 0; i < n; i++) {
    const k = used.length && rnd() < 0.2 ? pick(rnd, used) : pick(rnd, KEYS); used.push(k);   // a repeated key now and then
    ents.push(ws(rnd, p) + '"' + k + '"' + ws(rnd, p) + ':' + ws(rnd, p) + value(rnd, depth - 1, p) + ws(rnd, p));
  }
  return '{' + (ents.length ? ents.join(',') : ws(rnd, p)) + '}';
}
const nest = (k, inner) => '['.repeat(k) + inner + ']'.repeat(k);
const BIG400 = '1' + '0'.repeat(400);
// The stamp keeps the FIRST 72 distinct lines (24 frozen, 48 held-out): each line below probes several facts at once.
const CURATED = [
  '[9007199254740991,9007199254740992,9007199254740993,-9007199254740993,9007199254740994,18446744073709551615]',
  '{"ok":{"a":1.5,"b":[true,false,null],"c":"x' + B + 'n"}}',
  '',
  '-0',
  '{"a":1,"b":3,"a":2}',
  '[18446744073709551616,1152921504606846976,36893488147419103232,100000000000000000000,-9223372036854775808,-0.0,1e20,1E-7]',
  '{"' + B + B + '":1}',        // #51: a key that is one backslash ...
  '{"' + B + 't":2}',           // ... then a one-escape key: the host's JSON.parse reads it back as the backslash
  '"' + B + '"' + B + B + B + '/' + B + 'b' + B + 'f' + B + 'n' + B + 'r' + B + 't' + B + 'u0041' + B + 'u00e9' + B + 'ud83d' + B + 'ude00😀é"',
  '{"__proto__":{"x":1},"constructor":2,"10":3,"2":4}',
  ' \t\n\r[ 1 , { "a" : 2 } ]\r\n',
  '[1,]',
  '1e400',
  '[1.7976931348623157e308,' + BIG400 + ',-' + BIG400 + ']',
  nest(129, '1'),
  '{"ok":{"__f64bits":"3ff0000000000000"}}',
  '[9007199254740993.0,9007199254740993e0,12345678901234567890.5,0e5,-0e5,1e-400,-1e-400,5e-324,1e308,2.5e+3]',
  // R6 past 64 bits, in the FROZEN slice (round 1 cross: a rust reader that rounds these to f64 passed every frozen vector).
  // An exact integer is a js-native value (bigint), so these four grade js/ts in frozen; the two after them are SHARED vectors
  // a rounding or serde_json-default reader fails in any language: an overwritten integer past the double range (R4 reads it,
  // R6 never throws), and an overwritten unpaired-surrogate escape (R3 reads it, R4 drops it)
  '-184467440573709551616',
  '[115292150460684697636893488147419103232,-1844677440737095571616,[36893488147419103233]]',
  '{"k":36893488147419103233,"n":{"m":-18446744073709551617}}',
  '{"a":' + BIG400 + ',"a":1}',
  '[{"k":-' + BIG400 + ',"k":[0]},{"a":"' + B + 'ud800","a":true}]',
  '[[],{},"",[[]],{"":{}}]',
  '01',
  // held-out from here on
  '"' + B + 'ud800"', '{"a":9007199254740993,"a":1}', '1 2', '"a\u0001"',
  '184467440573709551616', '1844677440737095571616', '[{"x":[-115292150460684697636893488147419103232]}]',
  '{"a":1,"a":9007199254740993}', '-9223372036854775809', '18446744073709551614', '9007199254740995', '[1e20,123456789012345678901234567890,1.0]',
  '{"' + B + B + '":1,"' + B + 'n":2,"' + B + 'u0041":3,"' + B + '"":4,"' + B + '/":5}', '{"' + B + 'n":6}',
  '{"throw":"panic"}', 'null', nest(99, ''), nest(130, ''), '{"a":'.repeat(129) + '1' + '}'.repeat(129),
  '-1e309', '1.7976931348623159e308', '[1,1e999]', '{"a":1e400,"a":1}',
  '"  ' + B + 'u2028"', '{"' + B + 'u0041":1,"A":2}', '{"' + B + 'ud800":1}', '["' + B + 'ud83d' + B + 'u0041","' + B + 'uDC00' + B + 'uD800"]',
  '"' + B + 'x"', '"' + B + 'u12"', '"' + B, '{a:1}', '+1', '"abc', '\ufeff1', '\u00a01', ' 1', '{"a":1}{"b":2}', '1.', 'NaN', ' \t ',
];
// OUT-OF-DOMAIN (js widening): every non-text argument throws; none is converted to text
const CHAOS = [[123], [null], [true], [{ a: 1 }], [{ length: 3 }], [['[1]']], [['[', '1', ']']], [[]]];
export function genInputs(n, rnd) {
  const out = CURATED.map((l) => [l]).concat(CHAOS);
  while (out.length < n) {
    const r = rnd();
    if (r < 0.06) { const v = Array.from(value(rnd, 3, 0.2)); const cut = Math.max(0, Math.floor(rnd() * v.length)); out.push([v.slice(0, cut).join('') + pick(rnd, ['', ',', '}', ']', 'x', ' 1', '"'])]); continue; }   // a malformed document, cut between code points (a cut inside a surrogate pair left a raw lone surrogate in the line: ENVELOPE OUT)
    const p = r < 0.3 ? 0.25 : 0;   // most lines are compact, as the harness writes them
    out.push([ws(rnd, p) + value(rnd, 1 + Math.floor(rnd() * 5), p) + ws(rnd, p)]);
  }
  return out;
}
