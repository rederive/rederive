type Miss = { readonly slice: string | null; readonly name: string; readonly args: readonly string[]; readonly expected: string };
type Artifact = { readonly artifact: string; readonly control: boolean | null; readonly error: string | null; readonly rungs: readonly string[] | null; readonly typeCheck: { readonly applicable: boolean; readonly ok: boolean | null } | null; readonly _misses: readonly Miss[] | null };
type Tally = { name: string; args: readonly string[]; expected: string; failedBy: string[]; passedBy: number; of: number };
type Verdict = { round: number; quorum: string; verdict: string; heldoutDisagree: Tally[]; frozenMissed: Tally[] | null };

export default function divergence_of(round: number, artifacts: readonly Artifact[]): Verdict | null {
  const attempted = artifacts.filter((a) => a.control !== true);
  if (attempted.length === 0) return null;
  const graded = attempted.filter((a) => a.error === null);
  if (graded.length === 0) {
    return { round, quorum: "0/0", verdict: "no-quorum", heldoutDisagree: [], frozenMissed: null };
  }
  for (const a of graded) {
    if (a.rungs === null) throw new Error("divergence: artifact " + a.artifact + " has no rungs list");
    for (const m of a._misses ?? []) {
      if (m.slice !== null && m.slice !== "frozen" && m.slice !== "heldout") {
        throw new Error("divergence: bad slice");
      }
    }
  }
  let votes = 0;
  for (const a of graded) {
    const hv = a.rungs !== null && a.rungs.includes("harness-verified");
    const tc = a.typeCheck === null || a.typeCheck.applicable === false || a.typeCheck.ok === true;
    const nm = a._misses === null || a._misses.length === 0;
    if (hv && tc && nm) votes++;
  }
  const tally = (s: string): Tally[] => {
    const map = new Map<string, Tally>();
    for (const a of graded) {
      for (const m of a._misses ?? []) {
        if ((m.slice ?? "heldout") !== s) continue;
        let e = map.get(m.name);
        if (e === undefined) {
          e = { name: m.name, args: m.args, expected: m.expected, failedBy: [], passedBy: 0, of: graded.length };
          map.set(m.name, e);
        }
        if (!e.failedBy.includes(a.artifact)) e.failedBy.push(a.artifact);
      }
    }
    const out = Array.from(map.values());
    for (const e of out) e.passedBy = e.of - e.failedBy.length;
    return out;
  };
  const frozen = tally("frozen");
  return {
    round,
    quorum: String(votes) + "/" + String(graded.length),
    verdict: votes >= 2 ? "quorum" : "no-quorum",
    heldoutDisagree: tally("heldout"),
    frozenMissed: frozen.length > 0 ? frozen : null,
  };
}
