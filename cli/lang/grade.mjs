// Promoted from sir-lab/v05-lang grade.mjs (SIR_V05_PLAN Phase 2b), unchanged but for import paths and the `counts` field rdv renders.
// Grade one prepared artifact against the SHARED typed oracle (sir-canonical-v1). Per case: decode the tagged args to
// native, call, ENCODE the native result by the SIG's result type, compare CANONICAL strings — equality per type, NaN
// canonicalized, no tolerance. Rungs: type-checked (static, where the language has a checker), harness-verified (full pass);
// cross-verified is set by run.mjs across languages.
// A vector has one of three states: ok, miss, or NARROWED — the driver answered `{ __narrowed: reason }` because this
// language's transport/envelope cannot hold the input (today only rust: NaN/Inf/-0 inside a serde_json::Value). Narrowed is
// neither a pass nor a miss: it is counted and named on its own, and `exact` judges only the vectors that were run.
import { decode, encode, eqCanonical, display } from '../sir/canon.mjs';
export { eqCanonical };
const isNarrowed = (o) => o && typeof o === 'object' && !Array.isArray(o) && typeof o.__narrowed === 'string';
export async function gradeArtifact(prepared, oracle, sig, { decodeArgs = decode, encodeResult = encode } = {}) {
  const run = async (cases) => {
    let argsList; try { argsList = cases.map((c) => c.args.map(decodeArgs)); }
    catch (e) { const err = new Error(`VERIFIER FAULT — an oracle argument cannot be decoded: ${e?.message ?? e}`); err.verifierFault = true; throw err; }   // never charged to the artifact
    const out = await prepared.callBatch(argsList, { state: sig.state });
    return cases.map((c, i) => {
      // observation type: a STATE unit observes record[result, post]; a thrown error encodes as {t:'throw'} and matches an expected throw
      const obsType = sig.state ? { k: 'record', fields: [['result', sig.result], ['post', sig.args[sig.state.index].type]] } : sig.result;
      // a RESULT the verifier could not carry is still not a throw: where the oracle expects one, the artifact did not throw —
      // a miss, never set aside (round 5b, #117: a decoder with a looser cap than the oracle's passed every refusal probe)
      if (isNarrowed(out[i]) && out[i].__narrowed.startsWith('result:') && c.expected?.t === 'throw') return { ok: false, got: { t: 'text', v: `<not a throw: ${out[i].__narrowed}>`, cu: 'utf8' }, expected: c.expected, args: c.args, name: c.name };
      if (isNarrowed(out[i])) return { ok: false, narrowed: out[i].__narrowed, expected: c.expected, args: c.args, name: c.name };
      let got, err = null;
      try { got = encodeResult(out[i], obsType); } catch (e) { err = e.message; }
      return { ok: !err && eqCanonical(got, c.expected), got, err, expected: c.expected, args: c.args, name: c.name };
    });
  };
  const frozen = await run(oracle.frozen), heldout = await run(oracle.heldout);
  const n = (rs) => rs.filter((r) => r.ok).length, ran = (rs) => rs.filter((r) => !r.narrowed), nn = (rs) => rs.length - ran(rs).length;
  const tally = (rs) => `${n(rs)}/${ran(rs).length}${nn(rs) ? ` (${nn(rs)} narrowed)` : ''}`;
  const all = [...frozen, ...heldout]; const missed = all.filter((r) => !r.ok && !r.narrowed); const narrowedRs = all.filter((r) => r.narrowed);
  const exact = missed.length === 0 && ran(all).length > 0;   // no misses among the vectors this language could RUN (and it ran some)
  const rungs = []; if (prepared.typeCheck.applicable && prepared.typeCheck.ok) rungs.push('type-checked'); if (exact) rungs.push('harness-verified');
  const argsOf = (r) => r.args.map((a) => a && a.t ? display(a) : JSON.stringify(a));
  const count = (rs) => ({ pass: n(rs), ran: ran(rs).length, narrowed: nn(rs) });
  return { typeCheck: prepared.typeCheck, frozen: tally(frozen), heldout: tally(heldout), exact, rungs, counts: { frozen: count(frozen), heldout: count(heldout) },
           narrowed: { count: narrowedRs.length, names: narrowedRs.map((r) => r.name), reasons: narrowedRs.map((r) => ({ name: r.name, args: argsOf(r), reason: r.narrowed })) },
           allMisses: missed.map((r) => ({ name: r.name, slice: frozen.includes(r) ? 'frozen' : 'heldout', args: argsOf(r), expected: display(r.expected) })),
           misses: missed.slice(0, 8).map((r) => ({ args: argsOf(r), expected: display(r.expected), got: r.err ? `unencodable: ${r.err}` : display(r.got) })) };
}
