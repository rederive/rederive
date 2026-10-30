// The SIR_SCHEMA §23a table, generated from the parser's directive table so the schema and the code cannot disagree.
// `node cli/sir/directive-table.mjs` prints the markdown; directive-table.test.mjs compares it with sir-spec's copy.
import { DIRECTIVES } from './sir-parse.mjs';
export const MEANINGS = {
  UNIT: 'The unit name; the first line of every file (primary and language). Supersedes `SIR`.',
  SIR: 'The v0.1 header. Read, never written.',
  KIND: '`FUNCTIONAL | STATE | EFFECT` (§1, §11).',
  FIDELITY: '`package | spec` (§12). Supersedes the `VARIANT` spelling; the manifest `variants` map is unchanged.',
  VARIANT: 'The §12 spelling of `FIDELITY`. Read, never written.',
  ANCHOR: 'What the contract is anchored to (§12). Also an attribute (`… ANCHOR <ref>`). `ref(<lang>:…)` is the §12x extension.',
  SRC: 'Source location of the original (§1).', TRIGGER: 'Metadata, never structure (§8).', REACH: 'An off-path unit, kept and marked (§6).',
  'ORACLE-CLASS': '`deterministic | trace` (§15).', 'TRACE-SEAM': 'The injectable effect boundary (§15).', SEAM: 'An export-shape adapter (§16).',
  SIG: 'Primary: the signature over the abstract types (§23b). Language file: the native signature.',
  ENVELOPE: 'The verified input scope (§17). In a language file: a narrowing (any language) or, for `js` only, a widening.',
  'DEPENDS-ON': 'Named dependencies (§9), or `none`. Never carried data (`E_CARRIED_AS_DEPENDENCY`).',
  DESCRIPTION: 'Contract-level prose: what the unit is for.',
  BEHAVIOR: 'Header for the numbered rules `R1 … Rn` (§23a rule 3).',
  INVARIANT: 'A property the oracle should bear out. Prose until a vector pins it.',
  TABLE: 'A decision table (§13 as a directive). Every row is verified by the oracle.',
  PINNED: '`PINNED <kind> <name> = <literal>`: a hard requirement. Neutral in the primary, dialect in a language file. Cited (§23a rule 4).',
  EARNED: 'A rule or pin added after an observed divergence: `EARNED round-<n> heldout <vector>`.',
  NOTE: 'Non-load-bearing prose. Metered (`W_NOTE_DENSITY`).', RATIONALE: 'Why a rule is the way it is. Non-load-bearing.',
  SCOPE: '`IN:` / `OUT:` classification of behavior.',
  'UNGUARDED-PRECONDITION': 'An input condition the unit does not check; behavior outside it is unspecified.',
  'OUT-OF-DOMAIN': 'An input the contract explicitly does not cover, and what (if anything) is promised for it.',
  ORACLE: '`ORACLE value -> oracles/<unit>.json CANONICAL-SHA256 <hex>`: the oracle file and its declared hash (§10x).',
  PROVENANCE: 'Where the contract came from: package, version, function, history.',
  CARRIED: 'A carried constant table (§18). Primary: `CARRIED <name> FROM <source>` + `SHAPE` / `CANONICAL-SHA256` / `AUTHORITY`. Language file: where the module is.',
  SHAPE: 'Sub-field of `CARRIED`: the table\'s abstract type and entry count.',
  'CANONICAL-SHA256': 'Sub-field of `CARRIED`: the table\'s canonical hash. (The oracle\'s hash rides on the `ORACLE` line.)',
  AUTHORITY: 'Sub-field of `CARRIED`: one re-runnable assertion against the independent authority (§18).',
  'CARRIED-DATA': 'The v0.3 spelling of `CARRIED`. Read, never written.',
  STATE: '`STATE mutates <arg>`: the unit mutates an argument; the oracle observes `{result, post}` (§2, §11).',
  EMIT: 'An effect emission that may bind a result (§3).', REQUEST: 'An effect with no outbound payload (§3).',
  BRANCH: 'A branch over a predicate (§4).', 'ON-ERROR': 'Error handling as a branch (§4).',
  PAR: 'An unordered window over sub-traces (§5, §19).', RING: 'Token-coordinated concurrency (§22).', LIFECYCLE: 'A cancellable resource (§21).',
  EFFECT: 'An effect across a `<domain>.<verb>` boundary (§7).', SURFACE: 'The module surface at `domain.verb` level (§7).',
  NOTES: 'An ad-hoc legacy prose block. Read, never written; becomes `NOTE`.', 'GUARD-PINNED': 'A legacy pinned guard. Read, never written; becomes `PINNED`.',
  LANG: 'Language file only: the language id, which must equal the filename\'s (§23b).',
  'PRIMARY-SHA256': 'Language file only: the canonical-text hash of the primary it was written against (§23b).',
  ABI: 'Language file only: how abstract types map to native ones (text encoding, numeric semantics, crate or module shape).',
  MECHANISM: 'Language file only: which built-ins realize which rules, and anything an emitter in that language would otherwise get wrong.',
};
const reg = { P: 'primary', L: 'language', B: 'both' }, kind = { lb: 'load-bearing', pr: 'prose (unverified prior)', legacy: 'legacy (read only)' };
export function table() {
  const missing = Object.keys(DIRECTIVES).filter((k) => !MEANINGS[k]); if (missing.length) throw new Error('no meaning for ' + missing);
  const extra = Object.keys(MEANINGS).filter((k) => !(k in DIRECTIVES)); if (extra.length) throw new Error('not a directive: ' + extra);
  const out = ['| directive | file | kind | meaning |\n|---|---|---|---|'];
  for (const [k, v] of Object.entries(DIRECTIVES)) { const [r, kd] = v.split(':'); out.push(`| \`${k}\` | ${reg[r]} | ${kind[kd]} | ${MEANINGS[k].replace(/\|/g, "\\|")} |`); }
  out.push('| `R<n>` | primary | load-bearing | One numbered rule under `BEHAVIOR`. |');
  return out.join('\n');
}
if (process.argv[1] === new URL(import.meta.url).pathname) console.log(table());
