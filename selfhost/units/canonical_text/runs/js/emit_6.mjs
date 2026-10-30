export default function canonical_text(text) {
  const out = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    let line = raw;
    const m = /^[ \t﻿]+/.exec(line);
    if (m) line = m[0].replace(/﻿/g, '') + line.slice(m[0].length);
    line = line.replace(/[ \t]+$/, '');
    if (line === '') continue;
    line = line.replace(/^[ \t]+/, '  ');
    out.push(line);
  }
  return out.length ? out.join('\n') + '\n' : '';
}
