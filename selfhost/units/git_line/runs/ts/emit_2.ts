const BREAKS = /\r\n|\r|\n|$/g;

export default function git_line(text: string, lines: readonly number[]): number[] {
  const table: number[] = [0];
  let lf = 1;
  for (const m of text.matchAll(BREAKS)) {
    table.push(lf);
    if (m[0] === "\n" || m[0] === "\r\n") lf += 1;
    if (m[0] === "") break;
  }
  const out: number[] = [];
  for (const x of lines) {
    if (x === 0) {
      out.push(0);
    } else if (Number.isInteger(x) && x >= 1 && x < table.length) {
      out.push(table[x] ?? lf);
    } else {
      out.push(lf);
    }
  }
  return out;
}
