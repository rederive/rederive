// Input generator for rust_carried_table(src, shape): a curated coverage prefix (every R-rule, TABLE row and throw path the
// sighted cut found), then a seeded random fill of well-formed carried tables in every table form. Deterministic from rnd().
const H = (k) => '#'.repeat(k);
const nest = (k, x) => '['.repeat(k) + x + ']'.repeat(k);
const listT = (k, t) => 'list['.repeat(k) + t + ']'.repeat(k);
const FROZEN = [
  ['pub static T: &[(&str, &str)] = &[("a", "x"), ("b", "y"), ("c", "")];', ''],
  ['pub const C: [(&str, [u8; 3]); 2] = [\n  ("red", [255, 0, 0]),\n  ("blue", [0, 0, 255]),\n];', 'map text -> list[u8]'],
  ['static P: phf::Map<&\'static str, i32> = phf_map! {\n  "a" => 1,\n  "b" => -2,\n  "c" => 0x10,\n};', 'map[text, i64]'],
  ['fn f(s: &str) -> Option<f64> { match s { "pi" => Some(3.14), "e" => Some(2.71), "nan" => None, _ => None } }', null],
  ['// ("x", 1) is a comment\nlet m = HashMap::from([\n  ("on", true), /* ("y", 2) /* nested */ ("z", 3) */\n  ("off", false),\n]);', 'map[text, bool]'],
  ['&[("nl", "a\\nb"), ("tab", "\\t"), ("cr", "\\r"), ("nul", "\\0"), ("bs", "\\\\"), ("q", "\\""), ("ap", "\\\'"), ("x", "\\x41\\x7e"), ("u", "\\u{1F600}\\u{e9}"), ("cont", "one \\\n     two")]', 'map[text, text]'],
  ['&[(r"raw\\n", r#"has "quotes""#), ("bytes", b"ab\\x41"), (br"braw", r##"x"#y"##)]', null],
  ['impl<\'a> T<\'a> { fn g(x: &\'a str) {} }\nconst C: &[(&str, char)] = &[("x", \'x\'), ("nl", \'\\n\'), ("ap", \'\\\'\'), ("dq", \'"\'), ("smile", \'\\u{263A}\'), ("hx", \'\\x41\')];', 'map[text, text]'],
  ['&[("hex", 0xFF), ("oct", 0o17), ("bin", 0b1010_1010), ("us", 1_000_000), ("suf", 255u8), ("f", 2.5e-3), ("f32", 0.5f32), ("f32i", 16777216f32), ("bf", 0b1f32), ("hexf", 0x1f64), ("neg", -7i64), ("E", 1E3)]', null],
  ['&[("a", 255 as u8), ("b", -1 as i8), ("c", 1.0 as u8), ("d", 1e3 as u16), ("e", 0.5 as f32), ("f", 0.1 as f64), ("g", 7 as usize), ("h", -0x80 as i8), ("i", -0.0 as u8), ("j", 4294967295 as u32), ("k", 9007199254740991 as u64), ("l", -9007199254740991 as i128), ("m", [1 as i16, 2 as u32]), ("n", -2147483648 as i32), ("o", -0 as i64), ("p", 9007199254740992 as u64), ("q", -9007199254740992 as i64), ("r", -0i64), ("s", -0.0 as f64)]', null],
  ['&[("list", [1, 2, 3]), ("tup", (1, "a", true)), ("paren", (5)), ("one", (5,)), ("unit", ()), ("empty", []), ("some", Some(4)), ("ref", &[&1, &2]), ("nest", [[1], [2, [3]]]), ("none", None), ("opt", [Some(1), None]), ("sn", Some(&None)), ("sp", Some((None))), ("ss", Some(&Some(2)))]', 'map[text, json]'],
  ['const MAX: u64 = 18446744073709551615;\nconst T: &[(&str, u64)] = &[("p53", 9007199254740992), ("p60", 0x1000_0000_0000_0000), ("p64", 18446744073709551616), ("neg63", -9223372036854775808i64), ("r", 9007199254740993.0)];', 'map[text, f64]'],
  ['&[("big", 9007199254740993u64)]', null],
  ['&[("a", 1), ("b", x)]', null],
  ['pub static T: &[(&str, u8)] = &[];', null],
  ['&[("a", [0]), ("a", [-0]), ("b", 1), ("b", 1.0), ("c", None), ("c", None), ("constructor", 1), ("__proto__", [2]), ("toString", "x")]', null],
  ['&[("a", 0), ("a", -0)]', null],
  ['static P: phf::Map<&str, u8> = phf_map! { "a" => 1, "b" => 2 };\nfn label() -> String { format!("{}", 5) }', null],
  ['static M: phf::Map<&str, u8> = phf_map! { "a" => 1, "b" => foo() };', null],
  ['&[("a", 1.5)]', 'map text -> i64'],
  ['match k { "a" | "b" => 1, "c" => 2, _ => 0 }', null],
  ['&[("red", [255, 0, 0, "r"]), ("blue", [0, 0, 255, "b"])]', 'map text -> tuple[u8, u8, u16, text]; rgb plus a name'],
  ['&[("a", 1), ("b", Some(None))]', null],
  ['&[("a", "bad \\q escape")]', null],
];
const HELD = [
  ['&[("n", 1), ("s", "x"), ("z", None)]', 'map[text, f64 | text | none]'],
  ['&[("a", 1)]', 'map[text, json | text]'],
  ['&[("a", [1, 2])]', 'map[text, tuple[json, f64] | tuple[f64, f64]]'],
  ['&[("a", 1)]', 'map[text, record[a: text] | record[a: text, b: none]]'],
  ['&[("a", 1), ("b", [1.5])]', 'map[text, f64 | record[a: text, b: none] | record[a: text] | list[f64] | list[i64] | map[text, f64]]'],
  ['&[("a", 1), ("b", 2)]', 'map[text, f64 | record[u8: u8, i16: list[i32 ]]]'],
  ['&[("a", -1)]', 'map\t text\t->  u32 \t'],
  ['&[("a", 1)]', '\ufeffmap[text, f64]'],
  ['&[("a", 1)]', '\nmap[text,\r\nf64]\n'],
  ['&[("a", 1)]', '\r\nmap\ntext ->\nu8\r\n'],
  ['&[("a", -1)]', 'map[text,\nu8]'],
  ['&[("a", 1)]', '\n'],
  ['&[("a", 1)]', 'map\u000btext -> f64'],
  ['&[("a", ' + nest(15, '1') + ')]', 'map[text, ' + listT(15, 'u8') + ']'],
  ['&[("a", ' + nest(16, '1') + ')]', 'map[text, ' + listT(16, 'u8') + ']'],
  ['&[("a", [1])]', 'map[text, tuple[f64, f64]]'],
  ['&[("a", 1e19), ("b", -0.0), ("c", 0xFFFF_FFFF_FFFF_F800)]', 'map[text, u64]'],
  ['&[("a", 9.3e18)]', 'map[text, i64]'],
  ['&[("a", 9.2e18), ("b", -9.2e18), ("c", 1e3), ("d", -9223372036854775808)]', 'map[text, i64]'],
  ['&[("a", 1)]', 'record[a: text]'],
  ['&[("a", 1)]', 'map[i64, f64]'],
  ['&[("long", 1.' + '0'.repeat(70) + '), ("ok", 2), ("a", r' + H(30) + '"x"' + H(30) + '), ("b", br' + H(29) + '"y"' + H(29) + ')]', null],
  ['&[("a", r' + H(31) + '"x"' + H(31) + '), ("b", 1)]', null],
  ['&[("dot", 1.), ("cast", true as u8), ("ch", \'a\' as u8), ("par", (1) as u8), ("sum", 1 + 2), ("two", 1 as u8 as u16), ("big", 1 + 99999999999999999), ("kept", 3), ("a", ("b", 1), 3), ("z", 0X10)]', null],
  ['match s { "g" if f => 3, "d" => ("e", 4), "h" => 5 }', null],
  ['"a" => 1', null],
  ['"a" | x => 1, "c" => 2, _ if s == "d" || "e" => 3,', null],
  ['&[("q", \'static)]', null],
  ['fn f(n: &str) -> String { format!("{}", n) }\n&[("a", 1)]', null],
  ['&[("a", Some(Some(1)))]', null],
  ['&[("a", 0.1f32)]', null],
  ['&[("a", 16777217f32)]', null],
  ['&[("a", 1)] /* this comment never closes ("b", 2)', null],
  ['&[("a", "\\u{110000}")]', null],
  ['&[("a", "\\u{}")]', null],
  ['&[("a", r#"never closed)]', null],
  ['&[("a", "never closed)]', null],
  ['&[("ua", "\\u{_1_F_6_0_0}"), ("ub", "\\xFF"), ("uc", "p\\\r\n \tq"), ("c", -0x10), ("d", - 5), ("e", -9007199254740991), ("g", (None)), ("h", -0)]', null],
  ['&[("b", \'x\'), ("é", "日本語"), ("emoji", [\'\\u{1F600}\', "\\u{10FFFF}"]), ("a", 0x1FFFFFFFFFFFFF), ("nb", 0o377), ("c", 0b1111_0000u8), ("d", 1e5u8), ("e", 1_f64), ("f", 007), ("g", 0X10), ("h", 1e-400)]', null],
  ['const A: f64 = 1e400; const B: u64 = 0x_; // "\\q" in a comment is never read\n&[("s", "/* not a comment */ // nor this")]', null],
  ['"a" => 1, "b" => [1, (2,), (3)], "c" => -1, "a" => 1 }', 'map[text, json]'],
  ['&[("a", 1e400)]', null],
  ['&[("a", 0x_)]', null],
  ['&[("a", 18446744073709551615 + 1)]', null],
  ['&[("a", 1.9 as u8)]', null],
  ['&[("a", 0.1 as f32)]', null],
  ['&[("a", 1 as char)]', null],
  ['&[("a", 18014398509481984 as u64)]', null],
];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const KEY_CHARS = ['a', 'b', 'z', 'K', '_', '-', ' ', '0', '9', 'é', '日', '\u00ff'];
const ESC_KEY = ['\\n', '\\t', '\\x41', '\\u{e9}', '\\u{1F600}', '\\\\', '\\"', '\\\''];
function key(rnd, i) {
  let s = ''; const n = 1 + Math.floor(rnd() * 5);
  for (let j = 0; j < n; j++) s += rnd() < 0.15 ? pick(rnd, ESC_KEY) : pick(rnd, KEY_CHARS);
  return s + i;   // the index keeps keys distinct, so no random duplicate
}
const SUF_INT = ['', '', '', 'u8', '_u16', 'u32', 'i64', 'usize', 'i32'];
function intLit(rnd) {   // exact by construction: below 2^53, or a power of two
  const v = rnd() < 0.08 ? 2 ** (53 + Math.floor(rnd() * 11)) : Math.floor(rnd() * (rnd() < 0.2 ? 2 ** 53 : 1000));
  const form = rnd(); const big = BigInt(v);
  let body = form < 0.55 ? big.toString() : form < 0.75 ? '0x' + big.toString(16) : form < 0.88 ? '0o' + big.toString(8) : '0b' + big.toString(2);
  if (rnd() < 0.25 && body.length > 3) { const at = 3 + Math.floor(rnd() * (body.length - 3)); body = body.slice(0, at) + '_' + body.slice(at); }
  return { lit: body + pick(rnd, SUF_INT), v };
}
function cast(rnd, v, neg) {   // a cast that keeps the value (or none)
  const r = rnd(); if (r < 0.75) return '';
  const x = neg ? -v : v; const opts = [' as f64'];
  if (Number.isInteger(x) && Math.abs(x) <= 2 ** 53 - 1) { opts.push(' as i64'); if (x >= 0) opts.push(' as u64', ' as usize'); }
  if (Number.isInteger(x) && x >= 0 && x <= 65535) opts.push(' as u16', ' as u32');
  if (Number.isInteger(x) && x >= -128 && x <= 127) opts.push(' as i8');
  if (Math.fround(x) === x) opts.push(' as f32');
  return pick(rnd, opts);
}
function floatLit(rnd) {
  const ip = String(Math.floor(rnd() * 1000)), fp = rnd() < 0.3 ? pick(rnd, ['5', '25', '125', '75', '0']) : String(Math.floor(rnd() * 1000));
  const exp = rnd() < 0.3 ? pick(rnd, ['e', 'E']) + pick(rnd, ['', '+', '-']) + Math.floor(rnd() * 20) : '';
  const lit = ip + '.' + fp + exp; const v = Number(lit);
  return { lit: lit + pick(rnd, Math.fround(v) === v ? ['', 'f64', 'f32', '_f32'] : ['', '', 'f64', '_f64']), v };   // f32 only when binary32-exact (R5)
}
function value(rnd, depth) {
  const r = rnd();
  if (r < 0.18) return '"' + (rnd() < 0.5 ? pick(rnd, ESC_KEY) : '') + pick(rnd, KEY_CHARS) + '"';
  if (r < 0.25) return "'" + pick(rnd, ['a', 'Z', '\\n', '\\u{e9}', '"', '\\\'']) + "'";
  if (r < 0.31) return pick(rnd, ['true', 'false']);
  if (r < 0.35) return 'None';
  if (r < 0.55) { const neg = rnd() < 0.25; const { lit, v } = intLit(rnd); return (neg ? '-' : '') + lit + cast(rnd, v, neg); }
  if (r < 0.68) { const neg = rnd() < 0.2; const { lit, v } = floatLit(rnd); return (neg ? '-' : '') + lit + cast(rnd, v, neg); }
  if (r < 0.74) { const v = value(rnd, depth + 1); return rnd() < 0.5 && !/^(?:Some|None)/.test(v) ? 'Some(' + v + ')' : '&' + v; }   // no nested Option (R6 throws)
  if (depth > 2) return '1';
  const n = Math.floor(rnd() * 4); const items = []; for (let j = 0; j < n; j++) items.push(value(rnd, depth + 1));
  const br = rnd() < 0.6 ? ['[', ']'] : ['(', ')'];
  return br[0] + items.join(', ') + (n && rnd() < 0.3 ? ',' : '') + br[1];
}
const COMMENTS = ['', '', '', ' // note ("x", 9)\n', ' /* c */ ', ' /* a /* b */ c */ '];
function table(rnd) {
  const n = 1 + Math.floor(rnd() * 5); const ents = [];
  for (let i = 0; i < n; i++) { const raw = rnd() < 0.1; const k = key(rnd, i); ents.push([raw ? 'r"' + k.replace(/[\\"]/g, '') + '"' : '"' + k + '"', value(rnd, 0)]); }
  if (rnd() < 0.15) ents.push(ents[0]);   // a repeated entry: the same value, so no throw
  const form = Math.floor(rnd() * 6), c = () => pick(rnd, COMMENTS);
  const tup = ents.map(([k, v]) => `(${k}, ${v})`), arm = ents.map(([k, v]) => `${k} => ${v}`);
  switch (form) {
    case 0: return `pub static T: &[(&str, V)] = &[${c()}${tup.join(',' + c())}];`;
    case 1: return `pub const T: [(&str, V); ${n}] = [\n  ${tup.join(',\n  ')},\n];`;
    case 2: return `let t = vec![${tup.join(', ')}];${c()}`;
    case 3: return `let m: HashMap<&str, V> = HashMap::from([${tup.join(', ')}]);`;
    case 4: return `static M: phf::Map<&'static str, V> = phf_map! {${c()}${arm.join(',' + c())}${rnd() < 0.5 ? ',' : ''} };`;
    default: return `fn get(k: &str) -> V { match k {\n  ${arm.join(',\n  ')},\n  _ => unreachable!(),\n} }`;
  }
}
const SHAPES = [null, null, null, '', 'map[text, json]', 'map text -> json', 'map[text, f64]', 'map[text, text]',
  'map[text, list[json]]', 'map[text, f64 | text | bool | none | list[json]]', 'map text -> json; generated', 'map[text, i64 | f64 | json]'];

export function genInputs(n, rnd) {
  const out = [...FROZEN, ...HELD].map((a) => [...a]);
  while (out.length < n) out.push([table(rnd), pick(rnd, SHAPES)]);
  return out;
}
