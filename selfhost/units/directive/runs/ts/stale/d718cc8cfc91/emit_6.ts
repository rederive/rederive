const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const LINE_BREAK = /\r\n|\r|\n/;
const SEP_TRIM = /^[ \t]+|[ \t]+$/g;
const QUOTED = /"(?:\\.|[^"\\])*"/g;
const ATTRIBUTE = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;

function sepTrim(s: string): string {
  return s.replace(SEP_TRIM, "");
}

function isSep(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function attrCut(s: string): string {
  const m = ATTRIBUTE.exec(s);
  if (m === null) return sepTrim(s);
  return sepTrim(s.slice(0, m.index));
}

function commentCut(content: string): string {
  const spans: Array<[number, number]> = [];
  for (const m of content.matchAll(QUOTED)) {
    const a = m.index;
    if (a === undefined) continue;
    spans.push([a, a + m[0].length]);
  }
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== "#") continue;
    if (i === 0 || !isSep(content[i - 1])) continue;
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
}

export default function directive(text: string, name: string): string | null {
  if (!NAME.test(name)) throw new Error('not a directive name: "' + name + '"');
  let current: string | null = null;
  let pieces: string[] = [];
  let found = false;
  let result: string[] = [];
  const lines = text.split(LINE_BREAK);
  for (const raw of lines) {
    let line = raw;
    while (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    let k = 0;
    while (k < line.length && isSep(line[k])) k++;
    const content = line.slice(k);
    if (content.startsWith("#")) continue;
    const code = commentCut(content);
    let startName: string | null = null;
    let first = "";
    if (k === 0) {
      let e = 0;
      while (e < code.length && !isSep(code[e])) e++;
      let word = code.slice(0, e);
      const rest = code.slice(e);
      if (word.endsWith(":") && NAME.test(word.slice(0, -1))) word = word.slice(0, -1);
      if (NAME.test(word) && word !== "CITED") {
        startName = word;
        first = attrCut(rest);
      }
    }
    if (startName !== null) {
      if (found) break;
      current = startName;
      pieces = [first];
      if (current === name) {
        found = true;
        result = pieces;
      }
    } else {
      if (current === null) continue;
      if (found) result.push(attrCut(" " + code));
    }
  }
  if (!found) return null;
  return result.filter((p) => p !== "").join(" ");
}
