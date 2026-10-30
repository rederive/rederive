const INV = [[9, 13], [32, 32], [34, 34], [39, 39], [0xA0, 0xA0], [0xAD, 0xAD], [0x600, 0x605], [0x61C, 0x61C], [0x6DD, 0x6DD], [0x70F, 0x70F], [0x890, 0x891], [0x8E2, 0x8E2], [0x1680, 0x1680], [0x180E, 0x180E], [0x2000, 0x200F], [0x2028, 0x202F], [0x205F, 0x2064], [0x2066, 0x206F], [0x3000, 0x3000], [0xFEFF, 0xFEFF], [0xFFF9, 0xFFFB], [0x110BD, 0x110BD], [0x110CD, 0x110CD], [0x13430, 0x1343F], [0x1BCA0, 0x1BCA3], [0x1D173, 0x1D17A], [0xE0001, 0xE0001], [0xE0020, 0xE007F]];
const OPENERS = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const LINE_BREAK = /\r\n|\r|\n/;
const NAMEFORM = /^[A-Z][A-Z0-9-]*$/;

function visible(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    let inv = false;
    for (const [a, b] of INV) if (c >= a && c <= b) { inv = true; break; }
    if (!inv) return true;
  }
  return false;
}

function trimSP(s) {
  let a = 0, b = s.length;
  while (a < b && (s[a] === ' ' || s[a] === '\t')) a++;
  while (b > a && (s[b - 1] === ' ' || s[b - 1] === '\t')) b--;
  return s.slice(a, b);
}

function spans(s) {
  const out = [];
  const n = s.length;
  let prevClose = -2;
  let i = 0;
  while (i < n) {
    if (s[i] === '"' && (i === 0 || OPENERS.has(s[i - 1]) || prevClose === i - 1)) {
      let j = i + 1, close = -1;
      while (j < n) {
        const ch = s[j];
        if (ch === '\\') {
          if (j + 1 >= n) { j = n; break; }
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp > 0xFFFF ? 2 : 1);
          continue;
        }
        if (ch === '"') { close = j; break; }
        j++;
      }
      if (close < 0) break;
      out.push([i, close]);
      prevClose = close;
      i = close + 1;
    } else i++;
  }
  return out;
}

function inside(sp, p) {
  for (const [a, b] of sp) if (p > a && p <= b) return true;
  return false;
}

function attrs(piece) {
  const sp = spans(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const found = [];
  let m;
  while ((m = re.exec(piece)) !== null) {
    const wordStart = m.index + m[0].length - m[1].length;
    if (inside(sp, wordStart)) continue;
    found.push({ start: m.index, valStart: m.index + m[0].length });
  }
  const list = found.map((f, k) => {
    const end = k + 1 < found.length ? found[k + 1].start : piece.length;
    return { value: trimSP(piece.slice(f.valStart, end)), start: f.start };
  });
  return list;
}

function normalize(line) {
  let i = 0, lead = '';
  while (i < line.length && (line[i] === ' ' || line[i] === '\t' || line[i] === '﻿')) {
    if (line[i] !== '﻿') lead += line[i];
    i++;
  }
  let s = lead + line.slice(i);
  let b = s.length;
  while (b > 0 && (s[b - 1] === ' ' || s[b - 1] === '\t')) b--;
  return s.slice(0, b);
}

export default function pin_lint(text) {
  const lines = text.split(LINE_BREAK).map(normalize);
  const dirs = [];
  let cur = null;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (line === '') continue;
    let ind = 0;
    while (ind < line.length && (line[ind] === ' ' || line[ind] === '\t')) ind++;
    const content = line.slice(ind);
    if (content[0] === '#') continue;
    const sp = spans(content);
    let code = content;
    for (let p = 1; p < content.length; p++) {
      if (content[p] === '#' && (content[p - 1] === ' ' || content[p - 1] === '\t') &&
          (p + 1 === content.length || content[p + 1] === ' ' || content[p + 1] === '\t') && !inside(sp, p)) {
        let e = p;
        while (e > 0 && (content[e - 1] === ' ' || content[e - 1] === '\t')) e--;
        code = content.slice(0, e);
        break;
      }
    }
    let isDir = false, name = '';
    if (ind === 0) {
      const sep = code.search(/[ \t]/);
      const raw = sep < 0 ? code : code.slice(0, sep);
      const nm = raw.endsWith(':') ? raw.slice(0, -1) : raw;
      if (NAMEFORM.test(nm) && nm !== 'CITED') {
        isDir = true;
        name = nm;
        const rest = sep < 0 ? '' : code.slice(sep);
        cur = { line: k + 1, name, rest, norm: line, conts: [] };
        dirs.push(cur);
      }
    }
    if (!isDir && cur) cur.conts.push(' ' + code);
  }
  const hits = [];
  let pins = 0;
  for (const d of dirs) {
    if (d.name !== 'PINNED' && d.name !== 'EARNED') continue;
    pins++;
    const own = attrs(d.rest);
    let cited = own.some(a => visible(a.value));
    if (!cited) {
      for (const c of d.conts) if (attrs(c).some(a => visible(a.value))) { cited = true; break; }
    }
    if (!cited && d.name === 'EARNED') {
      const args = trimSP(own.length ? d.rest.slice(0, own[0].start) : d.rest);
      if (visible(args)) cited = true;
      else {
        for (const c of d.conts) {
          const as = attrs(c);
          const part = as.length ? c.slice(0, as[0].start) : c;
          if (visible(part)) { cited = true; break; }
        }
      }
    }
    if (!cited) hits.push({ line: d.line, what: 'pin without a citation', text: Array.from(d.norm).slice(0, 96).join('') });
  }
  return { hits, pins };
}
