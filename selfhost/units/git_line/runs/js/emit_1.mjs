const BREAKS = /\r\n|\r|\n|$/g;

export default function git_line(text, lines) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  if (!Array.isArray(lines)) throw new TypeError("lines must be an array");
  const table = [0];
  let lf = 1;
  for (const m of text.matchAll(BREAKS)) {
    table.push(lf);
    if (m[0] === "\n" || m[0] === "\r\n") lf += 1;
    if (m[0] === "") break;
  }
  return lines.map((x) => table[x] ?? lf);
}
