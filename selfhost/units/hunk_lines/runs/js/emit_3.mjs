const MAX_HUNK = 1000000;
const HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export default function hunk_lines(diff) {
  const out = new Set();
  for (const line of diff.split('\n')) {
    const m = HEADER.exec(line);
    if (!m) continue;
    const C = Number(m[1]);
    const N = m[2] === undefined ? 1 : Number(m[2]);
    if (N > MAX_HUNK || !Number.isSafeInteger(C + N - 1)) continue;
    for (let i = Math.max(C, 1); i < C + N; i++) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}
