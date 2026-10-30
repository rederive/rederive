const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const OPENER = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const isSep = (c) => c === ' ' || c === '\t';
const trimSep = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');

function spansOf(s) {
  const spans = [];
  const n = s.length;
  let i = 0;
  let prevClose = -2;
  while (i < n) {
    if (s[i] === '"' && (i === 0 || OPENER.has(s[i - 1]) || i === prevClose + 1)) {
      let j = i + 1;
      let close = -1;
      while (j < n) {
        const c = s[j];
        if (c === '\\') {
          if (j + 1 >= n) { j = n; break; }
          const h = s.charCodeAt(j + 1);
          const l = j + 2 < n ? s.charCodeAt(j + 2) : 0;
          j += 2 + (h >= 0xd800 && h <= 0xdbff && l >= 0xdc00 && l <= 0xdfff ? 1 : 0);
        } else if (c === '"') { close = j; break; }
        else j++;
      }
      if (close < 0) break;
      spans.push([i, close]);
      prevClose = close;
      i = close + 1;
    } else i++;
  }
  return spans;
}

const inside = (spans, x) => spans.some(([a, b]) => a < x && x < b);

function attrCut(s) {
  const spans = spansOf(s);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const kw = m.index + m[0].length - m[1].length;
    if (!inside(spans, kw)) return trimSep(s.slice(0, m.index));
  }
  return trimSep(s);
}

function cutComment(content) {
  const spans = spansOf(content);
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '#') continue;
    if (i === 0 || !isSep(content[i - 1])) continue;
    if (i + 1 < content.length && !isSep(content[i + 1])) continue;
    if (inside(spans, i)) continue;
    return content.slice(0, i).replace(/[ \t]+$/, '');
  }
  return content;
}

export function directive(text, name) {
  if (typeof name !== 'string' || !NAME.test(name) || name === 'CITED') throw new Error('not a directive name: ' + JSON.stringify(name));
  const lines = String(text).split(/\r\n|\r|\n/);
  let cur = null;
  let found = null;
  let done = false;
  for (let line of lines) {
    line = line.replace(/^[ \t﻿]+/, (m) => m.replace(/﻿/g, ''));
    line = line.replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content[0] === '#') continue;
    const code = cutComment(content);
    let started = null;
    let piece;
    if (indent === '') {
      let k = 0;
      while (k < code.length && !isSep(code[k])) k++;
      let word = code.slice(0, k);
      const rest = code.slice(k);
      let nm = word;
      if (nm.endsWith(':') && NAME.test(nm.slice(0, -1))) nm = nm.slice(0, -1);
      if (NAME.test(nm) && nm !== 'CITED') {
        started = nm;
        piece = attrCut(rest);
      }
    }
    if (started !== null) {
      if (found !== null) { done = true; break; }
      cur = started;
      if (started === name) found = [piece];
    } else {
      if (cur === null) continue;
      if (found !== null) found.push(attrCut(' ' + code));
    }
  }
  void done;
  if (found === null) return null;
  return found.filter((p) => p !== '').join(' ');
}
