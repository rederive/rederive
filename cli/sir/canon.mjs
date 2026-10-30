// SIR canonical vector form v1 — typed, lossless, language-neutral (design move 3, DECIDED 2026-09-22).
// The superset is of the SIR's ABSTRACT TYPES, keyed by the SIG — never the union of native quirks (those are ENVELOPE facts).
// NaN rule: canonicalized at encode time to the quiet NaN 7ff8000000000000 (any payload, either sign) → NaN == NaN;
// f64 equality is bit equality after that; -0 ≠ +0; ±Inf distinct; `none` is a value that equals only `none`.
import { createHash } from 'node:crypto';
export const ENCODING = 'sir-canonical-v1';
export const TYPES = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];   // closed, versioned — like the language registry. json = none|bool|f64|text|list[json]|map[text,json] (NO undefined/functions/dates: those are envelope facts)
const QNAN = 0x7ff8000000000000n;
const HEX16 = /^[0-9a-f]{16}$/;   // ONE rule for f64 bits: f64fromBits and canonicalString both read it (selfhost f64_from_bits #48)
export function f64bits(x) { if (Number.isNaN(x)) return QNAN; const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return d.getBigUint64(0); }
// exactly the 16 lowercase hex digits encode emits (selfhost f64_from_bits: BigInt('0x'+hex) took any length — 20 digits wrapped
// mod 2^64 so two bit strings decoded to one value — plus uppercase, short and trailing-whitespace forms)
export function f64fromBits(hex) { if (typeof hex !== 'string' || !HEX16.test(hex)) throw new Error(`f64 bits must be 16 lowercase hex digits (got ${JSON.stringify(hex)})`); const d = new DataView(new ArrayBuffer(8)); d.setBigUint64(0, BigInt('0x' + hex)); return d.getFloat64(0); }
const hex16 = (b) => b.toString(16).padStart(16, '0');
const INT = /^(?:0|-?[1-9][0-9]*)$/;   // a canonical decimal integer: no "-0", no leading zeros
const f64str = (x) => Number.isNaN(x) ? 'NaN' : x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : Object.is(x, -0) ? '-0' : String(x);

// ---- SIG type grammar — ONE strict recursive-descent reader for types and SIGs (2026-10-26; rederive's self re-derivation,
// selfhost parse_type + parse_sig, found the old splitter accepted `record[text]` as a field named "tex", stray brackets,
// dropped extra list/map parts, left `list[]` with an undefined item, merged `text || none`, and ended a SIG's argument list at
// the LAST `)`). Grammar (ONE whitespace rule: ASCII space, tab, CR, LF, optional between any two tokens and required only
// where two words would otherwise run together — `pub fn`, `list [text]`, `... xs` all read as their tokens; selfhost
// parse_sig/parse_type round 2, #44: the prefix was a literal match and `list [` threw while `list[ text ]` passed):
//   type   := alt ('|' alt)*                       a union when 2+ alternatives, never the same alternative twice
//                                                  (`none | none` was a two-way union of nones — #44)
//   alt    := text | bytes | bool | none | i64 | u64 | f64 | json
//           | tuple[type (, type)*] | list[type] | map[type, type] | record[ident: type (, ident: type)*]   (unique field names)
//   sig    := [pub fn | export default function] ident ( [param (, param)*] ) (-> | :) type
//   param  := [...]ident: type                     a rest parameter only last; unique names;  ident := [A-Za-z_][A-Za-z0-9_]*
// Composite types nest at most MAX_DEPTH deep — deeper is a grammar error, not the host's stack overflow (#44; ~2,962 on a
// default Node stack, and a Rust port aborts). No real SIG nests past 4 (every SIG in the corpus measured, round 5). 16, so a
// parsed type — up to 5 value levels per type level, a record of unions — is itself a value the codec carries (#78).
const MAX_DEPTH = 16;
// a type's identity: unions are SETS of alternatives and records sets of named fields (#65) — never their spelling order
const KEYS = new WeakMap();   // memoized (round 5b, #101: nested unions on both sides made coverage exponential — 4 s on a 4.5 KB SIG)
const typeKey = (t) => { let k = KEYS.get(t); if (k === undefined) { k = typeKeyOf(t); KEYS.set(t, k); } return k; };
const typeKeyOf = (t) => t.k === 'union' ? `union{${t.alts.map(typeKey).sort().join('|')}}` : t.k === 'record' ? `record{${t.fields.map(([n, f]) => `${n}:${typeKey(f)}`).sort().join(',')}}`
  : t.k === 'tuple' ? `tuple[${t.items.map(typeKey).join(',')}]` : t.k === 'list' ? `list[${typeKey(t.item)}]` : t.k === 'map' ? `map[${typeKey(t.key)},${typeKey(t.val)}]` : t.k;
