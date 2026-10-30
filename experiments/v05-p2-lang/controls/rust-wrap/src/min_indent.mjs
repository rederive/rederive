export default function min_indent(input) {
  const matches = input.match(/^[ \t]*(?=\S)/gm);
  if (!matches) return 0;
  return Math.min(...matches.map((m) => m.length));
}
