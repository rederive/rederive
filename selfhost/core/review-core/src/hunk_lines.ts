const MAX_HUNK = 1_000_000;
const HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export default function hunk_lines(diff: string): number[] {
  const seen = new Set<number>();
  for (const line of diff.split('\n')) {
    const m = HEADER.exec(line);
    if (m === null) continue;
    const c = Number(m[1]);
    const n = m[2] === undefined ? 1 : Number(m[2]);
    if (n > MAX_HUNK || !Number.isSafeInteger(c + n - 1)) continue;
    for (let i = Math.max(c, 1); i < c + n; i++) seen.add(i);
  }
  return Array.from(seen).sort((a, b) => a - b);
}