const sameType = (a, b) => typeKey(a) === typeKey(b);
// does `json` accept every value of t? json = none|bool|f64|text|list[json]|map[text,json] (TYPES) — and, by what encode REACHES
// (round 5, #79), a tuple or a record of json-accepted parts: encode tries json first and takes the array / plain object
const inJson = (t) => ['none', 'bool', 'f64', 'text', 'json'].includes(t.k) || ((t.k === 'list') && inJson(t.item)) || (t.k === 'tuple' && t.items.every(inJson))
  || (t.k === 'map' && t.key.k === 'text' && inJson(t.val)) || (t.k === 'record' && t.fields.every(([, f]) => inJson(f))) || (t.k === 'union' && t.alts.every(inJson));
// does an earlier alternative a accept every value of a later b? STRUCTURAL (round 5, #74: coverage stopped at the top level, so
// `list[json] | list[text]` parsed): pointwise through list / tuple / map, and a record covers one with at least its fields
// (record encode reads only its own fields, so `record[a: text] | record[a: text, b: none]` is unreachable too)
const COVERS = new Map();
const covers = (a, b) => { const key = typeKey(a) + '\u0000' + typeKey(b); let r = COVERS.get(key); if (r === undefined) { r = coversOf(a, b); if (COVERS.size > 50000) COVERS.clear(); COVERS.set(key, r); } return r; };
const coversOf = (a, b) => sameType(a, b) || (a.k === 'json' && inJson(b))
  || (a.k === 'list' && b.k === 'list' && covers(a.item, b.item))
  || (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length && a.items.every((x, i) => covers(x, b.items[i])))
  || (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val))
  || (a.k === 'record' && b.k === 'record' && a.fields.every(([n, f]) => b.fields.some(([m, g]) => m === n && covers(f, g))))
  || (a.k === 'union' && a.alts.some((x) => covers(x, b))) || (b.k === 'union' && b.alts.every((y) => covers(a, y)));
