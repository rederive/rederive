const INV = [[9, 13], [0x20, 0x20], [0x22, 0x22], [0x27, 0x27], [0xa0, 0xa0], [0xad, 0xad], [0x600, 0x605], [0x61c, 0x61c], [0x6dd, 0x6dd], [0x70f, 0x70f], [0x890, 0x891], [0x8e2, 0x8e2], [0x1680, 0x1680], [0x180e, 0x180e], [0x2000, 0x200f], [0x2028, 0x202f], [0x205f, 0x2064], [0x2066, 0x206f], [0x3000, 0x3000], [0xfeff, 0xfeff], [0xfff9, 0xfffb], [0x110bd, 0x110bd], [0x110cd, 0x110cd], [0x13430, 0x1343f], [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a], [0xe0001, 0xe0001], [0xe0020, 0xe007f]];
const OPENERS = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const isSP = (c) => c === ' ' || c === '\t';

function visible(s) {
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    let inv = false;
    for (const [a, b] of INV) if (cp >= a && cp <= b) { inv = true; break; }
    if (!inv) return true;
  }
  return false;
}

function trimSP(s) {
  let a = 0, b = s.length;
  while (a < b && isSP(s[a])) a++;
  while (b > a && isSP(s[b - 1])) b--;
  return s.slice(a, b);
}

function spans(s) {
  const out = [];
  let lastClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '"') { i++; continue; }
    const opens = i === 0 || OPENERS.has(s[i - 1]) || i - 1 === lastClose;
    if (!opens) { i++; continue; }
    let j = i + 1, close = -1;
    while (j < s.length) {
      const c = s[j];
      if (c === '\\') {
        const cp = s.codePointAt(j + 1);
        j += 1 + (cp === undefined ? 0 : cp > 0xffff ? 2 : 1);
        continue;
      }
      if (c === '"') { close = j; break; }
      j++;
    }
    if (close < 0) break;
    out.push([i, close]);
    lastClose = close;
    i = close + 1;
  }
  return out;
}

function inSpan(sp, idx) {
  for (const [a, b] of sp) if (idx > a && idx <= b) return true;
  return false;
}

function attrs(piece) {
  const sp = spans(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const found = [];
  let m;
  while ((m = re.exec(piece)) !== null) {
    const letter = m.index + m[0].length - m[1].length;
    if (!inSpan(sp, letter)) found.push({ start: m.index, end: m.index + m[0].length });
  }
  const values = [];
  for (let k = 0; k < found.length; k++) {
    const stop = k + 1 < found.length ? found[k + 1].start : piece.length;
    values.push(trimSP(piece.slice(found[k].end, stop)));
  }
  const head = trimSP(found.length ? piece.slice(0, found[0].start) : piece);
  return { values, head };
}

function codeOf(content) {
  const sp = spans(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] === '#' && isSP(content[i - 1]) && (i + 1 === content.length || isSP(content[i + 1])) && !inSpan(sp, i)) {
      let e = i;
      while (e > 0 && isSP(content[e - 1])) e--;
      return content.slice(0, e);
    }
  }
  return content;
}

export default function pin_lint(text) {
  const raw = text.split(/\r\n|\r|\n/);
  const hits = [];
  let pins = 0;
  let cur = null;
  const flush = () => {
    if (cur && cur.pin && !cur.cited) {
      hits.push({ line: cur.line, what: 'pin without a citation', text: Array.from(cur.norm).slice(0, 96).join('') });
    }
  };
  for (let k = 0; k < raw.length; k++) {
    const r = raw[k];
    let i = 0, lead = '';
    while (i < r.length && (isSP(r[i]) || r[i] === '﻿')) {
      if (r[i] !== '﻿') lead += r[i];
      i++;
    }
    let norm = lead + r.slice(i);
    let e = norm.length;
    while (e > 0 && isSP(norm[e - 1])) e--;
    norm = norm.slice(0, e);
    if (norm === '') continue;
    let ind = 0;
    while (ind < norm.length && isSP(norm[ind])) ind++;
    const content = norm.slice(ind);
    if (content[0] === '#') continue;
    const code = codeOf(content);
    let isDir = false, name = '', rest = '';
    if (ind === 0) {
      let n = 0;
      while (n < code.length && !isSP(code[n])) n++;
      const nm = code.slice(0, n);
      if (/^[A-Z][A-Z0-9-]*:?$/.test(nm) && nm !== 'CITED' && nm !== 'CITED:') {
        isDir = true;
        name = nm.endsWith(':') ? nm.slice(0, -1) : nm;
        rest = code.slice(n);
      }
    }
    if (isDir) {
      flush();
      const pin = name === 'PINNED' || name === 'EARNED';
      cur = { pin, name, line: k + 1, norm, cited: false };
      if (pin) {
        pins++;
        const a = attrs(rest);
        if (a.values.some(visible)) cur.cited = true;
        else if (name === 'EARNED' && visible(a.head)) cur.cited = true;
      }
    } else if (cur) {
      if (cur.pin && !cur.cited) {
        const a = attrs(' ' + code);
        if (a.values.some(visible)) cur.cited = true;
        else if (cur.name === 'EARNED' && visible(a.head)) cur.cited = true;
      }
    }
  }
  flush();
  return { hits, pins };
}
