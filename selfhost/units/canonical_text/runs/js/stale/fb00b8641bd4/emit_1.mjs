export default function canonical_text(text) {
  const out = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    if (line === "") continue;
    out.push(line.replace(/^[ \t]+/, "  "));
  }
  return out.length ? out.join("\n") + "\n" : "";
}
