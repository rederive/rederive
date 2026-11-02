const LINE_BREAK = /\r\n|\r|\n/;
const LINE_BREAK_G = /\r\n|\r|\n/g;
const LEAD = /^[ \t﻿]+/;
const TRAIL = /[ \t]+$/;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^[A-Z][A-Z0-9-]*$/;

function isDirective(raw: string): boolean {
  const line = raw.replace(LEAD, (m: string) => m.split("﻿").join("")).replace(TRAIL, "");
  if (line === "") return false;
  const first = line.charAt(0);
  if (first === " " || first === "\t" || first === "#") return false;
  let end = line.length;
  const sp = line.indexOf(" ");
  const tb = line.indexOf("\t");
  if (sp >= 0) end = sp;
  if (tb >= 0 && tb < end) end = tb;
  let name = line.slice(0, end);
  if (COLON_NAME.test(name) && name !== "CITED:") name = name.slice(0, -1);
  return NAME.test(name) && name !== "CITED";
}

export default function directive_spans(text: string): Array<[number, number]> {
  const lines = text.split(LINE_BREAK);
  const gitLines: number[] = [1];
  let g = 1;
  for (const m of text.matchAll(LINE_BREAK_G)) {
    if (m[0] !== "\r") g += 1;
    gitLines.push(g);
  }
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const gl = gitLines[i];
    if (gl === undefined) continue;
    if (isDirective(line) && starts[starts.length - 1] !== gl) starts.push(gl);
  }
  let last = text.split("\n").length;
  if (text.endsWith("\n")) last -= 1;
  last = Math.max(1, last);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    if (s === undefined) continue;
    const next = starts[i + 1];
    out.push([s, next === undefined ? last : next - 1]);
  }
  return out;
}