function reader(src) {
  let i = 0, depth = 0;
  const ws = () => { while (i < src.length && ' \t\r\n'.includes(src[i])) i++; };
  const fail = (what) => { throw new Error(`${what} at ${i} in ${JSON.stringify(src)}`); };
  const eat = (tok) => { ws(); if (src.startsWith(tok, i)) { i += tok.length; return true; } return false; };
  const expect = (tok) => { if (!eat(tok)) fail(`expected '${tok}'`); };
  const ident = () => { ws(); const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)); if (!m) fail('expected an identifier'); i += m[0].length; return m[0]; };
  const list = (item) => { const out = [item()]; while (eat(',')) out.push(item()); return out; };
  function alt() {
    const word = ident();
    if (TYPES.includes(word)) return { k: word };
    if (!['tuple', 'list', 'map', 'record'].includes(word)) fail(`unknown abstract type '${word}' (closed set: ${TYPES.join(', ')}, tuple[…], list[…], map[…], record[…])`);
    if (++depth > MAX_DEPTH) fail(`types nest deeper than ${MAX_DEPTH}`);
    expect('[');
    let node;
    if (word === 'record') {
      const fields = list(() => { const n = ident(); expect(':'); return [n, type()]; });
      const names = fields.map(([n]) => n); if (new Set(names).size !== names.length) fail('duplicate record field');
      node = { k: 'record', fields };
    } else {
      const parts = list(type);
      if (word === 'list' && parts.length !== 1) fail('list takes exactly one type');
      if (word === 'map' && parts.length !== 2) fail('map takes exactly two types');
      node = word === 'tuple' ? { k: 'tuple', items: parts } : word === 'list' ? { k: 'list', item: parts[0] } : { k: 'map', key: parts[0], val: parts[1] };
    }
    expect(']'); depth--; return node;
  }
  function type() {
    const alts = [alt()]; while (eat('|')) alts.push(alt());
    // an alternative is UNREACHABLE when an earlier one accepts every value it does: the same type up to union order and record
    // field order (#65: the check compared spellings, so `list[text|none] | list[none|text]` passed), or one json covers
    // (`json | text`: encode tries json first, so text never matched)
    for (let j = 1; j < alts.length; j++) for (let k = 0; k < j; k++) if (covers(alts[k], alts[j])) fail(alts[k].k === alts[j].k && sameType(alts[k], alts[j]) ? 'a union names the same alternative twice' : `a union alternative is unreachable: an earlier ${alts[k].k} accepts every value it does`);
    return alts.length > 1 ? { k: 'union', alts } : alts[0];
  }
  function sig() {
    // the prefix is its words as tokens (any grammar whitespace between them), and a prefix only when the function name follows
    // after whitespace: `pub(fn: text)` is a function named pub, a bare `pub fn` is a name with no argument list
    const prefix = (words) => { const at = i; for (const w of words) { ws(); const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)); if (!m || m[0] !== w) { i = at; return false; } i += m[0].length; }
      if (!' \t\r\n'.includes(src[i] ?? '#') || !/^[ \t\r\n]*[A-Za-z_]/.test(src.slice(i))) { i = at; return false; } return true; };
    if (!prefix(['pub', 'fn'])) prefix(['export', 'default', 'function']);
    const name = ident(); expect('(');
    const args = [];
    if (!eat(')')) { for (;;) { const rest = eat('...'); const n = ident(); expect(':'); args.push({ name: n, type: type(), ...(rest ? { rest: true } : {}) }); if (eat(')')) break; expect(','); } }
    const ri = args.findIndex((a) => a.rest); if (ri >= 0 && ri !== args.length - 1) fail('a rest parameter must be last');
    if (new Set(args.map((a) => a.name)).size !== args.length) fail('duplicate parameter name');
    if (!eat('->') && !eat(':')) fail("expected '->' or ':' before the result type");
    return { name, args, result: type() };
  }
  const done = (v) => { ws(); if (i !== src.length) fail('unexpected text'); return v; };
  return { type: () => done(type()), sig: () => done(sig()) };
}
export function parseType(s) { if (typeof s !== 'string') throw new Error('a type is text'); return reader(s).type(); }
export function parseSig(s) { if (typeof s !== 'string') throw new Error('bad SIG: not text'); try { return reader(s).sig(); } catch (e) { throw new Error('bad SIG: ' + e.message); } }

// ---- encode: native value (or a v0.4 codec-tagged legacy value) → tagged canonical value, BY TYPE
// an escaped user map, once unwrapped, is a VALUE: its own __t / __throw keys are data and must never read as a tag again
// (a union tries each alternative on the same value; selfhost Tier 1 #26)
const UNWRAPPED = new WeakSet();
// ONE plain-object rule for the whole codec (selfhost encode_value #38: record/map took a null-prototype object, json refused it):
// a non-array object whose prototype is Object.prototype or null. ONE marker rule: a codec marker (__t / __throw / __threw) is an
// OWN text-valued key of a plain object that is not an unwrapped user map — an array never carries one (the __throw check took
// an array, the __threw check did not).
const plainObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const marker = (v, key) => plainObj(v) && Object.hasOwn(v, key) && typeof v[key] === 'string' && !UNWRAPPED.has(v);
const isLegacy = (v) => marker(v, '__t');
// a THROW marker is EXACTLY one own key — the shape every driver writes and the stamp records (#55 #58: the encoder took any map
// with a text __threw, other keys ignored, while the stamp's check was exact-shape)
const throwMarker = (v, key) => marker(v, key) && Object.keys(v).length === 1;
export const isLegacyThrow = (v) => throwMarker(v, '__throw');
export const isThrowMarker = (v) => throwMarker(v, '__threw');
/** A driver's RESULT, made safe to grade: every plain map that carries a codec marker key (__t / __throw / __threw, as an OWN
 *  key, at any depth) is escaped as {__t:'obj', v} — the legacy codec's #31 escape — so a value an artifact RETURNS can never
 *  read as a tag or a throw (#55 #58: an artifact echoing the map {"__threw": "x"} was graded as a throw). Drivers call it on
 *  every successful result; their own throw is the unescaped {__threw: msg}. Non-plain values (Map, Uint8Array…) pass through. */
