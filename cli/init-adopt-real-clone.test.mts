// Regression test for a real finding: the duplicate-section detector missed the ACTUAL
// game repo's CLAUDE.md because the profile's CLAUDE.section.md was
// GENERICIZED from it — "the design doc" instead of "the GDD", "the giver" instead of a
// name — so almost no single line matches verbatim near any one heading. What survives
// genericizing is headings (mostly untouched) and literal/structural lines (a command
// block, `tools/lab validate <unit>` and friends) that appear FAR from the first heading,
// in a LATER subsection. Fixture: a byte-for-byte copy of that repo's real CLAUDE.md (as it
// was at the time of the finding) and the real profile's real CLAUDE.section.md, both frozen
// here as test data so this test doesn't depend on either file being unchanged later.
// Run: npx tsx --test cli/init-adopt-real-clone.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { cmdInit } from './init.mts';

let ORIGINAL_PATH: string | undefined;
before(() => { ORIGINAL_PATH = process.env.PATH; process.env.PATH = '/usr/bin:/bin'; });
after(() => { if (ORIGINAL_PATH !== undefined) process.env.PATH = ORIGINAL_PATH; });

async function captureLog(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  try { return { code: await fn(), out }; } finally { console.log = orig; }
}
const porcelain = (d: string): string => execSync('git status --porcelain', { cwd: d, encoding: 'utf8' });

// Frozen 2026-09-28: a real Rust game repo's CLAUDE.md (name and premise genericized), four
// sections — "What this is" (repo-specific, not in the profile, must survive untouched),
// then "The loop", "Hard rules", "Commands" (all three genericized into the profile).
const REAL_GAME_CLAUDE_MD = "# Arcade Game — agent rules\n\n## What this is\nA top-down arcade shooter (Rust, no engine, one sim crate; `docs/GDD-v0.5.md`). It is ALSO the demo\ntestbed for the maintainer's verification tooling: SIR (contracts + blind re-emission under quorum), rederive (deps disappear:\nevery leaf is a verified zero-dep crate), typikon (reach, authority, the intent contract), Jev (advisory seams and a\nplaytest-only bot input source). The game is the fun; the tooling is what gets exercised.\n\n**Reading rule (from the GDD):** §1–§7 are the game, §8–§10 how it is built, §11 every number, §14 the footguns closed.\n**If §14 and any earlier section disagree, §14 wins.** Anything in §14.11 (out of scope for the first pass) that seems\nnecessary for Scene 0 is a design bug: stop and ask. Build order is §13; ship order follows confidence order.\n\n## The loop (per named rule of the sim)\nEvery rule of the sim with a name worth saying and a number in §11 is a UNIT: `units/<unit>/` holds its contract\n(`sir/<unit>.sir` primary + `sir/<unit>.rust.sir`, and a `.js.sir` when a differential is wanted), its oracle generator\n(`oracle/gen.mjs`, computing expecteds FROM the GDD's ruling — never typed) and the encoded oracle (`oracles/`).\n```\narchitect:   decide the unit + which GDD lines it owns          (contracts/*.contract.yaml names it, in Lane's words)\ndecomposer:  Agent sir-decomposer, GREENFIELD mode              → sir/ + oracle/gen.mjs + oracles/<unit>.json ; report\narchitect:   read the report's quoted lines; accept/reject      (a misread ruling here converges 3/3 on the wrong thing)\nrunner:      Agent sir-lab-runner  (tools/lab prepare → N × sir-reemitter-cr → tools/lab grade → decision.json)\narchitect:   read runs/decision.json — accept | harden (spawn decomposer in PROPOSE mode) | quarantine\ninstall:     copy the accepted emission byte-exact to crates/<unit>/ ; sim depends on it by path\n```\nDeterministic steps are ONE command (`tools/lab prepare|grade|void|checkpoint|validate|status`). Roles are agent\ndefinitions in ~/endgame/.claude/agents (sir-decomposer, sir-reemitter-cr, sir-lab-runner). Judgment is the main\nagent's, and its report to Lane is a DECISIONS list, never a narrative of glue. Status lives on disk:\n`units/<unit>/runs/STATUS.json` and `observer/events.jsonl` (`tools/lab status --watch 30`).\n\n## Hard rules\n1. **Never type an expected value.** Oracles are computed by `oracle/gen.mjs` from the GDD's numbers (§11) and rules\n   (§14). If the generator cannot compute it, the rule is ambiguous → a DECISION for Lane, recorded in `RULINGS.md`.\n2. **The judged never writes the judge.** Emitters write only their emit path. `sir/`, `oracles/`, `contracts/`,\n   `typikon.yaml` and the GDD are written by the decomposer role or the architect, with the reason in the commit.\n3. **The sim crate is pure.** No clock, no I/O, no randomness it did not receive, no color, no splat (§9.4, §14.9–14.10).\n   Seams (RNG, transport, signer, bot policy) are traits injected at the edge. The Jev bot is an INPUT SOURCE behind the\n   `jev-bots` feature, never part of the sim, never in a production road config (§14.7).\n4. **No engine, no engine physics, no wire protocol, no crypto** in the first pass (§9.1, §14.8–14.9, §14.11).\n5. **A verified unit is installed byte-exact.** `crates/<unit>/` is the accepted emission; edit the CONTRACT and re-emit,\n   never the crate. A crate that drifts from its emission is a finding.\n6. **The harness is EDITABLE here — with a fixture.** Lane (2026-09-24): \"I actually want the agent modifying the\n   harness, which will be kickin' feedback.\" When the lab, a role definition, typikon or rdv gets in the way, fix it at\n   the source (~/sir-lab/v05-lang, ~/endgame/.claude/agents, ~/typikon, ~/rederive), land the scar as a fixture/test,\n   note it in `HARNESS-FEEDBACK.md`, and commit there with the reason. Never weaken a gate to pass your own work.\n7. **Numbers come from §11 by dial name**; a SIR cites the dial, the generator uses it. Dials are tuned in playtests;\n   changing one is a contract change (re-encode, re-grade), never a silent edit.\n\n## Commands\n```\ncargo check                                   # the workspace (sim + installed unit crates)\ntools/lab validate <unit>                     # the family validates (decomposer's job to make it so)\ntools/lab prepare <unit> [--n 3]              # encode oracle → bind → stage cleanrooms → task cards → plan.json\ntools/lab grade <unit> --round N [--cap 3]    # rungs, quorum, decision.json (exit 0 only on accept)\ntools/lab status [--watch 30]                 # every unit's step, emissions landed, next\ntools/typikon route --spec typikon.yaml --repo . --all\ntools/typikon contract --spec typikon.yaml --contract contracts/scene0.contract.yaml   # --ratify --by lane is Lane's act\n```\n";

