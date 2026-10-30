// ts_sig_of input generator (round 5b; round 5k adds the brace-depth ; probes, #158): a ts language file's SIG line (one text arg). Curated prefix first (every branch,
// every refusal, the literal mask, the BLANK-only whitespace rule, every bracket trap), then a seeded fill built from SIG
// parts, mostly in-domain.
const OTHER_WS = ['\n', '\v', '\f', '\r', '\u00a0', '\u1680', '\u2000', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f',
  '\u3000', '\ufeff'];
const NOT_WS = ['\u0085', '\u200b', '\u180e', '\u2060'];   // look-alikes that are NOT in the WS set

const CURATED = [
  // FROZEN slice (the first 24): the real test's shapes, then one probe per rule and refusal
  'export default function bytes(value: unknown, options?: unknown): string | number | null',
  'export function pick<T>(xs: readonly T[], f: (x: T) => boolean): T | null',
  'export const x = 1',
  'export default function f(a: string)',
  'export   default\tfunction\t\tf(a: string):\tstring',
  ' \t export function f(a: string): string \t ',
  'export function f<T extends (x: number) => void>(a: T): T',
  "export function f<T extends '>'>(a: T, b: \"(\"): T",
  'export function f(a: "x;y=z//`", b: \'it\\\'s ) any\'): "never"',
  'export function f(): string = impl as never; //',
  'export function f(a: string): string; export const g = 1',
  'export function f(): any',
  'export function f(...a: never[]): unknown',
  'export function f(a: x.any, b: $never, c: company): s',
  'export function f(a: typeof x): s',
  'export function f\u00a0(a): s',
  'export function f(a)\n: string',
  'export function f(): ',
  'export function f(a: "unterminated): s',
  // round 5k (#158): a ';' at brace depth > 0 is an object type's member separator; only a top-level ';' refuses
  'export function f(): { a: number; b: boolean }',
  'export function f(o: { a: string; b?: number }): void',
  'export function f(): { a: number }; s',
  'export function f(): { a: number }}; s',
  'export function f(): s } { a; b }',
  // HELD-OUT curated: the traps the rules must carry without a teaching vector
  'export function f<T>\t (a: T): T',
  'export function f(a: T = 1): string',
  'export function caf\u00e9(): string',
  'export function f(a: string): s\u2029t',
  'export function f(): : x, y',
  'export function f(): { a; b',
  'export function f(a: "{"): s; t',
  'export function f(): { a: "};"; b: 1 }',
  'export function f<T extends { a: 1; b: 2 }>(x: T): T',
  'export function f(): { a: { b: 1; }; c: 2 }',
  'export function f(): { a: 1; b = 2 }',
  'export function f(): { a: never; }',
  'export function f(); : { a; }',
  'export function f(a: { any: string }): s',
  'export function f():\u00a0\ufeff',
  'export function f(): import("m").T',
  'export function f<T>(a: T): T extends Array<infer U> ? U : T',
  'export function f(a: x.typeof, b: importer, c: infers, d: $infer, e: Typeof): s',
  'export function typeof(): s',
  'export function f(a: "x\u2028y typeof z", b: \'\u2029\'): s',
  'export function f(...a: (string & number)[]): ReturnType<typeof JSON.parse>',
  'export function f(...a: (string & number)[]): unknown, x: T',
  'export function f<>(): s',
  'export function f<T>x(): s',
  'export function f<T>>(a): s',
  'export function f<T = number>(a: T): T',
  'export function f(a: (b: number) => string): (c: d) => e',
  'export function f(): s ==> t',
  'export function f(): a >= b',
  'export function f(): s /* c */',
  'export function f(): `t`',
  'export function f(): s\u2028',
  'export function f():\u000bstring',
  'export function f():\u0085',
  'export function f(a): string\u0085',
  'export function f(): s. any',
  'export function f(): \u00e9any',
  'export function f(): anyX | xnever | never_ | any$',
  'export function any(): s',
  'export function f(a: "a\\"b)"): s',
  'export function f(a: \'a"b)\'): s',
  'export function f(a: "a\nb;"): s',
  'export function f(a: "a\\\nb;"): s',
  'export function f(a: "a\\\u2028b"): s',
  'export function f(a: "a\\\u0085b)"): s',
  'export function f(a: "x\\"): s',
  'export function f(a: "\\\\", b: ")"): s',
  'export function f(a: "x\\")"): s',
  'export function f(a: \'\'): ""',
  'export function f(a: "\ud83d\ude00)", b: number): "\ud83d\ude00"',
  '\ufeffexport function f(): s',
  'export\u00a0function f(): s',
  'export async function f(): Promise<string>',
  'export default function (): s',
  'export function default(): s',
  '',
  'export function f(...rest: readonly string[]): number',
  'export function f<A, B extends keyof A>(a: A, b: B): A[B]',
];

