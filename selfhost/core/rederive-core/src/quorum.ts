export default function quorum(fulls: readonly boolean[], need: number): { fullCount: number; hasQuorum: boolean; winnerIdx: number } {
  if (!Number.isInteger(need) || need < 1) {
    throw new Error("quorum: need must be an integer >= 1 (got " + String(need) + ")");
  }
  let fullCount = 0;
  let first = -1;
  for (let i = 0; i < fulls.length; i++) {
    if (fulls[i] === true) {
      fullCount++;
      if (first < 0) first = i;
    }
  }
  const hasQuorum = fullCount >= need;
  return { fullCount, hasQuorum, winnerIdx: hasQuorum ? first : -1 };
}
