const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const OPENER = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const isSep = (c) => c === ' ' || c === '\t';

// Quoted spans as [open, close] index pairs (R4).
function spansOf(s) {
  const spans = [];
  const n = s.length;
  let i = 0;
  let lastClose = -2;
  while (i < n) {
    if (s[i] === '"' && (i === 0 || OPENER.has(s[i - 1]) || i === lastClose + 1)) {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const c = s[j];
        if (c === '\\') {
          if (j + 1 >= n) { j = n; break; }
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp > 0xffff ? 2 : 1);
        } else if (c === '"') { closed = true; break; }
        else j++;
      }
      if (!closed) break;
      spans.push([i, j]);
      lastClose = j;
      i = j + 1;
    } else i++;
  }
  return spans;
}

const protectedAt = (spans, k) => spans.some(([a, b]) => a < k && k < b);

function attrCut(s) {
  const spans = spansOf(s);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const kw = m[1];
    const kwIdx = m.index + m[0].length - kw.length;
    if (!protectedAt(spans, kwIdx)) {
      return s.slice(0, m.index).replace(/^[ \t]+|[ \t]+$/g, '');
    }
  }
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

function commentCut(content) {
  const spans = spansOf(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== '#') continue;
    if (!isSep(content[i - 1])) continue;
    if (i + 1 < content.length && !isSep(content[i + 1])) continue;
    if (protectedAt(spans, i)) continue;
    return content.slice(0, i).replace(/[ \t]+$/, '');
  }
  return content;
}

export function directive(text, name) {
  if (typeof name !== 'string' || !NAME.test(name) || name === 'CITED') {
    throw new Error('not a directive name: ' + JSON.stringify(name));
  }
  const lines = String(text).split(/\r\n|\r|\n/);
  let current = null;
  let pieces = null;
  for (let line of lines) {
    line = line.replace(/^[ \t﻿]+/, (m) => m.replace(/﻿/g, ''));
    line = line.replace(/[ \t]+$/, '');
    if (line === '') continue;
    let k = 0;
    while (k < line.length && isSep(line[k])) k++;
    const indent = line.slice(0, k);
    const content = line.slice(k);
    if (content[0] === '#') continue;
    const code = commentCut(content);
    let started = null;
    let rest = '';
    if (indent === '') {
      let e = 0;
      while (e < code.length && !isSep(code[e])) e++;
      let word = code.slice(0, e);
      rest = code.slice(e);
      if (word.endsWith(':') && NAME.test(word.slice(0, -1))) word = word.slice(0, -1);
      if (NAME.test(word) && word !== 'CITED') started = word;
    }
    if (started !== null) {
      if (current === name) break;
      current = started;
      if (current === name) pieces = [attrCut(rest)];
    } else {
      if (current === null) continue;
      if (current === name) pieces.push(attrCut(' ' + code));
    }
  }
  if (pieces === null) return null;
  return pieces.filter((p) => p !== '').join(' ');
}
