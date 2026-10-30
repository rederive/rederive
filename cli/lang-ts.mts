// The verifier-owned TypeScript driver (SIR_V05_PLAN Phase 2): what `rdv check` runs for a `lang:ts` variant.
//
//   type-checked     — the artifact compiles under `tsc --strict` AND is assignable to its language file's SIG (a one-line
//                      conformance shim: `const conforms: <SIG as a function type> = impl`), with no `any`, no non-null
//                      assertions and no @ts-ignore / @ts-expect-error (strict mode accepts all three, so they are linted).
//                      A widened return type or a narrowed parameter is a compile error in the shim, not a runtime miss.
//   harness-verified — the emitted JavaScript then grades through the SAME held-out path as every JS variant (gradeVs).
//
// The compiler is the CONSUMER'S, never bundled: rdv has no runtime dependencies, and a trust-nothing verifier should not
// ship a 20 MB compiler it would then have to be trusted for. It is resolved from the bundle's directory, then the working
// directory; without one, `ts` is not harnessed on this machine and a lang:ts bundle halts with the install hint.
// It is run as a process (`node <typescript>/bin/tsc`), not imported, so TypeScript 5 (JS compiler) and 7 (native) both work.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

export type Tsc = { bin: string; version: string; typesRoot?: string | null };

/** The consumer's TypeScript compiler, or null. Searched from each dir in order (node's own resolution, walking upward). */
export function findTsc(fromDirs: string[]): Tsc | null {
  for (const d of fromDirs) {
    try {
      const pkgPath = createRequire(join(resolve(d), 'noop.js')).resolve('typescript/package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.tsc;
      if (!rel) continue;
      const bin = join(dirname(pkgPath), rel);
      if (existsSync(bin)) return { bin, version: String(pkg.version), typesRoot: findTypesRoot(fromDirs) };
    } catch { /* not resolvable from here */ }
  }
  return null;
}

/** The @types directory holding Node's definitions (@types/node), resolved like the compiler — or null. An artifact runs on
 *  Node and may import its built-ins (node:crypto); without the definitions tsc rejects every such import, which is the
 *  consumer's missing toolchain, never the artifact's error (selfhost vector_set_sha, 2026-10-26). */
export function findTypesRoot(fromDirs: string[]): string | null {
  for (const d of fromDirs) {
    try { return dirname(dirname(createRequire(join(resolve(d), 'noop.js')).resolve('@types/node/package.json'))); } catch { /* not here */ }
  }
  return null;
}
export const NODE_TYPES_MISSING = /error TS2591: Cannot find name '[^']+'\. Do you need to install type definitions for node\?/;

