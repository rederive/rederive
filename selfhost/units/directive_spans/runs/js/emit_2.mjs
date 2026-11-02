const LINE_BREAK = /\r\n|\r|\n/;
const LEAD = new RegExp("^[ \\t\\uFEFF]+");
const TRAIL = /[ \t]+$/;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^[A-Z][A-Z0-9-]*$/;

export default function directive_spans(text) {
  const parts = text.split(LINE_BREAK);
  const breaks = [...text.matchAll(new RegExp(LINE_BREAK.source, "g"))];
  const lines = new Set();
  let git = 1;
  for (let i = 0; i < parts.length; i++) {
    let line = parts[i].replace(LEAD, (m) => m.replace(/﻿/g, "")).replace(TRAIL, "");
    if (line !== "" && line[0] !== " " && line[0] !== "\t" && line[0] !== "#") {
      let k = 0;
      while (k < line.length && line[k] !== " " && line[k] !== "\t") k++;
      let name = line.slice(0, k);
      if (name !== "CITED:" && COLON_NAME.test(name)) name = name.slice(0, -1);
      if (NAME.test(name) && name !== "CITED") lines.add(git);
    }
    if (i < breaks.length && breaks[i][0] !== "\r") git++;
  }
  const last = Math.max(1, text.split("\n").length - (text.endsWith("\n") ? 1 : 0));
  const starts = [...lines].sort((a, b) => a - b);
  return starts.map((s, i) => [s, i + 1 < starts.length ? starts[i + 1] - 1 : last]);
}
