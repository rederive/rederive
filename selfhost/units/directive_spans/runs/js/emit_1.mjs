const LINE_BREAK = /\r\n|\r|\n/;
const LEAD = new RegExp("^[ \\t\\uFEFF]+");
const TRAIL = /[ \t]+$/;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME_RE = /^[A-Z][A-Z0-9-]*$/;

export default function directive_spans(text) {
  const parts = text.split(LINE_BREAK);
  const breaks = [...text.matchAll(new RegExp(LINE_BREAK.source, "g"))];
  const starts = [];
  let git = 1;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && breaks[i - 1][0] !== "\r") git++;
    let line = parts[i].replace(LEAD, (m) => m.replace(/﻿/g, ""));
    line = line.replace(TRAIL, "");
    if (line === "" || line[0] === " " || line[0] === "\t" || line[0] === "#") continue;
    let sp = -1;
    for (let k = 0; k < line.length; k++) {
      if (line[k] === " " || line[k] === "\t") { sp = k; break; }
    }
    let name = sp < 0 ? line : line.slice(0, sp);
    if (COLON_NAME.test(name) && name !== "CITED:") name = name.slice(0, -1);
    if (NAME_RE.test(name) && name !== "CITED") {
      if (starts.length === 0 || starts[starts.length - 1] !== git) starts.push(git);
    }
  }
  let last = text.split("\n").length;
  if (text.endsWith("\n")) last -= 1;
  last = Math.max(1, last);
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    out.push([starts[i], i + 1 < starts.length ? starts[i + 1] - 1 : last]);
  }
  return out;
}