// The any-ban lints CODE positions only (the lab's scar: a `// rows 7-8: any callable` comment failed a correct artifact). Round 5
// of rederive's self re-derivation (selfhost any_ban_hits) found the old three-regex mask let real escapes through — `type T =
// any`, `Record<string, any>`, `x!` at a line end or before `[`/`(`, `${x as any}` inside a template, a `/*` inside a string
// masking the code after it, a regex literal's quote or `//` shifting the mask, `@ts-nocheck` — and hit correct code (a string
// mentioning @ts-ignore). So ONE lexer pass: strings and template TEXT are not code (a template's `${…}` IS), comments are
// not code (but are where the @ts- directives live), a regex literal is not code. On the code that remains:
//   any                 the word `any` — any type position (a member `.any` and an object key `any:` excepted)
//   non-null assertion  a postfix `!` on the same line as the operand it follows (an identifier, `)`, `]`, a quote — never
//                       after a keyword like `return`), not part of `!=` / `!==`; `let x!: T` included
//   @ts-ignore          a comment carrying @ts-ignore, @ts-expect-error or @ts-nocheck
// Hits are `<what>@<line>` with lines counted by LF, in source order, one per (what, line).
// a word character is ASCII word or any non-ASCII code unit EXCEPT what TypeScript skips as whitespace or a line break (#134: the
// #112 class made `x:\u00a0any` one long word, so a real any escaped)
const WORD = /(?![\s\u0085\u200b])[\w$\u0080-\uffff]/;   // U+0085: TypeScript skips it too, JS \s does not (round 5c N1)
const KEYWORDS_BEFORE_PREFIX = new Set(['return', 'typeof', 'void', 'in', 'of', 'case', 'delete', 'await', 'yield', 'throw', 'else', 'do', 'instanceof', 'new', 'extends']);
const REGEX_AFTER = /(?:^|[(,=:[!&|?{};+\-*%<>~^])\s*$|(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
export function anyBanHits(src: string): string[] { return scanBan(src, new Map()); }
function scanBan(src: string, rest: Map<number, string[]>): string[] {
  const hits: string[] = []; const seen = new Set<string>(); let line = 1;
  const hit = (w: string, ln: number) => { const k = `${w}@${ln}`; if (!seen.has(k)) { seen.add(k); hits.push(k); } };
  let code = '';   // the code seen so far on THIS line (for regex-vs-divide and postfix-! context), masked text as spaces
  const braces: number[] = [];   // template nesting: a `${` pushes the brace depth it opened at
  let depth = 0;
  const n = src.length; let i = 0;
  const DIRECTIVE = /@ts-(?:ignore|expect-error)|@ts-nocheck/i;   // as tsc reads them: no word boundary, nocheck in any case (#134)
  // tsc 5 lower-cases a directive the full Unicode way (`@ts-nochec\u212A` with a Kelvin sign is honored): read both (round 5c N2)
  const comment = (text: string, ln: number) => { if (DIRECTIVE.test(text) || DIRECTIVE.test(text.toLowerCase())) hit('@ts-ignore', ln); };
  const template = () => {   // at a backtick or after a `}` closing a `${`: scan template text to `${` or the closing backtick
    for (; i < n; i++) {
      const c = src[i];
      if (c === '\\') { i++; if (src[i] === '\n') { line++; } continue; }
      if (c === '\n') { line++; code = ''; continue; }
      if (c === '`') { i++; code += '`'; return; }   // a template is an OPERAND for what follows (#112: `t` / 2 read a regex)
      if (c === '$' && src[i + 1] === '{') { i += 2; braces.push(depth); depth++; code += ' '; return; }
    }
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') { line++; code = ''; i++; continue; }
    if (c === '/' && d === '/') { let end = i; while (end < n && !'\n\r\u2028\u2029'.includes(src[end])) end++; comment(src.slice(i, end), line); i = end; continue; }   // a line comment ends at any line terminator (#134)
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; const text = src.slice(i, end); { const low = text.toLowerCase(); const at = Math.max(text.search(DIRECTIVE), low.search(DIRECTIVE)); if (at >= 0) hit('@ts-ignore', line + ((text.search(DIRECTIVE) >= 0 ? text : low).slice(0, at).match(/\n/g) || []).length); } line += (text.match(/\n/g) || []).length; if (text.includes('\n')) code = ''; i = end; code += ' '; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\' && src[j + 1] === '\n') line++; if (src[j] === '\\' && src[j + 1] === '\r' && src[j + 2] === '\n') { line++; j += 3; continue; } j += src[j] === '\\' ? 2 : 1; } i = j < n && src[j] === c ? j + 1 : j; code += '"'; continue; }
    if (c === '`') { i++; template(); continue; }
    if (c === '/' && REGEX_AFTER.test(code) && !/(?:\+\+|--)\s*$/.test(code)) {   // `n++ / 2` divides (#112)   // a regex literal: to the closing unescaped `/` outside a class, then flags
      // a `/` opening a line after an OPERAND may be a divide (`a\n/ b; … any … /g`): fail closed — the rest of the line is ALSO
      // read as code, and any hit there counts (round 5c N3: the regex reading hid a real any)
      // round 5e (#148): regex-vs-divide is a GUESS a lexer cannot always win (`n++\n/ b`, `a /*\n*/ / b`, `o.in\n/ b`), so the
      // guess never hides code — the body of every regex literal read here is ALSO lexed as code and its hits count (fail closed;
      // a regex spelling `any` as a word is refused, which only costs a rewrite)
      let j = i + 1, cls = false; while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; }
      // round 5f (#149, #150): any `/` read as a regex may be a DIVIDE whose misread "closing" slash sits
      // in a string, putting every later quote out of step — so the REST OF THE SOURCE is also scanned from just after it as code,
      // and both readings' hits count. Memoized by suffix length: each suffix is scanned at most once — O(regexes × length), quadratic only for a file that is mostly regex literals.
      if (j < n && src[j] === '/' && (!code.trim() || /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$|\.\s*(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/.test(code))) {   /* #150: every GUESSED regex — a line start, or after a word that may be an identifier (`of / b`, `o.in / b`); after punctuation (`= /"/`) it is certain */
        const key = n - (i + 1); let hs = rest.get(key); if (!hs) { rest.set(key, []); hs = scanBan(src.slice(i + 1), rest); rest.set(key, hs); }
        for (const h of hs) { const at = h.lastIndexOf('@'); hit(h.slice(0, at), line + Number(h.slice(at + 1)) - 1); }
      }
      if (j < n && src[j] === '/') { for (const h of anyBanHits(src.slice(i + 1, j))) hit(h.slice(0, h.lastIndexOf('@')), line); j++; while (j < n && /[a-z]/i.test(src[j])) j++; i = j; code += ' '; continue; }
    }
    if (c === '{') depth++;
    if (c === '}') { if (braces.length && braces[braces.length - 1] === depth - 1) { braces.pop(); depth--; i++; template(); continue; } depth--; }
    if (WORD.test(c)) {   // a whole word token (#112: `9any` / `éany` read `any` from inside a word)
      let j = i + 1; while (j < n && WORD.test(src[j])) j++; const w = src.slice(i, j);
      // not a member `.any` (a spread `...any` IS a type), not a key / parameter `any:` (also `any!:` / `any?:`) — and only in a
      // key position: after `{`, `(`, `,`, `;` or the line start (#112: `? any :` is a conditional type's branch)
      const member = /(?<!\.)\.\s*$/.test(code); const keyed = /^(?:[^\S\n\r\u2028\u2029]|[\u0085\u200b])*[!?]?:/.test(src.slice(j))   /* never across a line break (#148: `?\n  any\n  : never` read as a key) */ && /(?:^|[{(,;])\s*$/.test(code);
      if (w === 'any' && !member && !keyed)
        hit(/\bas\s*$/.test(code) ? 'as any' : /<\s*$/.test(code) && /^\s*>/.test(src.slice(j)) ? '<any>' : /:\s*$/.test(code) ? ': any' : 'any', line);
      code += w; i = j; continue;
    }
    if (c === '!' && d !== '=') {
      const before = code.replace(/[ \t]+$/, ''); const word = before.match(/[\w$]+$/)?.[0];
      if (before && /[\w$)\]"\u0080-\uffff]$/.test(before) && !(word && KEYWORDS_BEFORE_PREFIX.has(word))) hit('non-null assertion', line);
    }
    code += c; i++;
  }
  return hits.sort((a, b) => Number(a.split('@').pop()) - Number(b.split('@').pop()));
}

/** A language file's SIG (`export default function f<T>(a: A, b?: B): R`, or a named `export function f…`) as the export it
 *  names and the function TYPE it declares (`<T>(a: A, b?: B) => R`). Throws on any other shape: a SIG rdv cannot read is a
 *  contract it cannot check. The fnType is pasted into the conformance check, so it must be ONE type and nothing else (round 5,
 *  selfhost ts_sig_of F1: `…: string = impl as never; //` made a number -> number artifact "conform"); it is held to the
 *  artifact's own any-ban, and `never` is refused with it (F2: `(...a: never[]): unknown` accepted every artifact). Brackets
 *  inside a string literal type, and the `>` of an `=>`, never close a bracket (F3); whitespace is a space or a tab (F4). */
export function sigOf(sig: string): { exportName: string | null; fnType: string } {
  const s = sig.replace(/^[ \t]+|[ \t]+$/g, '');
  const m = s.match(/^export[ \t]+(default[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*/);
  if (!m) throw new Error(`SIG is not an exported function declaration: ${sig}`);
  const code = s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (q) => '"' + ' '.repeat(q.length - 2) + '"');   // literal types masked, same length
  // a `;` INSIDE an object type literal is a member separator (`(): { a: number; b: boolean }`), never a statement end — only a
  // `;` at brace depth 0 ends the declaration (#158: nine verified units' SIGs were refused by rdv, accepted by the lab)
  let braceDepth = 0; const top = [...code].map((ch) => { if (ch === '{') braceDepth++; else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1); return ch === ';' && braceDepth > 0 ? ' ' : ch; }).join('');
  if (/[;`\r\n\u2028\u2029]|\/\/|\/\*|\*\/|=(?!>)/.test(top)) throw new Error(`SIG is more than one declaration (a ; = comment or line break outside a literal type): ${sig}`);
  if (/(?:^|[^\w$.])(?:any|never)(?![\w$])/.test(code)) throw new Error(`SIG uses any or never, which every artifact satisfies: ${sig}`);
  // a SIG may not reach the artifact or a library value's type (round 5b, #114: `Parameters<typeof impl>`, `ReturnType<typeof JSON.parse>`)
  if (/(?:^|[^\w$.])(?:typeof|import|infer)(?![\w$])/.test(code)) throw new Error(`SIG uses typeof / import / infer — a contract type names no value: ${sig}`);
  let i = m[0].length; let generics = '';
  if (code[i] === '<') { const end = matchClose(code, i, '<', '>'); generics = s.slice(i, end + 1); i = end + 1; }
  while (code[i] === ' ' || code[i] === '\t') i++;
  if (code[i] !== '(') throw new Error(`SIG has no parameter list: ${sig}`);
  const close = matchClose(code, i, '(', ')');
  const params = s.slice(i, close + 1); const rest = s.slice(close + 1).replace(/^[ \t]+/, '');
  if (!rest.startsWith(':') || !rest.slice(1).trim()) throw new Error(`SIG declares no return type: ${sig}`);
  return { exportName: m[1] ? null : m[2], fnType: `${generics}${params} => ${rest.slice(1).replace(/^[ \t]+/, '')}` };
}
function matchClose(s: string, at: number, open: string, close: string): number {
  let depth = 0;
  for (let i = at; i < s.length; i++) { if (s[i] === open) depth++; else if (s[i] === close && !(close === '>' && s[i - 1] === '=') && --depth === 0) return i; }
  throw new Error(`unbalanced ${open}${close} in SIG: ${s}`);
}

// --target = the ES lib of the Node the harness RUNS on: es2022 rejected a correct String.prototype.isWellFormed on Node 24
// (TS2550; selfhost encode_value round 2, ts emit_3) — a type error the runtime never has. Node 22+ implements ES2024 in
// full; an older Node keeps es2022, so the type-check never promises an API the grading runtime lacks.
const ES_TARGET = Number(process.versions.node.split('.')[0]) >= 22 ? 'es2024' : 'es2022';
const FLAGS = ['--strict', '--target', ES_TARGET, '--module', 'esnext', '--moduleResolution', 'bundler', '--skipLibCheck'];
const typeFlags = (tsc: Tsc) => tsc.typesRoot ? ['--typeRoots', tsc.typesRoot, '--types', 'node'] : [];
const run = (tsc: Tsc, cwd: string, args: string[]) => {
  const r = spawnSync(process.execPath, [tsc.bin, ...args], { cwd, encoding: 'utf-8' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};
const firstLines = (s: string, n = 4) => s.split('\n').filter(Boolean).slice(0, n).join(' | ');

export type TsPrepared = { typeCheck: { ok: boolean; report: string; toolchainMissing?: boolean }; emitted: string | null; work: string; cleanup: () => void };

/** Type-check `srcAbs` against `sigLine` and emit it to JavaScript, all in a scratch directory (the shipped src is never
 *  written to). `emitted` is the ESM file to grade, or null when emit failed. Call cleanup() when done grading. */
export type TsExtra = { from: string; to: string; emit?: boolean };
/** `extra`: files the artifact imports relative to itself (a CARRIED module and its generated declarations), placed at `to`
 *  (relative) beside the artifact for the check, and — when `emit` — beside the emitted JS too. The lab's ts rung is THIS
 *  function (#163: the lab kept its own conformance shim and tsc call, and the two judges drifted — #136, #158). */
export function prepareTs(tsc: Tsc, srcAbs: string, sigLine: string, { extra = [] as TsExtra[] } = {}): TsPrepared {
  const work = mkdtempSync(join(tmpdir(), 'rdv-ts-'));
  const cleanup = () => rmSync(work, { recursive: true, force: true });
  const art = join(work, 'artifact.ts'); copyFileSync(srcAbs, art);
  const place = (root: string, only: (x: TsExtra) => boolean) => { for (const x of extra.filter(only)) { const dst = resolve(root, x.to); if (!dst.startsWith(root + '/')) throw new Error(`extra file escapes the work dir: ${x.to}`); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(x.from, dst); } };
  place(work, () => true);
  let sig: ReturnType<typeof sigOf>;
  try { sig = sigOf(sigLine); } catch (e: any) { return { typeCheck: { ok: false, report: e.message }, emitted: null, work, cleanup }; }
  const imp = sig.exportName ? `import { ${sig.exportName} as rdvImpl } from './artifact.js';` : `import rdvImpl from './artifact.js';`;
  // the check runs IN the artifact's scope (round 5c, #136): a SIG names types the artifact itself declares (`Json`, `TypeNode`),
  // exported or not, so the shim is appended to a verbatim copy of the artifact — the types resolve to the artifact's own text —
  // while the value checked is still the artifact's real export, imported
  // the SIG is a TYPE ALIAS (a trailing `, x: T` is a syntax error), and a CANARY of a deliberately foreign type must NOT conform:
  // if it does, the SIG accepts nearly anything (`(...a: (string & number)[]) => unknown` — never spelt without the word), the
  // @ts-expect-error goes unused, and tsc fails the check (round 5b, #114)
  writeFileSync(join(work, 'conforms.ts'), `${readFileSync(srcAbs, 'utf-8')}\n${imp}\ntype RdvSig = ${sig.fnType};\nexport const rdvConforms: RdvSig = rdvImpl;\ndeclare const rdvCanaryIn: unique symbol; declare const rdvCanaryOut: unique symbol;\n// @ts-expect-error a SIG that accepts this canary checks nothing\nexport const rdvCanary: RdvSig = (...a: [typeof rdvCanaryIn]) => rdvCanaryOut;\ntype RdvNeverParam<P extends readonly unknown[]> = 1 extends { [K in keyof P]: [P[K]] extends [never] ? 1 : 0 }[number] ? true : false;\nexport const rdvNoNeverParam: RdvNeverParam<Parameters<RdvSig>> = false;   // a parameter of type never accepts every artifact (#125)\n`);
  const chk = run(tsc, work, ['--noEmit', ...FLAGS, ...typeFlags(tsc), 'artifact.ts', 'conforms.ts']);
  const toolchainMissing = !chk.ok && !tsc.typesRoot && NODE_TYPES_MISSING.test(chk.out);
  const bans = anyBanHits(readFileSync(srcAbs, 'utf-8'));
  const report = (chk.ok ? `tsc ${tsc.version} --strict ok, conforms to SIG` : toolchainMissing ? `the artifact imports a Node built-in and no Node type definitions are installed here (npm i -D @types/node) — not checked` : `tsc ${tsc.version} --strict FAILED: ${firstLines(chk.out)}`) +
    (bans.length ? `; any-ban: ${bans.join(', ')}` : '');
  const out = join(work, 'out'); mkdirSync(out);
  writeFileSync(join(out, 'package.json'), '{ "type": "module" }\n');   // the emitted .js is ESM, wherever tmpdir is
  run(tsc, work, [...FLAGS, ...typeFlags(tsc), '--outDir', out, 'artifact.ts']); place(out, (x) => !!x.emit);
  const emitted = join(out, 'artifact.js');
  return { typeCheck: { ok: chk.ok && !bans.length, report, ...(toolchainMissing ? { toolchainMissing } : {}) }, emitted: existsSync(emitted) ? emitted : null, work, cleanup };
}
