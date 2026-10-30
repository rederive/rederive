export default function canonical_text(text) {
  const out = [];
  for (let line of text.split(/\r\n|\r|\n/)) {
    const m = /^[ \t﻿]+/.exec(line);
    if (m) line = m[0].replace(/﻿/g, "") + line.slice(m[0].length);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    out.push(line.replace(/^[ \t]+/, "  "));
  }
  return out.length ? out.join("\n") + "\n" : "";
}
