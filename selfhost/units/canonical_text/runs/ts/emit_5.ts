export default function canonical_text(text: string): string {
  const kept: string[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    let line = raw.replace(/^[ \t﻿]+/, (run) => run.replace(/﻿/g, ""));
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    line = line.replace(/^[ \t]+/, "  ");
    kept.push(line);
  }
  return kept.length === 0 ? "" : kept.join("\n") + "\n";
}
