const LINE_BREAK = /\r\n|\r|\n/;
const LINE_BREAK_G = /\r\n|\r|\n/g;
const LEAD = new RegExp("^[ \\t\\uFEFF]+");
const TRAIL = /[ \t]+$/;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^[A-Z][A-Z0-9-]*$/;

function isDirective(raw: string): boolean {
  const line = raw.replace(LEAD, (m) => m.split("﻿").join("")).replace(TRAIL, "");
  if (line === "") return false;
  const first = line.charAt(0);
  if (first === " " || first === "\t" || first === "#") return false;
  let end = line.length;
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (c === " " || c === "\t") {
      end = i;
      break;
    }
  }
  let name = line.slice(0, end);
  if (name !== "CITED:" && COLON_NAME.test(name)) name = name.slice(0, -1);
  return NAME.test(name) && name !== "CITED";
}

export default function directive_spans(text: string): Array<[number, number]> {
  const parts = text.split(LINE_BREAK);
  const breaks = Array.from(text.matchAll(LINE_BREAK_G), (m) => m[0]);
  const last = Math.max(1, text.split("\n").length - (text.endsWith("\n") ? 1 : 0));
  const starts: number[] = [];
  let git = 1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p !== undefined && isDirective(p)) {
      if (starts.length === 0 || starts[starts.length - 1] !== git) starts.push(git);
    }
    const b = breaks[i];
    if (b === "\n" || b === "\r\n") git++;
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i] as number;
    const nx = starts[i + 1];
    out.push([s, nx === undefined ? last : nx - 1]);
  }
  return out;
}
