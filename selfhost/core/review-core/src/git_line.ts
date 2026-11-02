export default function git_line(text: string, lines: readonly number[]): number[] {
  const table: number[] = [0];
  let lf = 1;
  for (const m of text.matchAll(/\r\n|\r|\n|$/g)) {
    table.push(lf);
    if (m[0] === "\n" || m[0] === "\r\n") lf += 1;
    if (m[0] === "") break;
  }
  const last = table.length - 1;
  return lines.map((x: number): number => {
    if (x === 0) return 0;
    if (Number.isInteger(x) && x >= 1 && x <= last) {
      return table[x] ?? lf;
    }
    return lf;
  });
}
