export default function canonical_text(text: string): string {
  const kept: string[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    if (line === "") continue;
    kept.push(line.replace(/^[ \t]+/, "  "));
  }
  return kept.length === 0 ? "" : kept.join("\n") + "\n";
}
