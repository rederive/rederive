const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const LINE_BREAK = /\r\n|\r|\n/;
const SEP_TRIM = /^[ \t]+|[ \t]+$/g;
const QUOTED = /"(?:\\.|[^"\\])*"/g;
const ATTRIBUTE = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;

function isSep(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function attrCut(s: string): string {
  const m = ATTRIBUTE.exec(s);
  const kept = m !== null ? s.slice(0, m.index) : s;
  return kept.replace(SEP_TRIM, "");
}

function commentCut(content: string): string {
  const spans: Array<[number, number]> = [];
  for (const m of content.matchAll(QUOTED)) {
    const a = m.index;
    if (a === undefined) continue;
    spans.push([a, a + m[0].length]);
  }
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== "#") continue;
    if (!isSep(content[i - 1])) continue;
    if (i + 1 < content.length && !isSep(content[i + 1])) continue;
    let protectedHash = false;
    for (const [a, b] of spans) {
      if (a < i && i < b) {
        protectedHash = true;
        break;
      }
    }
    if (protectedHash) continue;
    return content.slice(0, i).replace(/[ \t]+$/, "");
  }
  return content;
}

export default function directive(text: string, name: string): string | null {
  if (!NAME.test(name)) throw new Error("not a directive name: " + JSON.stringify(name));
  let current: string | null = null;
  let found = false;
  const pieces: string[] = [];
  for (const raw of text.split(LINE_BREAK)) {
    let start = 0;
    while (start < raw.length && raw[start] === "\uFEFF") start++;
    const line = raw.slice(start).replace(/[ \t]+$/, "");
    if (line === "") continue;
    let k = 0;
    while (k < line.length && isSep(line[k])) k++;
    const indent = k;
    const content = line.slice(k);
    if (content.startsWith("#")) continue;
    const code = commentCut(content);
    let isDirective = false;
    let dname = "";
    let rest = "";
    if (indent === 0) {
      let j = 0;
      while (j < code.length && !isSep(code[j])) j++;
      const word = code.slice(0, j);
      rest = code.slice(j);
      let cand = word;
      if (word.endsWith(":") && NAME.test(word.slice(0, -1))) cand = word.slice(0, -1);
      if (NAME.test(cand) && cand !== "CITED") {
        isDirective = true;
        dname = cand;
      }
    }
    if (isDirective) {
      if (found) break;
      current = dname;
      if (dname === name) {
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
