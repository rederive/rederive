const BREAK_SPLIT = /\r\n|\r|\n/;
const LEADING_MARKS = /^﻿+/;
const TRAILING_PAD = /[ \t]+$/;
const LEADING_PAD = /^[ \t]+/;

export default function canonical_text(text: string): string {
  const kept: string[] = [];
  for (const raw of text.split(BREAK_SPLIT)) {
    const line = raw.replace(LEADING_MARKS, "").replace(TRAILING_PAD, "");
    if (line === "") continue;
    kept.push(line.replace(LEADING_PAD, "  "));
  }
  return kept.length === 0 ? "" : kept.join("\n") + "\n";
}
