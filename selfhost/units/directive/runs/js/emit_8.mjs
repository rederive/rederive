const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const OPENER = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const isSep = (c) => c === ' ' || c === '\t';
const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');

function spansOf(s) {
  const out = [];
  const n = s.length;
  let i = 0;
  let prevClose = -2;
  while (i < n) {
    if (s[i] === '"' && (i === 0 || OPENER.has(s[i - 1]) || i === prevClose + 1)) {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const c = s[j];
        if (c === '\\') {
          if (j + 1 >= n) { j = n; break; }
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp > 0xffff ? 2 : 1);
          continue;
        }
        if (c === '"') { closed = true; break; }
        j++;
      }
      if (!closed) break;
      out.push([i, j]);
      prevClose = j;
      i = j + 1;
    } else i++;
  }
  return out;
}

const inside = (spans, k) => spans.some(([a, b]) => a < k && k < b);

function attrCut(s) {
  const spans = spansOf(s);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const kw = m.index + m[0].length - m[1].length;
    if (!inside(spans, kw)) return trim(s.slice(0, m.index));
  }
  return trim(s);
}

export function directive(text, name) {
  if (typeof name !== 'string' || !NAME.test(name) || name === 'CITED') throw new Error('not a directive name');
  const lines = text.split(/\r\n|\r|\n/);
  let found = false;
  let cur = false;
  let pieces = [];
  for (let raw of lines) {
    let line = raw.replace(/^[ \t﻿]+/, (m) => m.replace(/﻿/g, '')).replace(/[ \t]+$/, '');
    if (line === '') continue;
    let p = 0;
    while (p < line.length && isSep(line[p])) p++;
    const indent = line.slice(0, p);
    const content = line.slice(p);
    if (content[0] === '#') continue;
    const spans = spansOf(content);
    let code = content;
    for (let k = 1; k < content.length; k++) {
      if (content[k] !== '#') continue;
      if (!isSep(content[k - 1])) continue;
      if (k + 1 < content.length && !isSep(content[k + 1])) continue;
      if (inside(spans, k)) continue;
      code = content.slice(0, k).replace(/[ \t]+$/, '');
      break;
    }
    if (indent === '') {
      let q = 0;
      while (q < code.length && !isSep(code[q])) q++;
      let word = code.slice(0, q);
      const rest = code.slice(q);
      if (/^[A-Z][A-Z0-9-]*:$/.test(word)) word = word.slice(0, -1);
      if (NAME.test(word) && word !== 'CITED') {
        if (found) break;
        if (word === name) { found = true; cur = true; pieces = [attrCut(rest)]; }
        else cur = false;
        continue;
      }
    }
    if (cur) pieces.push(attrCut(' ' + code));
  }
  if (!found) return null;
  return pieces.filter((x) => x !== '').join(' ');
}
