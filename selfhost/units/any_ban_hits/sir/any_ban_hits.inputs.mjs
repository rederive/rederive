// Input generator for any_ban_hits: one argument, a TypeScript-ish source text. Curated prefix first (each case packs
// several probes, one per line, so line numbering, dedup and per-line order are exercised together), then a seeded fill
// assembled from a fragment vocabulary mixing the three ban kinds with every lexical construct of the scan: line/block
// comments, the two quotes and their escapes, templates and nested interpolations, regex literals versus division,
// braces, keywords, the whitespace set (and U+200B / U+0085 / U+180E), directive case variants, backslash-CRLF, and line
// terminators other than LF. Only well-formed Unicode text is emitted.
const CURATED = [
  '',
  'const a = (1 as any);\n',
  'const n = m.get(k)!.size;\n',
  '// @ts-ignore\nconst x: number = "s";\n',
  '// rows 7-8: any callable\nconst s = "x: any";\n',
  // round 5c: every WS character and U+200B end a word; U+0085 / U+180E do not (and U+0085 still escapes: FINDINGS)
  'x:\u00a0any\nb as\u3000any\n<\u2003any\u2003>\ny:\u200bany\nz:\ufeffany\ufeff\nw:\u1680any\nv:\u205fany\nu:\u202fany\nt:\u2009any\ns:\u200aany\nq:\u0085any\nr as\u0085any\np:\u180eany\no.\u200bany\n{ any\u00a0: 1 }\n{ any\u200b: 1 }\n(\u3000any: T)\nx = a\u2028/re: any/\n\u200b/x: any/',
  // round 5c: directives in any ASCII case, no boundary; non-ASCII look-alikes are not directives
  '// @TS-IGNORE\n// @Ts-Expect-Error\n// @TS-NoCheck\n/* @ts-IGNORED */\n// x@ts-nocheckx\n// @ts-expect-errors\n// @ts-nochec\u212a\n// @t\u017f-ignore\n// @ts-\u0131gnore\n/* a\n @TS-EXPECT-ERROR */ x: any\n"// @ts-ignore"',
  // round 5d: U+0085 ends a word; the KEY test skips blanks, U+0085 and U+200B (since 5f never a line break)
  'x:\u0085any\nr as\u0085any\nf(<\u0085any>1)\nRecord<string,\u0085any>\n{ any\u0085: 1 }\n{ any\u200b: 1 }\n{ any\u00a0: 1 }\n{ any\n: 1 }\ntype C<T> = T extends string ?\n  any\n  : never;\nc ? x as\nany\n: 2\n\u180eany\nq.\u0085any\n( \u0085any: T)',
  // round 5d: a directive also matches the full-Unicode lowercase; block-comment line from the larger index
  '// @ts-nochec\u212a\n/* @ts-nochec\u212a\n\n @ts-ignore */\n/* @ts-ignore\n\n @ts-nochec\u212a */\n/* \u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130@ts-ignore\n */ x\n/* \u0130@ts-nochec\u212a\n */\n// @ts-\u0130gnore\n// @t\u017f-ignore\n/* \u0130\u0130 @TS-IGNORE */',
  // round 5f (#148): the 5d N1-N4 escapes, one per line group — conditional types and "as" across lines, ++ / block comment /
  // keyword-property before a line-opening "/" (every regex BODY is now also lexed as code)
  'export type C<T> = T extends string ?\n  any\n  : never;\ndeclare const c: boolean; declare const x: number;\nexport const v = c ? x as\nany\n: 2;\nexport type D<T> = T extends string\n  ? number\n  : T extends number ?\n    any\n    : never;\nlet n = 1; const b = 2, g = 3;\nexport const z = n++\n/ b; export let y: any = 1; export const w = 1 /g\nconst a = 4;\nexport const z2 = a /*\n*/ / b; export let y2: any = 1; export const w2 = 1 /g\nexport const z3 = a /* c\n*/\n/ b; export let y3: any = 1; export const w3 = 1 /g\nexport const z4 = o.in\n/ b; export let y4: any = 1; export const w4 = 1 /g',
  // round 5f: a regex BODY is lexed as code from fresh state, hits at the opening line; nested; escaped LF; key test stops at a break
  'const r = /x: any/;\nconst s = /any: 1/;\nconst t = /a!/g;\nreturn /<any>z/\nf(/[/]any as any/)\n= /a\\\nb: any/ q\n= /(?:x)\\/ any/\ntypeof /\\/\\/ @ts-ignore/\n( /=/ y as any/ )\n{ any\r: 1 }\n{ any : 1 }\n{ any \u0085​\t: 1 }\n{ any\n  ?: 1 }',
  // round 5f FINDINGS: a misread regex whose closing "/" sits inside a string or template desynchronizes the scan (escapes)
  'const a = 4, b = 2;\nexport const z = a /*\n*/ / b; export const c = "x/"; export let y: any = 1;\nlet n = 1;\nexport const z2 = n++\n/ b; export const c2 = `x/`; export let y2: any = 1;\nexport const t = `\n`;\nexport const z3 = o.in\n/ b; export const c3 = "/"; export let y3: any = 1;',
  // round 5g (#149): the REST SCAN after a regex at an all-blank CONTEXT — its hits at later lines, the stable line sort,
  // a body with an escaped LF read twice, nested line-start regexes, a regex after a comment; then the escapes it misses (FINDINGS)
  "/'/ x: any\n y!\n/a\\\nb: any/\n  /x/ /'/ z: any\n/*c*/ /'/ w as any\n`\n` /'/ v!\nq = /'/ u: any\n/\"/; s: any\n/x/g; t: any\n",
  'const of = 4, b = 2;\nexport const z = of / b; export const c = "x/"; export let y: any = 1;\ndeclare const o: { in: number };\nexport const z2 = o.in / b; export const c2 = "x/"; export let y2: any = 1;\nexport const z3 = of / b; export const c3 = `x/`;\nexport let y3: any = 1;\nexport const t = `\n`;',
  // round 5h (#150): a CERTAIN regex (after punctuation) holding a quote gets no REST SCAN; a GUESSED one (keyword row) does
  "x = /\"/; y: any\nf(/'/, z!)\n[/`/]; w as any\nq = a ? /'/ : b; v: any\nreturn /'/; u: any\n r!\nc = o.in /'/; t: any\nd = o. in /\"/; s: any\ne = ..in /'/ p: any\n$in /'/ m: any\nxof /'/ k: any\ntypeof /`/; h: any\n`\n",
  // every label, dedup on one line, and per-line order
  'f(<any>x)!; let q: any = y as any; type T = any; // @ts-expect-error',
  'let a: any, b: any; c!; d!;\nx as any as any',
  // the word any: excused members and keys, and the labels
  'o.any\no?.any\no. any\n...any\n{ any: 1 }\nf(any?: T)\n{ any : 1 }\nany\t?:\nany ? a : b\nc ? any : d\nany? :x',
  'x:any\nx:  any[]\nx: anyThing\nx: any_\nx: any$q\n9any\néany\n$any\nx:\tany\nRecord<string, any>\n',
  'a as any\na as\u00a0any\na as\u0085any\nhas any\n$as any\n_as any\nimport { foo as any } from "m";\nb as anyway\nx.as any\nasany',
  'f(<any>x)\nArray< any >\nPromise<any>\nMap<any, string>\nArray<any[]>\n< any\n>\n<any\u0085>\n<ANY>',
  'x:\u00a0any\nx:\ufeffany\nx:\u0085any\nx:\u180eany\nx:\u3000any\nx:\u2003any\nx:\u000bany\nx:\u000cany\nx:\u202fany\nx:\u2028any',
  // non-null assertion: hits and misses
  'f(x)!.y\na]! ,\nx!\nx! ;\nx![0]\nx!()\n_!.a\n9!.a\n$!.a\né!.a\n"s"!.length\n\'s\'!\nlet z!: number;',
  'return !x\ntypeof !x\nx = !y\n(!x).y\nx != y\nx!== y\nx !.y\nx!!.y\nx\u00a0!\nx\r!\nin!\nnew!\nextends !x\nreturns!\na.return!',
  'x/*c*/!\nx/*\n*/!\n`t`!\nx`t`!\nf(`t`)!\n`${a}`!\n/re/!\nx /re/!',
  // directives live in comments only
  '// @ts-nocheck\nconst s = "@ts-ignore";\n/* @ts-expect-error */\n@ts-ignored\n// @TS-IGNORE\n`@ts-expect-error`\n// @ts-ignored\n// @ts-ignore-next\n/*@ts-ignore*/\n// x@ts-nocheck$',
  '/* line 1\n @ts-ignore on line 2 */ x: any\n/* @ts-ignore\n@ts-ignore */ y!.z',
  // block comments: unterminated, "/*/", multi-line, context reset
  '/* x: any\n y as any\n <any> */ z: any\n/*/ a: any */\n/*/ b: any\n',
  'x: /*c*/ any\nas/**/any\n/**/x: any\n<any/**/>\n/* unterminated\nx: any\n',
  // strings: escapes, unterminated, the other quote, comment openers inside
  '"abc\\"" x: any\n\'it\\\'s\' x: any\nit\'s x: any \'q\'\n"a\\\\" y: any\n"no close x: any\n"a/*b" c: any "*/"\n',
  '"a\\\nb" x: any\ny: any\n\'c\\\nd\'!\nz: any',
  '"a\\\rb" x: any "c"\n"a\rb" y: any\n\'\' z: any\n"x\u2028y" q: any\n"tail\\',
  // templates: text, interpolation, nesting, braces, escapes
  '`x: any ${y as any} z!.w`\n`a ${ {k: any}.k } b` c: any\n`${`${q!}`}` r: any\n`\\${x as any}` s: any',
  'const t = `\nx: any\n`;\nconst u = `a`; v: any\n`a\\\nb` w: any\n`unterminated x: any\ny: any',
  '} `${x}` y: any\n`${ } }` z: any\n{ `${a}` } b: any\n`${"}"} c: any` d: any',
  // regex literals versus division
  "const re = /\\//; const x: any = 1;\nconst re = /'/; let y: any; // it's\nconst q = /<any>/;\nx = a / b / c; d: any\n",
  'return /a: any/\ntypeof /x!/\ny = (/[/]any/)\nf(a) / any\nx]/2/ any\n/any/g.test(s)\n/unclosed any\n= /a\\\nb/ c: any\nd: any',
  'case /x/: any\nin /x/\nxin /a/ any\na.new /x/ any\n} /x/ any\n"s" /x/ any\n`t` /x/ any\n/*c*/ /x/ any\nx /=/ any',
  // line comments and line terminators that are not LF
  '// c\u2028x: any\n// c\rx: any\nx: any // y as any\n"//" z: any\nhttp://x: any\na /* // */ b: any',
  // CRLF file and trailing newline
  'const a: any = 1;\r\nconst b = c!;\r\nconst d = e!.f;\r\n// @ts-ignore\r\n',
  'line1\n/*\n\n*/\nx: any\n\n\ny as any\n',
  '// see /* here\nconst x: any = 1;\n// */\nconst y: any = 2;\n',
  // astral and non-ASCII text around tokens
  '\u{1F600}!\n"\\\u{1F600}" x: any\n`\\\u{1F600}` y: any\n/\\\u{1F600}/ z: any\n\u{1F600}any',
  // round 5b: whole word tokens (digits and every non-ASCII char, non-ASCII spaces included, are word chars)
  '9any\nany9\néany\nanyé\nx:\u00a0any\nb as\u3000any\ny: any\ufeff= 1\nz:\u2028any\n\u{1F600}any\u{1F600}\nx: \u3000 any\nq.\u00a0 any',
  // round 5b: the member exception is a single "." ; the key exception needs a key position before the word
  '...any\n..any\no.any\no?.any\no . any\nc ? any : d\n{ any!: 1 }\nf(any?: T)\nf(a, any: T)\n; any :1\n"s", any: 1\nx = any: 1\n/*c*/ any: 1\nx /*c*/ any: 1\n  any : never\n[any]: 1',
  // round 5b: ++ / -- and a template end before "/" divide; "!" after a template, a keyword-named property, a non-ASCII word
  'n++ / 2 / any\nn-- /a/ any\nn+ + /a/ any\nx = --/a/ any\n`t` / 2 / any\n`${a}` /x/ any\n`t`!\no.return!.y\nc.extends!\néin!\nx.in / 2; y: any / 3',
  // round 5b: an escaped LF in a string advances the line; a block comment's directive is reported at its own line
  '"a\\\nb" x: any\n\'c\\\nd\' y!.z\n/* one\n two\n @ts-ignore */ w: any\n/* @ts-ignored\n @ts-nocheck\n @ts-ignore */\n"a\\\r\nb"; v: any',
  // escapes the lint misses (FINDINGS): CR-only lines, LS in a line comment, directive spellings TypeScript honors, ?<LF> any :
  'const k = 1; // c\rlet x: any = 1;\r\n// c\u2028let y: any = 1;\n// @ts-ignorex\n// @ts-expect-errors\n// @TS-NOCHECK\ntype C<T> = T extends string ?\n  any : never;',
  // round 5c: a line comment ends at CR, U+2028, U+2029 (the rest of the line is code; LINE counts LF only)
  '// c\rx: any\n// c\u2028y as any\n// c\u2029z!.w\n// @ts-ignore\r\n// c\r\nq: any\n// c\r// @ts-nocheck\rr: any\n// c\u2028/re: any/\n',
  // round 5c: backslash-CRLF continues a string (both quotes); a template / regex / lone CR do what they did
  '"a\\\r\nb" x: any\n\'c\\\r\nd\' y!.z\n"e\\\r\n" w: any\n`f\\\r\ng` v: any\n= /h\\\r\n/ u: any\n"i\\\rj" t: any\n"k\\\r\r\nl" s: any\n"tail\\\r\n',
  // CRLF file with continuations, comments and every label
  '"a\\\r\nb"; const a: any = 1;\r\n// @TS-NOCHECK\r\nconst b = c!;\r\n/* x\r\n */ d as any\r\nlet e = <any>f;\r\n',
];

