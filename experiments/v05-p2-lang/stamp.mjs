// Builds the Phase 2 gate fixture `@fixture/lang` (SIR_V05_PLAN Phase 2): min-indent@1.0.1 as a v0.5 bundle — the primary
// <unit>.sir, a language file per language, ONE canonical oracle (sir-canonical-v1), and a lang:js / lang:ts / lang:rust
// variant each graded on it. All from the v0.5 lab (sir-lab/v05-lang units/min_indent: re-cut cold and re-proven fresh blind
// 3/3 in every language in Phase 1, cross-verified 2000/2000). The plan's gate, plus one control per failure class:
//   bundle/                — every variant VERIFIES (js harness-verified; ts and rust type-checked -> harness-verified)
//   controls/ts-widened/   — the ts artifact's return type widened (number | undefined): FAILS at type-checked alone
//   controls/rust-wrap/    — the rust artifact's empty case wraps (0u64.wrapping_sub(1) = 2^64-1): FAILS on the u64
//                            comparison alone — the full 64 bits cross the harness, so the miss names 18446744073709551615
//   controls/rust-narrowed/— the rust artifact returns u32 for the SIG's u64 (behavior identical on every vector): FAILS at
//                            type-checked alone, on rdv's result pin
// Run: node experiments/v05-p2-lang/stamp.mjs   (from the rederive root; needs ~/sir-lab/v05-lang)
import { cpSync, copyFileSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalSha, parse, get } from '../../cli/sir/sir-parse.mjs';
import { treeSha } from '../../cli/tree-sha.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const LAB = join(homedir(), 'sir-lab/v05-lang/units/min_indent');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const edit = (text, from, to) => { if (!text.includes(from)) throw new Error(`expected text not found: ${from}`); return text.split(from).join(to); };

function build(out, { ts = (t) => t, rust = (t) => t } = {}) {
  rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, 'sir'), { recursive: true }); mkdirSync(join(out, 'oracles')); mkdirSync(join(out, 'src'));
  for (const f of ['min_indent.sir', 'min_indent.js.sir', 'min_indent.ts.sir', 'min_indent.rust.sir']) copyFileSync(join(LAB, 'sir', f), join(out, 'sir', f));
  copyFileSync(join(LAB, 'oracles/min_indent.json'), join(out, 'oracles/min_indent.json'));
  copyFileSync(join(LAB, 'runs/js/emit_1.mjs'), join(out, 'src/min_indent.mjs'));
  writeFileSync(join(out, 'src/min_indent.ts'), ts(readFileSync(join(LAB, 'runs/ts/emit_1.ts'), 'utf8')));
  cpSync(join(LAB, 'runs/rust/emit_1'), join(out, 'src/min_indent-rs'), { recursive: true, filter: (p) => !/\/target(\/|$)/.test(p) });
  const lib = join(out, 'src/min_indent-rs/src/lib.rs'); writeFileSync(lib, rust(readFileSync(lib, 'utf8')));
  const primary = readFileSync(join(out, 'sir/min_indent.sir'), 'utf8'); const pSha = canonicalSha(primary);
  const oracle = 'oracles/min_indent.json';
  const variant = (lang, src, srcSha256) => ({ lang, sir: `sir/min_indent.${lang}.sir`, langSha256: sha(join(out, `sir/min_indent.${lang}.sir`)), primarySha256: pSha,
    oracle, oracleSha256: sha(join(out, oracle)), src, srcSha256 });
  const sigD = get(parse(primary).ast, 'SIG');
  const m = { name: '@fixture/lang', version: '0.1.0', zeroDep: true,
    provenance: { source: 'min-indent@1.0.1', sourceRepo: 'sindresorhus/min-indent', license: 'MIT', decompiledBy: 'sir-lab/v05-lang (Phase 1 cold re-cut)', capturedAt: '2026-10-23' },
    specVersion: '0.5', features: ['vectors', 'lang-variant'],
    units: [{ name: 'min_indent', kind: 'FUNCTIONAL', sig: [sigD.args, ...sigD.cont].join(' '), sir: 'sir/min_indent.sir', sirSha256: sha(join(out, 'sir/min_indent.sir')),
      variants: {
        'lang:js': variant('js', 'src/min_indent.mjs', sha(join(out, 'src/min_indent.mjs'))),
        'lang:ts': variant('ts', 'src/min_indent.ts', sha(join(out, 'src/min_indent.ts'))),
        'lang:rust': variant('rust', 'src/min_indent-rs', treeSha(join(out, 'src/min_indent-rs'))),
      } }] };
  writeFileSync(join(out, 'sir.manifest.json'), JSON.stringify(m, null, 2) + '\n');
  console.log(`wrote ${out}`);
}

build(join(HERE, 'bundle'));
build(join(HERE, 'controls/ts-widened'), { ts: (t) => t.replace(/(export default function min_indent\([^)]*\)\s*:\s*)number(\s*\{)/, (all, a, b) => { const r = `${a}number | undefined${b}`; if (r === all) throw new Error('no ts return annotation'); return r; }) });
build(join(HERE, 'controls/rust-wrap'), { rust: (t) => edit(t, 'best.unwrap_or(0)', 'best.unwrap_or(0u64.wrapping_sub(1))') });
build(join(HERE, 'controls/rust-narrowed'), { rust: (t) => edit(edit(edit(t, '-> u64 {', '-> u32 {'), 'Option<u64>', 'Option<u32>'), 'let mut n: u64', 'let mut n: u32') });
