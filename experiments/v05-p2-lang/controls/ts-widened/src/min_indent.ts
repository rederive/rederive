const LEADING = /^[ \t]*(?=\S)/gm;

export default function min_indent(input: string): number | undefined {
  const matches = input.match(LEADING);
  if (matches === null) return 0;
  let min = Infinity;
  for (const m of matches) {
    if (m.length < min) min = m.length;
  }
  return min === Infinity ? 0 : min;
}