const FRAG = [
  'x: any', 'x:any', 'y as any', 'f(<any>z)', 'n!.p', 'g(a)!;', 'arr]!,', 'v!', 'v![0]', 'ok', 'const k = 1;',
  'any', 'any:', 'any?:', '.any', 'type T = any', 'Record<string, any>', 'return', 'typeof', 'in', 'new', 'case',
  '// @ts-ignore', '/* @ts-expect-error */', '// @ts-nocheck', '"@ts-ignore"', '// c', '/*', '*/', '/* x: any */',
  '"', "'", '`', '${', '}', '{', '`${', '}`', '"s: any"', "'t as any'", '`u!.v`', '`${w as any}`', '\\', '\\"',
  '"a\\"b"', "it's", '//', 'http://h', '/re!./', '/[/]/', '/\'/', '/', ' / ', '/ any/', 'a / b', '=', '(', ')', '[',
  ']', ',', ';', ':', '?', '<', '>', '.', '!', '!=', '!==', '!x', 'x != y',
  ' ', '\t', '\u00a0', '\u0085', '\ufeff', '\u3000', '\r', '\u2028', '\u2029', 'é', '$', '9', 'anyway', 'has any', 'as',
  ': ', 'as ', '<any>', '\u{1F600}',
  '...any', '..', '++', '--', ' / 2', '`t`', '"a\\\nb"', 'any!:', 'any!', '? any :', 'o.return!', 'any9', '9any', 'xany', 'é',
  '/* a\n @ts-ignore */', '/*\n*/', '{ any: 1 }', ', any?: T', '; ', '\u2003',
  '\u200b', '\u180e', '\u1680', '\u205f', '\u202f', '\u2009', '// @TS-Ignore', '// @ts-nocheckx', '/* @TS-EXPECT-ERROR */',
  '// c\r', '// c\u2028', '"a\\\r\nb"', "'a\\\r\n'", 'any\u00a0:', '\u3000any', 'as\u00a0', ':\ufeff', '\u212a', '\u017f',
  '\u0130', '@ts-nochec\u212a', 'any\u0085:', '\nany\n:', 'a\n/ b: any /', 'n++\n/', ')\n/', '"s"\n/', '`t`\n/', 'o.in\n/',
];

function rndSrc(rnd) {
  const lines = 1 + Math.floor(rnd() * 8); const out = [];
  for (let i = 0; i < lines; i++) {
    const k = Math.floor(rnd() * 7); let l = '';
    for (let j = 0; j < k; j++) { l += FRAG[Math.floor(rnd() * FRAG.length)]; if (rnd() < 0.4) l += ' '; }
    out.push(l);
  }
  return out.join(rnd() < 0.15 ? '\r\n' : '\n') + (rnd() < 0.3 ? '\n' : '');
}

export function genInputs(n, rnd) {
  const out = CURATED.map((s) => [s]);
  while (out.length < n) out.push([rndSrc(rnd)]);
  return out;
}