export function escapeMarkers(v, depth = 0) {
  if (depth > MAX_VALUE_DEPTH) throw new Error(`a value nests deeper than ${MAX_VALUE_DEPTH}`);
  if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) if (i in v) a[i] = escapeMarkers(v[i], depth + 1); return a; }
  // a JS Map is a container encode reads under map[K, V], so its keys and values are escaped too (round 5, selfhost escape_markers
  // #1: `new Map([['a', {__throw: 'boom'}]])` passed through unescaped and graded a throw inside the map)
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [escapeMarkers(k, depth + 1), escapeMarkers(x, depth + 1)]));
  // a Set too, since the js-native codec reads its members (#152 → #153: `new Set([{__t:'bigint', v:'1'}])` graded as `new Set([1n])`)
  if (v instanceof Set) return new Set([...v].map((x) => escapeMarkers(x, depth + 1)));
  if (!plainObj(v)) return v;
  const o = {}; for (const k of Object.keys(v)) Object.defineProperty(o, k, { value: escapeMarkers(v[k], depth + 1), enumerable: true, writable: true, configurable: true });
  return ['__t', '__throw', '__threw'].some((k) => Object.hasOwn(v, k)) ? { __t: 'obj', v: o } : o;
}
// ONE value-nesting cap for the codec, counted ONE way everywhere (round 5, #78): the whole value is depth 0 and each child
// VALUE — a list / tuple element, a map key or value, a record field value — is one deeper; unions and the json position add
// nothing. A value deeper than MAX_VALUE_DEPTH throws, in encode, decode and escapeMarkers alike. 100: above anything the type
// grammar yields as a value (a MAX_DEPTH-deep record of unions parses to 5 × 16 + 3 levels), and under every transport — the
// rust harness reads its args line with serde_json, whose limit is 128; round 4's 1024 sat above the JS stack (canonicalString
// overflowed at ~1,600 raw levels) and above serde_json, so neither the cap nor its boundary could be graded. (For the codec units
// themselves — encode / decode / canonicalString — an at-cap value's own encoded tree is deeper than the cap, so their boundary is
// graded through the js extension only; every other unit's values reach every transport.)
export const MAX_VALUE_DEPTH = 100;
// canonicalString walks the RAW tree: a value node is up to 3 raw levels per value level (node → v list → [key, value] entry),
// plus the vector-set wrapper — 4 × MAX_VALUE_DEPTH + 16 covers it with room, and stays far inside the host stack.
const RAW_CAP = 4 * MAX_VALUE_DEPTH + 16;
function legacyToNative(v) {
  if (!isLegacy(v)) return v;
  switch (v.__t) {
    // strict (selfhost f64_bits: Number(v) turned {__t:'num', v:'abc'} into NaN, and '' into 0, with no error)
    case 'num': if (['NaN', 'Infinity', '-Infinity', '-0'].includes(v.v)) return v.v === 'NaN' ? NaN : v.v === 'Infinity' ? Infinity : v.v === '-Infinity' ? -Infinity : -0;
      // a finite literal whose value is not -0: '1e999' (Infinity) and '-0.0' (-0) are second spellings of values that have their
      // own (selfhost encode_value #36)
      // a finite spelling is a VALUE, not a spelling (`1000`, `1E3`, `1000.0` are one number: the canonical form re-spells it);
      // a literal with a non-zero digit that underflows to zero is refused in either sign (#66: 1e-400 gave 0, -1e-400 threw)
      if (typeof v.v === 'string' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(v.v)) { const n = Number(v.v);
        if (n === 0 && /[1-9]/.test(v.v.replace(/[eE].*$/, ''))) throw new Error(`legacy num tag: ${JSON.stringify(v.v)} underflows to zero`);
        if (Number.isFinite(n) && !Object.is(n, -0)) return n; throw new Error(`legacy num tag: ${JSON.stringify(v.v)} is ${Object.is(n, -0) ? '-0' : n} — that value has its own spelling`); }
      throw new Error(`legacy num tag: not a number literal ${JSON.stringify(v.v)}`);
    case 'bigint': if (typeof v.v === 'string' && INT.test(v.v)) return BigInt(v.v); throw new Error(`legacy bigint tag: not a decimal integer ${JSON.stringify(v.v)} (one spelling: no -0, no leading zeros)`);
    case 'undef': return undefined;
    case 'obj': { if (!plainObj(v.v)) throw new Error(`legacy obj tag: v must be a plain map (got ${v.v === null ? 'null' : Array.isArray(v.v) ? 'a list' : typeof v.v})`); const o = {}; for (const k of Object.keys(v.v)) Object.defineProperty(o, k, { value: v.v[k], enumerable: true, writable: true, configurable: true }); UNWRAPPED.add(o); return o; }   // an escaped user map (its values stay legacy-tagged)
    default: throw new Error(`legacy codec tag '${v.__t}' has no language-neutral meaning — an ENVELOPE fact, not a value`);
  }
}
// canonical text = Unicode scalar values (cu:'utf8'). A lone surrogate has no utf8 form: the NEUTRAL encoder rejects it (an
// envelope fact), while a language's own extension may hold it tagged cu:'utf16' — the tag is the honesty, never a silent pass.
function textTag(s, opts) { if (s.isWellFormed()) return { t: 'text', v: s, cu: 'utf8' }; if (opts.utf16) return { t: 'text', v: s, cu: 'utf16' }; throw new Error('not well-formed Unicode (lone surrogate) — UTF-16 only, no utf8 form'); }
export const encodeJsNative = (value, type) => encode(value, type, { utf16: true });   // the js/ts ENVELOPE EXTENSION codec
export function encode(value, type, opts = {}) {
  // a THROW is an observation, not a value: `{__throw: msg}` (legacy) or a driver's `{__threw: msg}` → {t:'throw', msg}.
  // Throw-ness is the language-neutral claim; the message is a display hint (excluded from the canonical string).
  if (isLegacyThrow(value)) return { t: 'throw', msg: value.__throw };
  if (isThrowMarker(value)) return { t: 'throw', msg: value.__threw };
  const depth = opts.depth ?? 0; if (depth > MAX_VALUE_DEPTH) throw new Error(`a value nests deeper than ${MAX_VALUE_DEPTH}`);
  const child = { ...opts, depth: depth + 1 };   // a child VALUE is one deeper; a union alternative or the json position is the same value
  // a record is a plain object, its fields OWN properties (selfhost encode_value: fields were read through the prototype chain —
  // `constructor` threw, `__proto__` read Object.prototype — and arrays passed as records)
  const plain = plainObj;
  if (type.k === 'record') { value = legacyToNative(value); if (!plain(value)) throw new Error('not record'); return { t: 'record', v: type.fields.map(([name, ft]) => [name, encode(Object.hasOwn(value, name) ? value[name] : undefined, ft, child)]) }; }
  if (type.k === 'json') return encodeJson(value, opts);   // encodeJson reads legacy tags itself (the js-native path keeps u8 as bytes)
  value = legacyToNative(value);
  switch (type.k) {
    case 'union': { let last; for (const alt of type.alts) { try { return encode(value, alt, opts); } catch (e) { last = e; } } throw new Error(`fits no alternative: ${last?.message}`); }
    case 'none': if (value === null || value === undefined) return { t: 'none' }; throw new Error('not none');
    case 'bool': if (typeof value === 'boolean') return { t: 'bool', v: value }; throw new Error('not bool');
    case 'text': if (typeof value === 'string') return textTag(value, opts); throw new Error('not text');
    case 'bytes': if (value instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(value).toString('base64') }; throw new Error('not bytes');
    case 'f64': if (typeof value === 'number') return { t: 'f64', v: f64str(value), bits: hex16(f64bits(value)) }; throw new Error(`not f64: ${String(value)}`);
    case 'i64': case 'u64': {
      let b; if (typeof value === 'bigint') b = value; else if (typeof value === 'number' && Number.isInteger(value)) b = BigInt(value); else throw new Error(`not ${type.k}: ${String(value)} (NaN/Inf/fraction can never occupy an integer slot — envelope violation)`);
      const lo = type.k === 'i64' ? -(2n ** 63n) : 0n, hi = type.k === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n; if (b < lo || b > hi) throw new Error(`${type.k} out of range: ${b}`);
      return { t: type.k, v: b.toString() };
    }
    case 'tuple': if (!Array.isArray(value) || value.length !== type.items.length) throw new Error('not tuple'); return { t: 'tuple', v: value.map((x, i) => encode(x, type.items[i], child)) };
    case 'list': if (!Array.isArray(value)) throw new Error('not list'); return { t: 'list', v: value.map((x) => encode(x, type.item, child)) };
    case 'map': { if (!(value instanceof Map) && !plain(value)) throw new Error('not map'); const ents = value instanceof Map ? [...value] : Object.entries(value); // ONE entry order for every map (selfhost encode_value #28): a text key by its UTF-16 code units — the json-map and
      // canonical-string key rule — any other key by its canonical string. (The old map[K,V] order compared the escaped canonical
      // string, which differs for prefixes and escaped characters; no existing oracle's 1,339 multi-entry maps changed order.)
      const sortKey = (k) => (k.t === 'text' ? k.v : canonicalString(k));
      return { t: 'map', v: ents.map(([k, x]) => [encode(k, type.key, child), encode(x, type.val, child)]).sort((a, b) => { const x = sortKey(a[0]), y = sortKey(b[0]); return x < y ? -1 : x > y ? 1 : 0; }) }; }
  }
  throw new Error('bad type ' + JSON.stringify(type));
}
function encodeJson(v, opts = {}) {
  const depth = opts.depth ?? 0; if (depth > MAX_VALUE_DEPTH) throw new Error(`a value nests deeper than ${MAX_VALUE_DEPTH}`);
  const child = { ...opts, depth: depth + 1 };
  // js-native codec ONLY (the js/ts envelope extension): a bigint and bytes are host values a js/ts artifact can return under
  // `json`; the neutral codec has no such values (selfhost decode_value: the extension could not encode them, so every artifact
  // of a unit returning one could never verify)
  if (opts.utf16 && isLegacy(v) && v.__t === 'u8') return { t: 'bytes', v: 'base64:' + Buffer.from(v.bytes).toString('base64') };
  v = legacyToNative(v);
  if (opts.utf16 && typeof v === 'bigint') return { t: 'bigint', v: v.toString() };
  if (opts.utf16 && v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
  // js-native codec ONLY (#152): a Map / Set a js/ts artifact returns under `json` (selfhost escape_markers: escapeMarkers descends
  // into Maps, so its results ARE Maps, and the extension could not encode one — the unit could never verify). Insertion order is
  // kept: it is observable in the host. The neutral codec still refuses both (an envelope fact).
  if (opts.utf16 && v instanceof Map) return { t: 'jsmap', v: [...v].map(([k, x]) => [encodeJson(k, child), encodeJson(x, child)]) };
  if (opts.utf16 && v instanceof Set) return { t: 'jsset', v: [...v].map((x) => encodeJson(x, child)) };
  if (v === undefined && opts.utf16) return { t: 'undefined' };   // js-native codec ONLY: the host's present-but-valueless marker; the neutral codec has no such value
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return { t: 'f64', v: f64str(v), bits: hex16(f64bits(v)) };
  if (typeof v === 'string') return textTag(v, opts);
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) if (!(i in v) && !opts.utf16) throw new Error('json: sparse array (hole) — a JS envelope fact'); return { t: 'list', v: Array.from(v, (x) => encodeJson(x, child)) }; }   // js-native: a hole reads as undefined (the package reads it so too)
  if (plainObj(v)) return { t: 'map', v: Object.entries(v).map(([k, x]) => [textTag(k, opts), encodeJson(x, child)]).sort((a, b) => (a[0].v < b[0].v ? -1 : a[0].v > b[0].v ? 1 : 0)) };
  throw new Error(`json: ${v === undefined ? 'undefined' : typeof v === 'function' ? 'a function' : Object.prototype.toString.call(v)} has no language-neutral meaning — an envelope fact`);
}
// ---- decode: tagged → native JS value (the js/ts drivers' ABI: f64 → number from BITS, i64 → number when safe else BigInt)
// decode accepts EXACTLY what encode emits (selfhost decode_value, 2026-10-26: it coerced anything — {t:'bool', v:'hello'} gave
// "hello", i64 read " 12\n", "", "0x1F", true; no range check; malformed base64 decoded silently; JS-stringified map keys so
// -0 and 0 collided). Anything else is not a canonical tree and throws. Map keys must be text (a js/ts artifact receives a map
// as an object); entries are defined as OWN properties, so a "__proto__" key is a key, never a prototype.
const isNode = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && typeof x.t === 'string';
const BASE64 = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
// round 2 (#34): ONE text per value — no "-0" integer (bigint -0 decoded to 0n, so encode∘decode moved it), no NaN but the
// canonical one, no base64 with non-zero padding bits (AR== ≡ AQ==), every node exactly its keys, no repeated map key or field
const NODE_KEYS = { none: ['t'], undefined: ['t'], bool: ['t', 'v'], text: ['t', 'v', 'cu'], bigint: ['t', 'v'], bytes: ['t', 'v'], f64: ['t', 'v', 'bits'], i64: ['t', 'v'], u64: ['t', 'v'], tuple: ['t', 'v'], list: ['t', 'v'], map: ['t', 'v'], record: ['t', 'v'], throw: ['t', 'msg'] };
const defineOwn = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
export function decode(tv, depth = 0) {
  const bad = (why) => { throw new Error(`not a canonical tree: ${why}`); };
  if (depth > MAX_VALUE_DEPTH) bad(`a value nests deeper than ${MAX_VALUE_DEPTH}`);   // the root node is depth 0, each child node one deeper
  const sub = (x) => decode(x, depth + 1);
  if (!isNode(tv)) bad('a node is a map with a text t');
  const keys = Object.hasOwn(NODE_KEYS, tv.t) ? NODE_KEYS[tv.t] : null; if (!keys) bad(`unknown tag ${JSON.stringify(tv.t)}`);   // an OWN key (#66: {t:'constructor'} read Object's)
  const extra = Object.keys(tv).filter((k) => !keys.includes(k)); if (extra.length) bad(`a ${tv.t} node has only ${keys.join(', ')} (got ${extra.join(', ')})`);
  switch (tv.t) {
    case 'none': return null;
    case 'bool': if (typeof tv.v !== 'boolean') bad('bool v'); return tv.v;
    case 'text': if (typeof tv.v !== 'string' || !['utf8', 'utf16'].includes(tv.cu)) bad('text v/cu'); if (tv.cu === 'utf8' && !tv.v.isWellFormed()) bad('utf8 text holding a lone surrogate');
      if (tv.cu === 'utf16' && tv.v.isWellFormed()) bad('utf16 text that is well-formed (its one spelling is cu utf8)'); return tv.v;   // #66
    case 'undefined': return undefined;   // the js-native extension's own tags (encodeJsNative)
    case 'bigint': if (typeof tv.v !== 'string' || !INT.test(tv.v)) bad('bigint v must be a decimal string'); return BigInt(tv.v);
    case 'bytes': { if (typeof tv.v !== 'string' || !BASE64.test(tv.v)) bad('bytes v must be base64:<canonical base64>'); const b = Buffer.from(tv.v.slice(7), 'base64');
      if ('base64:' + b.toString('base64') !== tv.v) bad('bytes base64 has non-zero padding bits (a second spelling)'); return new Uint8Array(b); }
    case 'f64': { if (typeof tv.v !== 'string') bad('an f64 node carries its display v'); const x = f64fromBits(tv.bits);
      if (Number.isNaN(x) && tv.bits !== hex16(QNAN)) bad(`f64 NaN bits must be the canonical ${hex16(QNAN)} (got ${tv.bits})`); return x; }
    case 'i64': case 'u64': {
      if (typeof tv.v !== 'string' || !INT.test(tv.v)) bad(`${tv.t} v must be a decimal string`);
      const b = BigInt(tv.v), lo = tv.t === 'i64' ? -(2n ** 63n) : 0n, hi = tv.t === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      if (b < lo || b > hi) bad(`${tv.t} out of range: ${tv.v}`);
      return b >= -(2n ** 53n) && b <= 2n ** 53n ? Number(b) : b;
    }
    case 'tuple': case 'list': if (!Array.isArray(tv.v)) bad(`${tv.t} v must be a list`); return tv.v.map(sub);
    case 'map': { if (!Array.isArray(tv.v)) bad('map v must be a list'); const o = {}; let prev;
      for (const e of tv.v) { if (!Array.isArray(e) || e.length !== 2) bad('a map entry is [key, value]'); const k = sub(e[0]); if (typeof k !== 'string') bad('map keys reach a js/ts artifact as object keys: text only'); if (Object.hasOwn(o, k)) bad(`repeated map key ${JSON.stringify(k)}`); if (prev !== undefined && !(prev < k)) bad(`map entries out of canonical order at ${JSON.stringify(k)}`); prev = k; defineOwn(o, k, sub(e[1])); }
      return o; }
    case 'record': { if (!Array.isArray(tv.v)) bad('record v must be a list'); const o = {};
      for (const e of tv.v) { if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string' || !e[0].isWellFormed()) bad('a record field is [name, value], its name well-formed text'); if (Object.hasOwn(o, e[0])) bad(`repeated record field ${JSON.stringify(e[0])}`); defineOwn(o, e[0], sub(e[1])); }
      return o; }
    case 'throw': if (typeof tv.msg !== 'string') bad('a throw node carries its msg as text'); if (depth + 1 > MAX_VALUE_DEPTH) bad(`a value nests deeper than ${MAX_VALUE_DEPTH}`); return { __threw: tv.msg };   // its map's msg is one value deeper (#117)
  }
  bad(`unknown tag ${JSON.stringify(tv.t)}`);
}
/** human display of a tagged value (NaN-safe — JSON.stringify would print null) */
export function display(tv) {
  // round 5 (selfhost display_value): a record field name that is not a plain identifier is QUOTED (`{"a:1, b":2}` displayed as
  // the two-field `{a:1, b:2}`), and a bigint shows its digits (every one displayed `?`)
  const fieldName = (n) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : JSON.stringify(n));
  switch (tv.t) { case 'throw': return `throw(${JSON.stringify(tv.msg ?? '')})`; case 'record': return '{' + tv.v.map(([n, x]) => fieldName(n) + ':' + display(x)).join(', ') + '}'; case 'bigint': return `${tv.v}n`; case 'none': return 'null'; case 'undefined': return 'undefined'; case 'text': return JSON.stringify(tv.v); case 'f64': case 'i64': case 'u64': return tv.v; case 'bool': return String(tv.v); case 'bytes': return tv.v;
    case 'tuple': case 'list': return '[' + tv.v.map(display).join(',') + ']'; case 'map': return '{' + tv.v.map(([k, x]) => display(k) + ':' + display(x)).join(',') + '}'; }
  return '?';
}
// ---- canonical string (sorted keys, compact) — equality and hashing both run on it
// SPEC: for f64 the BITS are normative and `v` is a display hint — shortest-roundtrip renderings differ across languages
// (Python repr(255.0) = '255.0', JS '255'; 1e-7 vs 1e-07), so the canonical string carries {bits, t} only. Found by the Python
// implementation (sanity check 2026-09-22).
// DOMAIN: a canonical tree — strings, booleans, arrays and plain maps, nothing else (every number is a tagged value: {t:'f64',
// bits} / {t:'i64', v:'<decimal>'}; none is {t:'none'}). `t` is a reserved key: a map whose t is 'f64' IS an f64 value (only
// its bits count, which must be 16 lowercase hex) and a map whose t is 'throw' IS a throw observation (nothing else counts).
// Anything outside the domain THROWS: before 2026-10-26 it rendered — {t:'f64'} as the invalid JSON {"bits":undefined,…},
// NaN as null, -0 as 0, a hole as `,,` — so no other language could reproduce it (found by rederive's own re-derivation,
// selfhost/units/canonical_string; the strict domain hashes every one of the 35 existing canonical oracles identically).
// Keys sort by UTF-16 code units (the JS default sort); strings escape exactly as JSON.stringify does.
export function canonicalString(x, depth = 0) {
  if (depth > RAW_CAP) throw new Error(`not canonical: nests deeper than ${RAW_CAP} levels (the codec's ${MAX_VALUE_DEPTH}-value cap)`);
  const cs = (y) => canonicalString(y, depth + 1);
  if (typeof x === 'string') return JSON.stringify(x);
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) if (!(i in x)) throw new Error('not canonical: an array hole'); return '[' + x.map(cs).join(',') + ']'; }
  if (plainObj(x)) {
    if (x.t === 'f64' && !(typeof x.bits === 'string' && HEX16.test(x.bits))) throw new Error('not canonical: an f64 tag without 16-hex bits');
    const o = x.t === 'f64' ? { t: 'f64', bits: x.bits } : x.t === 'throw' ? { t: 'throw' } : x;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + cs(o[k])).join(',') + '}';
  }
  throw new Error(`not canonical: ${x === null ? 'null' : x === undefined ? 'undefined' : typeof x === 'object' ? Object.prototype.toString.call(x) : typeof x}`);
}
export const eqCanonical = (a, b) => canonicalString(a) === canonicalString(b);
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const vectorSetSha = (o) => sha256(canonicalString({ frozen: o.frozen.map((c) => ({ args: c.args, expected: c.expected })), heldout: o.heldout.map((c) => ({ args: c.args, expected: c.expected })) }));
