export default function divergence_of(round, artifacts) {
  const attempted = artifacts.filter((a) => a.control !== true);
  if (attempted.length === 0) return null;
  const graded = attempted.filter((a) => a.error === null || a.error === undefined);
  if (graded.length === 0) {
    return { round, quorum: "0/0", verdict: "no-quorum", heldoutDisagree: [] };
  }
  for (const a of graded) {
    if (a.rungs === null || a.rungs === undefined) throw new Error("divergence: artifact " + a.artifact + " has no rungs list");
    for (const m of a._misses ?? []) {
      const s = m.slice;
      if (s != null && s !== "frozen" && s !== "heldout") throw new Error("divergence: bad slice");
    }
  }
  let votes = 0;
  for (const a of graded) {
    const tc = a.typeCheck;
    const okTc = tc == null || tc.applicable === false || tc.ok === true;
    const noMiss = a._misses == null || a._misses.length === 0;
    if (a.rungs.includes("harness-verified") && okTc && noMiss) votes++;
  }
  const tally = (S) => {
    const map = new Map();
    for (const a of graded) {
      for (const m of a._misses ?? []) {
        if ((m.slice ?? "heldout") !== S) continue;
        let e = map.get(m.name);
        if (!e) {
          e = { name: m.name, args: m.args, expected: m.expected, failedBy: [], passedBy: 0, of: graded.length };
          map.set(m.name, e);
        }
        if (!e.failedBy.includes(a.artifact)) e.failedBy.push(a.artifact);
      }
    }
    const out = [];
    for (const e of map.values()) {
      e.passedBy = graded.length - e.failedBy.length;
      out.push(e);
    }
    return out;
  };
  const res = {
    round,
    quorum: votes + "/" + graded.length,
    verdict: votes >= 2 ? "quorum" : "no-quorum",
    heldoutDisagree: tally("heldout"),
  };
  const fm = tally("frozen");
  if (fm.length > 0) res.frozenMissed = fm;
  return res;
}