// Frozen 2026-09-28: plugins/rederive/profiles/rust-game/CLAUDE.section.md — the genericized
// version of the same three sections, plus a fourth ("What is enforced vs advisory") that
// didn't exist in the original at all.
const REAL_PROFILE_SECTION = "<!-- rederive:begin (managed by `rdv init` — edits between markers are overwritten on re-init) -->\n## The loop (per named rule of the sim)\nEvery rule of the sim with a name worth saying and a number in the design doc is a UNIT: `units/<unit>/` holds\nits contract (`sir/<unit>.sir` primary + `sir/<unit>.rust.sir`, and a `.js.sir` when a differential is wanted),\nits oracle generator (`oracle/gen.mjs`, computing expecteds FROM the design doc's ruling — never typed) and\nthe encoded oracle (`oracles/`).\n```\narchitect:   decide the unit + which design-doc lines it owns         (contracts/*.contract.yaml names it, in the giver's words)\ndecomposer:  Agent rederive:sir-decomposer, GREENFIELD mode           → sir/ + oracle/gen.mjs + oracles/<unit>.json ; report\narchitect:   read the report's quoted lines; accept/reject            (a misread ruling here converges N/N on the wrong thing)\nrunner:      Agent rederive:sir-lab-runner  (tools/lab prepare → N × sir-reemitter-cr → tools/lab grade → decision.json)\narchitect:   read runs/decision.json — accept | harden (spawn decomposer in PROPOSE mode) | quarantine\ninstall:     copy the accepted emission byte-exact to crates/<unit>/ ; sim depends on it by path\n```\nDeterministic steps are ONE command (`tools/lab prepare|grade|void|checkpoint|validate|status`). Roles are the\nplugin's agents (`rederive:sir-decomposer`, `rederive:sir-reemitter-cr`, `rederive:sir-lab-runner`). Judgment\nis the main agent's, and its report to the giver is a DECISIONS list, never a narrative of glue. Status lives\non disk: `units/<unit>/runs/STATUS.json` and `observer/events.jsonl` (`tools/lab status --watch 30`).\n\n## Hard rules\n1. **Never type an expected value.** Oracles are computed by `oracle/gen.mjs` from the design doc's numbers\n   and rules. If the generator cannot compute it, the rule is ambiguous → a DECISION for the giver, recorded\n   in `RULINGS.md`.\n2. **The judged never writes the judge.** Emitters write only their emit path. `sir/`, `oracles/`,\n   `contracts/`, `typikon.yaml`, and the design doc are written by the decomposer role or the architect, with\n   the reason in the commit.\n3. **The sim crate is pure.** No clock, no I/O, no randomness it did not receive, no rendering. Seams (RNG,\n   transport, signer, bot policy) are traits injected at the edge, never inside the sim crate itself.\n4. **A verified unit is installed byte-exact.** `crates/<unit>/` is the accepted emission; edit the CONTRACT\n   and re-emit, never the crate. A crate that drifts from its emission is a finding (`tools/install --check`).\n5. **The harness is editable here — with a fixture.** When the lab, a role definition, typikon, or rdv gets\n   in the way, fix it at the source, land the scar as a fixture/test, note it in `HARNESS-FEEDBACK.md`, and\n   commit there with the reason. Never weaken a gate to pass your own work.\n6. **Numbers come from the design doc by dial name**; a SIR cites the dial, the generator uses it. Dials are\n   tuned in playtests; changing one is a contract change (re-encode, re-grade), never a silent edit.\n\n## What is enforced vs advisory\nTwo profile hooks (`.rederive/guard-contracts.mjs` PreToolUse, `.rederive/verify-changed.mjs` Stop hook +\npre-commit) are STRUCTURAL, not this file's word: they know the real v0.5 layout (`units/<u>/{sir,oracle,\noracles,runs}/`, installed `crates/<u>/INSTALLED.json`), not the generic frame's npm-era one.\n- **Hook-denied (a hand Edit/Write is refused, exit 2):** an EXISTING file under `units/<u>/oracles/**` (the\n  oracle is computed by `oracle/gen.mjs` via Bash, never hand-edited); an EXISTING file under\n  `units/<u>/runs/**/emit_*/**` (a landed emission is evidence, never rewritten). This is a PER-FILE rule, not\n  per-directory: a Rust emitter writing `emit_7/Cargo.toml` then `emit_7/src/lib.rs` as two separate Write\n  calls gets both allowed (neither file existed yet) — only a later Edit/Write of one of those same paths, now\n  that it exists, is denied. Also denied: anything under `crates/<u>/**` once `crates/<u>/INSTALLED.json`\n  exists (installed only via `tools/install`). The maintainer window (`SIR_ALLOW_TOOLKIT_EDITS=1` or\n  `~/.sir-allow-toolkit-edits`) opens all three for a human-authorized session.\n- **Advisory only (reported, not blocked — typikon.yaml's `integrity.protected`, Lane's Tier-1 ruling):**\n  `sir/**`, `oracle/gen.mjs`, `contracts/**`, `typikon.yaml`. These are the doors: if a unit needs to change,\n  edit one of these, never the oracle, an emission, or an installed crate.\n- **The guard is a courtesy rail, not the enforcement — be honest about what it can't see.** The PreToolUse\n  guard sees FILE TOOLS only (Edit/Write/MultiEdit/NotebookEdit); a shell redirect or `node oracle/gen.mjs`\n  writes unseen by it, and a determined edit can always go around it. The ENFORCEMENT is the grade\n  (`runs/decision.json` accepted at the CURRENT primary sha, checked via `tools/lab validate`) and\n  `tools/install --check`, run by the Stop hook (advisory — always exits 0, prints a FAIL line) and pre-commit\n  (blocking — exits 1 on any FAIL). `git commit` is the one place that actually refuses.\n\n## Commands\n```\ncargo check                                   # the workspace (sim + installed unit crates)\ntools/lab validate <unit>                     # the family validates (decomposer's job to make it so)\ntools/lab prepare <unit> [--n 3]              # encode oracle → bind → stage cleanrooms → task cards → plan.json\ntools/lab grade <unit> --round N [--cap 3]    # rungs, quorum, decision.json (exit 0 only on accept)\ntools/lab status [--watch 30]                 # every unit's step, emissions landed, next\ntools/typikon route --spec typikon.yaml --repo . --all\ntools/typikon contract --spec typikon.yaml --contract contracts/game.contract.yaml   # --ratify --by <name> is the giver's act\n```\n<!-- rederive:end -->\n";

