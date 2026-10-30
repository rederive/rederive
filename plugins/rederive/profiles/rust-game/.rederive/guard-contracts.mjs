#!/usr/bin/env node
// rederive rust-game profile guard (installed by `rdv init --lang rust --type game`) — PreToolUse hook for
// Edit|Write|MultiEdit|NotebookEdit.
//
// The generic frame's guard (cli/init.mts GUARD_SCRIPT) keys protection off sir.manifest.json — the npm-era
// package layout. A v0.5 profile repo has no sir.manifest.json: it has units/<u>/{sir,oracle,oracles,runs}/
// and, once accepted, an installed crates/<u>/INSTALLED.json. Under the old guard that layout is invisible,
// so nothing is protected while CLAUDE.section.md still claims enforcement (second-consumer finding). This
// is the profile's OWN guard, keyed off the real v0.5 layout: a unit root is a directory units/<u>/
// containing sir/<u>.sir.
//
// DENIED (structural — the judged never writes the judge):
//   - an EXISTING file under units/<u>/oracles/**        the oracle is COMPUTED by oracle/gen.mjs via Bash;
//                                                          hand-editing it lets an agent grade its own work
//   - an EXISTING file under units/<u>/runs/**/emit_*      a landed emission is evidence for quorum; it is
//                                                          never rewritten. An emission is a DIRECTORY for a
//                                                          Rust crate (runs/rust/emit_7/src/lib.rs) or a
//                                                          single FILE for js/ts (runs/js/emit_1.mjs,
//                                                          runs/ts/emit_2.ts) — both shapes are covered
//   - ANY file under crates/<u>/** once crates/<u>/INSTALLED.json exists — an installed crate changes only
//     via `tools/install` after a fresh grade, never by hand (a fresh crate with no INSTALLED.json yet, i.e.
//     before the first install, is not covered — there is nothing installed to protect yet)
//
// The first two are checked PER FILE (does the exact target path already exist?), deliberately NOT per
// emit_<i> directory. A Rust emitter lands one emission as TWO separate Write calls — emit_7/Cargo.toml, then
// emit_7/src/lib.rs — and neither file exists yet when either call fires, so both are allowed; a dir-level
// "does emit_7/ exist at all" rule would deny the second write the instant the first one creates the
// directory, leaving every Rust emission a crate with no lib.rs. Only a LATER Edit/Write of one of those same
// paths, now that it exists, is denied. (Same per-file rule for oracles/** — a brand-new oracle file written
// by oracle/gen.mjs goes through Bash/node, not this tool set, so it rarely matters in practice, but the rule
// stays uniform: existing file -> deny, new file -> allow. Do not "fix" this to a directory-level check.)
//
// LEFT OPEN (advisory only, not this hook's job): sir/**, oracle/gen.mjs, contracts/**, typikon.yaml.
// typikon.yaml's own `integrity.protected` lists these under the Tier-1 ruling (reported, not blocked) —
// this hook does not duplicate that policy; it only blocks what nothing else can safely leave advisory.
//
// HONESTY: this guard sees FILE TOOLS only (Edit/Write/MultiEdit/NotebookEdit). A shell redirect or a script
// run via Bash (including the real `node oracle/gen.mjs`) writes unseen by it, and a determined edit can
// always go around it. It is a courtesy rail, not the enforcement — the enforcement is verify-changed.mjs
// (the grade + tools/install --check), which cannot be routed around the same way because it re-checks the
// FILESYSTEM STATE at Stop/commit time, not the tool call that produced it.
//
// Maintainer window (human-authorized, same escape hatch as the frame guard):
//   SIR_ALLOW_TOOLKIT_EDITS=1  or  ~/.sir-allow-toolkit-edits present.
//
// Protocol: reads the PreToolUse event JSON on stdin. Exit 0 = allow. Exit 2 = block, with the reason on
// stderr (fed back to the agent as the tool-call error) — this is the exit-code hook protocol, simpler than
// the frame guard's hookSpecificOutput JSON and what this profile's own tests assert against.
import { existsSync } from 'node:fs';
import { resolve, relative, sep, join } from 'node:path';

const HOME = process.env.HOME || '';
const windowOpen = () => process.env.SIR_ALLOW_TOOLKIT_EDITS === '1' || existsSync(HOME + '/.sir-allow-toolkit-edits');
const REPO = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const DOOR = 'The door for a hand edit is sir/**, oracle/gen.mjs, contracts/**, or typikon.yaml — ' +
  'those are advisory-protected (typikon.yaml#integrity.protected), not blocked by this hook.';

function unitOf(absPath) {
  const unitsRoot = join(REPO, 'units');
  if (!(absPath + sep).startsWith(unitsRoot + sep)) return null;
  const rel = relative(unitsRoot, absPath);
  if (!rel || rel.startsWith('..')) return null;
  const unit = rel.split(sep)[0];
  if (!unit || !existsSync(join(unitsRoot, unit, 'sir', `${unit}.sir`))) return null; // not a recognized unit root
  return { unit, rel: rel.split(sep).slice(1).join('/') };
}

function verdict(absPath) {
  const cratesRoot = join(REPO, 'crates');
  if ((absPath + sep).startsWith(cratesRoot + sep)) {
    const rel = relative(cratesRoot, absPath);
    const unit = rel.split(sep)[0];
    if (unit && existsSync(join(cratesRoot, unit, 'INSTALLED.json'))) {
      return `BLOCKED — crates/${unit}/** is an INSTALLED unit crate (crates/${unit}/INSTALLED.json exists): ` +
        `it changes only via tools/install after a new grade, never by hand. Edit the contract, re-emit, ` +
        `re-grade, then \`tools/install ${unit} --from <accepted emission>\`. ${DOOR}`;
    }
    return null;
  }

  const u = unitOf(absPath);
  if (!u) return null;
  const exists = existsSync(absPath);

  if (u.rel === 'oracles' || u.rel.startsWith('oracles/')) {
    if (!exists) return null; // a brand-new oracle file is written by oracle/gen.mjs via Bash, not this tool set
    return `BLOCKED — units/${u.unit}/oracles/** is the graded judge: it is written only by running ` +
      `units/${u.unit}/oracle/gen.mjs (via Bash), never hand-edited — an agent that can edit the oracle can ` +
      `make anything pass. ${DOOR}`;
  }

  // An emission is either a DIRECTORY (a Rust crate: runs/rust/emit_7/src/lib.rs) or a single FILE (a js/ts
  // module: runs/js/emit_1.mjs, runs/ts/emit_2.ts) — match both shapes, not just the trailing-slash one.
  const m = u.rel.match(/^runs\/[^/]+\/(emit_[^/.]+)(\/|\.[a-z]+$)/);
  if (m && exists) {
    return `BLOCKED — units/${u.unit}/runs/**/${m[1]}/** is a LANDED emission: evidence for quorum, never ` +
      `rewritten once it exists. A changed emission gets a fresh index instead. ${DOOR}`;
  }
  return null;
}

let buf = '';
process.stdin.on('data', (c) => (buf += c)).on('end', () => {
  let j = {};
  try { j = JSON.parse(buf); } catch { process.exit(0); }
  const ti = j.tool_input || {};
  if (windowOpen()) process.exit(0);
  if (!['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(j.tool_name) || !ti.file_path) process.exit(0);
  let abs;
  try { abs = resolve(ti.file_path); } catch { process.exit(0); }
  const reason = verdict(abs);
  if (reason) { process.stderr.write(reason + '\n'); process.exit(2); }
  process.exit(0);
});
