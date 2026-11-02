const LINE_BREAK = /\r\n|\r|\n/;
const LEAD = new RegExp("^[ \\t\\uFEFF]+");
const TRAIL = /[ \t]+$/;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^[A-Z][A-Z0-9-]*$/;

function isDirective(raw) {
  let line = raw.replace(LEAD, (m) => m.split("﻿").join(""));
  line = line.replace(TRAIL, "");
  if (line === "") return false;
  const c = line[0];
  if (c === " " || c === "\t" || c === "#") return false;
  let end = line.length;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === " " || line[i] === "\t") { end = i; break; }
  }
  let name = line.slice(0, end);
  if (COLON_NAME.test(name) && name !== "CITED:") name = name.slice(0, -1);
  return NAME.test(name) && name !== "CITED";
}

export default function directive_spans(text) {
  const parts = text.split(LINE_BREAK);
  const breaks = [...text.matchAll(new RegExp(LINE_BREAK.source, "g"))];
  const last = Math.max(1, text.split("\n").length - (text.endsWith("\n") ? 1 : 0));
  const starts = [];
  let git = 1;
  for (let i = 0; i < parts.length; i++) {
    if (isDirective(parts[i]) && starts[starts.length - 1] !== git) starts.push(git);
    if (i < breaks.length && breaks[i][0] !== "\r") git++;
  }
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    out.push([starts[i], i + 1 < starts.length ? starts[i + 1] - 1 : last]);
  }
  return out;
}