function fixtureProfile(): string {
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, 'rust-game');
  mkdirSync(pdir, { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang: 'rust', type: 'game', version: '1.0.0' }));
  writeFileSync(join(pdir, 'CLAUDE.section.md'), REAL_PROFILE_SECTION);
  return profilesDir;
}

function gameRepoClone(): string {
  const d = mkdtempSync(join(tmpdir(), 'rdv-real-game-clone-'));
  execSync('git init -q', { cwd: d });
  writeFileSync(join(d, 'CLAUDE.md'), REAL_GAME_CLAUDE_MD);
  return d;
}

test('real game repo CLAUDE.md: dry-run detects the unmanaged duplicate despite genericizing', async () => {
  const d = gameRepoClone();
  const profilesDir = fixtureProfile();
  const before = porcelain(d);
  const { code, out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, dryRun: true }));
  assert.equal(code, 0);
  assert.match(out, /! CLAUDE\.md already carries this section unmanaged — not duplicated; use --adopt/);
  assert.equal(porcelain(d), before, 'dry-run changed no git status at all');
});

test('real game repo CLAUDE.md: apply without --adopt leaves it byte-identical', async () => {
  const d = gameRepoClone();
  const profilesDir = fixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), REAL_GAME_CLAUDE_MD);
});

test('real game repo CLAUDE.md: --adopt replaces all three genericized sections with one managed block, "What this is" untouched, and KEEPS what genericizing dropped', async () => {
  const d = gameRepoClone();
  const profilesDir = fixtureProfile();
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, adopt: true }));
  assert.match(out, /~ CLAUDE\.md \(--adopt: replaced the unmanaged '## The loop \(per named rule of the sim\)' block with the managed section \+ a Project rules section\)/);
  assert.match(out, /! --adopt kept \d+ project-specific line\(s\) in "## Project rules":/);

  const c = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  assert.equal(c.split('rederive:begin').length - 1, 1, 'exactly one managed marker block');
  assert.ok(c.includes('# Arcade Game — agent rules'), 'the H1 title survives');
  assert.ok(c.includes('## What this is'), '"What this is" survives');
  assert.ok(c.includes("A top-down arcade shooter"), "\"What this is\"'s body survives untouched");
  assert.ok(c.indexOf('## What this is') < c.indexOf('rederive:begin'), '"What this is" stays ABOVE the managed block');
  assert.ok(c.includes('from the design doc'), "the profile's genericized wording is what's in the managed block now");

  // finding #7: --adopt must not silently drop rule 4 (entirely absent from the profile) or
  // the Jev clause of rule 3 (a project-specific carve-out genericizing replaced with "no
  // rendering") — both must survive, verbatim, in a "## Project rules" section
  assert.match(c, /## Project rules \(kept by `rdv init --adopt` — review and merge\)/);
  const projectRules = c.slice(c.indexOf('## Project rules'));
  assert.ok(c.indexOf('rederive:end') < c.indexOf('## Project rules'), '"## Project rules" comes AFTER the managed block, not inside it');
  assert.match(projectRules, /No engine, no engine physics, no wire protocol, no crypto/, 'hard rule 4 survives');
  assert.match(projectRules, /Jev bot is an INPUT SOURCE/, "rule 3's Jev clause survives");
  assert.match(projectRules, /§14\.7/, "the Jev clause's own citation survives with it");

  // finding #7 FOLLOW-UP: the first (word-overlap) fix still incorrectly treated a
  // PARAPHRASED generic rule as "matching" the project's specific one — the exact regression
  // this asserts against. Every one of these was measured lost under that heuristic:
  assert.ok(projectRules.includes("kickin' feedback"), "Lane's quote in rule 6 survives");
  assert.ok(projectRules.includes('fix it at the source'), "rule 6's project-specific instructions survive");
  assert.ok(projectRules.includes('A crate that drifts from its emission is a finding.'), 'rule 5 (renumbered) survives, unpadded by the extra parenthetical the profile added');
  assert.ok(projectRules.includes('with the reason in the commit'), "rule 2's second sentence survives");
  assert.ok(projectRules.includes("architect:   decide the unit + which GDD lines it owns"), 'the first architect: diagram line survives');
  assert.ok(projectRules.includes("architect:   read the report's quoted lines; accept/reject"), 'the second architect: diagram line survives');
});