const pick = (rnd, xs) => xs[Math.floor(rnd() * xs.length)];
const blank = (rnd) => (rnd() < 0.8 ? ' ' : '\t');
const blankRun = (rnd, min) => { let s = ''; const n = min + Math.floor(rnd() * 3 * (rnd() < 0.3 ? 1 : 0.4)); for (let i = 0; i < n; i++) s += blank(rnd); return s; };
const ws1 = (rnd, chaos) => (chaos && rnd() < 0.3 ? pick(rnd, rnd() < 0.7 ? OTHER_WS : NOT_WS) : blank(rnd));
const NAMES = ['f', 'bytes', 'pick', 'ts_sig_of', '$x', '_y', 'a1', 'camelCase', '$', '_', 'x$y_z9', 'anyway', 'nevermore'];
const LITS = ['"a>b"', "'<'", '"("', "')'", '"x;y"', '"a=b"', '"//"', '"/*"', "'any'", '"never"', '"a\\"b"', "'it\\'s'",
  '"`"', '""', "''", '"=>"', '"\\\\"'];
const BAD_LITS = ['"open', "'open", '"a\\\nb"', '"a\\'];
const TYPES = ['string', 'number', 'boolean', 'unknown', 'T', 'string | null', 'readonly string[]', 'Array<number>',
  '[number, number]', 'Record<string, number>', '(x: T) => boolean', '{ a: string, b?: number }', '{ a: string; b: number }', 'Map<string, T[]>',
  'void', '(string | number)[]', 'keyof T', 'T.any', 'x.never', 'company', 'Foo$any', 'x.typeof', 'importer', 'inferred'];
const BAD_TYPES = ['never', 'any', 'string; x', 'T = 1', 'a >= b', '`t`', '{ a: string }; x', '} ; x', '(a', 'a)', '. any',
  'typeof x', 'import("m").T', 'T extends [infer U] ? U : T', 's\u2028t', '\u2029'];
const GENS = ['', '', '', '<T>', '<T, U>', '<T extends string>', '<K extends keyof T, T>', '<>', '<T extends (x: T) => U>',
  '<T extends ">">', "<T extends '<'>"];
const BAD_GENS = ['<T = Array<number>>', '<T', '<T<U>', '<T extends "x>'];
const RETS = ['string', 'number | null', 'void', 'T', 'readonly [number, number, number] | null', '(a: T) => U',
  '{ exportName: string | null, fnType: string }', '{ exportName: string | null; fnType: string }', 'Promise<void>', 'unknown', 'x, y', ': x'];
const BAD_RETS = ['any', 'never', '', 'string; const q = 1', 'x => y = z', 's // c', '\u00a0', 's\n', '{ a: 1 }; x', 's }; { t'];

function typ(rnd, chaos) {
  const r = rnd();
  if (chaos && r < 0.25) return pick(rnd, rnd() < 0.5 ? BAD_TYPES : BAD_LITS);
  if (r < 0.3) return pick(rnd, LITS);
  if (r < 0.4) return `${pick(rnd, LITS)} | ${pick(rnd, TYPES)}`;
  return pick(rnd, TYPES);
}

function build(rnd) {
  const chaos = rnd() < 0.25;
  const def = rnd() < 0.4;
  let s = ''; if (rnd() < 0.15) s += ws1(rnd, chaos);
  s += 'export' + blankRun(rnd, 1) + (def ? 'default' + blankRun(rnd, 1) : '') + 'function' + blankRun(rnd, 1) + pick(rnd, NAMES);
  if (rnd() < 0.2) s += chaos ? ws1(rnd, true) : blankRun(rnd, 1);
  const g = chaos && rnd() < 0.3 ? pick(rnd, BAD_GENS) : pick(rnd, GENS); s += g;
  if (g && rnd() < 0.3) s += chaos ? ws1(rnd, true) : blankRun(rnd, 1);
  const np = Math.floor(rnd() * 4); const ps = [];
  for (let i = 0; i < np; i++) ps.push(`${String.fromCharCode(97 + i)}${rnd() < 0.2 ? '?' : ''}: ${typ(rnd, chaos)}`);
  let params = '(' + ps.join(', ') + ')';
  const r = rnd();
  if (chaos && r < 0.15) params = params.slice(0, -1);         // unbalanced
  else if (chaos && r < 0.25) params = params.replace('(', ''); // no list
  s += params;
  if (rnd() < 0.25) s += chaos ? ws1(rnd, true) : blankRun(rnd, 1);
  if (!chaos || rnd() > 0.2) s += ':';
  if (rnd() < 0.85) s += rnd() < 0.85 ? ' ' : (chaos ? ws1(rnd, true) : '\t');
  const rr = rnd();
  s += chaos && rr < 0.4 ? pick(rnd, BAD_RETS) : rr < 0.25 ? pick(rnd, LITS) : pick(rnd, RETS);
  if (rnd() < 0.15) s += chaos ? ws1(rnd, true) : blankRun(rnd, 1);
  return s;
}

export function genInputs(n, rnd) {
  const out = CURATED.map((s) => [s]);
  while (out.length < n + 32) out.push([build(rnd)]);
  return out;
}
