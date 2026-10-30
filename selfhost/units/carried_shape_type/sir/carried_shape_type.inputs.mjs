// carried_shape_type input generator: genInputs(n, rnd) -> n argument lists [shape], deterministic from rnd().
// Curated prefix first (every rule of the SIR, every throw path once), then seeded type texts in the real domain.
// Round 5b: CR and LF are rewrite whitespace too (trim, the arrow split, the width gaps), so the fill draws them everywhere.
const nest = (d, inner = 'text') => { let s = inner; for (let i = 0; i < d; i++) s = `list[${s}]`; return s; };
const arrows = (d) => { let s = 'text'; for (let i = 0; i < d; i++) s = `map text -> ${s}`; return s; };

const CURATED = [
  // frozen-slice core (first 24): scalars, widths, arrow form, ';' cut, unions, records, depth, throws
  'text', 'map text -> u8', 'map text -> map u16 -> i32', 'map[text, u32]', 'i8', 'u16 | none',
  'list[u8]; a list of bytes', 'record[name: text, age: u8]', 'record[u8: text]', 'record[u8: u8, i16x: i16]',
  'map map[text, u8] -> list[i32]', 'map map a -> b -> c', 'map text, text] | map[u8 -> text',
  'json | text', 'text | json', 'list[json] | list[text]', 'record[i8: text, i64: text]', 'tuple[i32, f64, bool]',
  '  map\ttext -> text | none\t ', 'list[u8\n]', 'u8\n', nest(16), nest(17), '',
  // held-out curated (stamp keeps the first 72 unique inputs: these 48 are the held-out slice)
  arrows(16), arrows(17), 'map text -> text] | list[text', 'map text, text -> u8', 'map text->text', 'maptext -> text',
  'map text -> ', 'map  -> text', 'map\ntext -> text', 'map text -> text', ' text', 'text\n', '\r\ntext\r\n',
  '\nu8', 'list[\nu8]', 'list[ u8 ]', 'list[\tu8\t]', 'tuple[u8,u16,u32,i8,i16,i32]', 'record[a :\tu8 ]', 'u8 | u16',
  'u128', 'list[a_u8]', 'record[u8 : u8]', 'map text | none -> text', 'record[a:\nu8, u16\n:\ri8]', 'list [ text ]',
  'list[text|none] | list[none|text]', 'record[a: text, b: u8] | record[b: u8, a: text]', 'json | list[i64]',
  'json | map[text, f64]', 'json | map[u8, text]', 'tuple[u8\r\n,\r\ni16]', 'json | tuple[text, bytes]', 'map\r\nu8\r\n->\r\ni32',
  'json | record[a: text, b: i64]', 'none | json', 'map[text, json] | map[text, text]', 'map[json, text] | map[text, text]',
  'tuple[json, json] | tuple[text]', 'record[x: json] | record[x: text]', 'record[a: text] | record[a: text, b: none]',
  'record[a: text, b: none] | record[a: text]', 'list[text|none] | list[text]', 'list[text] | list[text|none]',
  'record[a: list[text | none]] | record[a: list[none]]', 'record[a: ' + nest(15) + ']', 'record[a: ' + nest(16) + ']',
  'map text ->\nu8',
  // beyond the stamped 72 (reached when a gate draws more): further boundaries
  'map text -> ' + arrows(15), 'map ->x -> text', 'map text -> -> text', 'text ', '\u000btext', 'text　',
  'record[a:u8]', 'u8|i8', 'U8', 'list[u8x]', 'u160', 'list[map a -> u8]', ';', 'json | list[text]', 'json | none',
  'tuple[json] | tuple[text]', 'record[a: text] | record[b: text]', 'list[json|bytes] | list[text|bytes]',
  'list[list[json]] | list[list[f64]]', 'record[r: text | none | text]', 'map[text, u8 | u8]', '_u8', 'record[]',
  'list[text, text]', 'map[text]', 'record[a: record[u32: i32]]', 'map\r\ntext\r\n->\r\nu8', 'map\ttext\t->\ttext', 'map text -> u8 ; x ; y', 'json | tuple[text]', 'json | record[a: text]', '\n\rmap\n\rtext\n\r->\n\ru8\n\r', 'list[u8\r]',
  'map[text,\nu16\n]', 'record[a: u8\n| none]', '\u00a0u8', 'map\u00a0text -> u8', 'list[>u8]',
];

const SCALARS = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json', 'u8', 'u16', 'u32', 'i8', 'i16', 'i32'];
const NAMES = ['a', 'b', 'key', 'value', 'u8', 'i32', 'name_u16', 'x1', '_id', 'text', 'map'];
const WS = ['', ' ', '  ', '\t', '\n', ' \t', '\r', '\r\n', '\n '];

function genType(rnd, d) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const w = () => (rnd() < 0.25 ? pick(WS) : '');
  const r = rnd();
  if (d <= 0 || r < 0.35) return pick(SCALARS);
  if (r < 0.5) return `list${w()}[${w()}${genType(rnd, d - 1)}${w()}]`;
  if (r < 0.62) { const k = 1 + Math.floor(rnd() * 3); return `tuple[${Array.from({ length: k }, () => genType(rnd, d - 1)).join(`${w()},${w() || ' '}`)}]`; }
  if (r < 0.74) return `map[${genType(rnd, d - 1)}, ${genType(rnd, d - 1)}]`;
  if (r < 0.86) { const k = 1 + Math.floor(rnd() * 3); const ns = []; while (ns.length < k) { const nm = pick(NAMES); if (!ns.includes(nm)) ns.push(nm); } return `record[${ns.map((nm) => `${nm}${w()}:${w() || ' '}${genType(rnd, d - 1)}`).join(', ')}]`; }
  const k = 2 + Math.floor(rnd() * 2); return Array.from({ length: k }, () => genType(rnd, d - 1)).join(`${w() || ' '}|${w() || ' '}`);
}

function genShape(rnd) {
  const r = rnd();
  let body;
  if (r < 0.05) return nest(14 + Math.floor(rnd() * 5), genType(rnd, 1));   // around the 16-deep boundary (R7)
  if (r < 0.45) {
    // the arrow spelling, sometimes nested on the value side
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const run = () => pick([' ', ' ', '\t', '\n', '\r\n', ' \n']), gap = () => pick([' ', ' ', '', '\n', '\t']);
    body = `map${run()}${genType(rnd, 2)}${gap()}->${gap()}${rnd() < 0.3 ? `map${run()}${genType(rnd, 1)}${gap()}->${gap()}${genType(rnd, 2)}` : genType(rnd, 2)}`;
  } else body = genType(rnd, 3);
  if (rnd() < 0.2) body = `${['', ' ', '\t', '\n', '\r\n'][Math.floor(rnd() * 5)]}${body}${['', '  ', '\n', '\r\n'][Math.floor(rnd() * 4)]}`;
  if (rnd() < 0.3) body += `; ${['a lookup table', 'x -> y', 'u8 | u8', ''][Math.floor(rnd() * 4)]}`;
  return body;
}

export function genInputs(n, rnd) {
  const out = CURATED.map((s) => [s]);
  while (out.length < n) out.push([genShape(rnd)]);
  return out;
}
