const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const LINE_BREAK = /\r\n|\r|\n/;
const SEP_TRIM = /^[ \t]+|[ \t]+$/g;
const QUOTED = /"(?:\\.|[^"\\])*"/g;
const ATTRIBUTE = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;

const isSep = (c: string | undefined): boolean => c === " " || c === "\t";

const attrCut = (s: string): string => {
  const m = ATTRIBUTE.exec(s);
  const kept = m !== null ? s.slice(0, m.index) : s;
  return kept.replace(SEP_TRIM, "");
};

const codeOf = (content: string): string => {
  const spans: Array<[number, number]> = [];
  for (const m of content.matchAll(QUOTED)) {
    const a = m.index;
    if (a !== undefined) spans.push([a, a + m[0].length]);
  }
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== "#") continue;
    if (!isSep(content[i - 1])) continue;
    if (i + 1 < content.length && !isSep(content[i + 1])) continue;
    let inside = false;
    for (const [a, b] of spans) {
      if (a < i && i < b) {
        inside = true;
        break;
      }
    }
    if (inside) continue;
    return content.slice(0, i).replace(/[ \t]+$/, "");
  }
  return content;
};

export default function directive(text: string, name: string): string | null {
  if (!NAME.test(name)) throw new Error("not a directive name: " + JSON.stringify(name));
  let current: string | null = null;
  let found = false;
  const pieces: string[] = [];
  for (const raw of text.split(LINE_BREAK)) {
    let line = raw;
    let k = 0;
    while (k < line.length && line[k] === "\uFEFF") k++;
    line = line.slice(k).replace(/[ \t]+$/, "");
    if (line === "") continue;
    let n = 0;
    while (n < line.length && isSep(line[n])) n++;
    const content = line.slice(n);
    if (content.startsWith("#")) continue;
    const code = codeOf(content);
    let started: string | null = null;
    let rest = "";
    if (n === 0) {
      let e = 0;
      while (e < code.length && !isSep(code[e])) e++;
      let word = code.slice(0, e);
      rest = code.slice(e);
      if (word.endsWith(":")) {
        const w2 = word.slice(0, -1);
        if (NAME.test(w2)) word = w2;
      }
      if (NAME.test(word) && word !== "CITED") started = word;
    }
    if (started !== null) {
      if (found) break;
      current = started;
      if (started === name) {
        found = true;
        pieces.push(attrCut(rest));
      }
    } else if (current !== null && found) {
      pieces.push(attrCut(" " + code));
    }
  }
  if (!found) return null;
  return pieces.filter((p) => p !== "").join(" ");
}
