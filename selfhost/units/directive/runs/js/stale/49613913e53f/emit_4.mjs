const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const isSep = (c) => c === ' ' || c === '\t';
const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');

function attrCut(s) {
  const m = ATTR.exec(s);
  if (m) s = s.slice(0, m.index);
  return trim(s);
}

function commentCut(content) {
  const spans = [];
  const re = /"(?:\\.|[^"\\])*"/g;
  let m;
  while ((m = re.exec(content)) !== null) spans.push([m.index, m.index + m[0].length]);
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== '#') continue;
    if (!isSep(content[i - 1])) continue;
    if (i + 1 < content.length && !isSep(content[i + 1])) continue;
    if (spans.some(([a, b]) => a < i && i < b)) continue;
    let j = i;
    while (j > 0 && isSep(content[j - 1])) j--;
    return content.slice(0, j);
  }
  return content;
}

export default function directive(text, name) {
  if (!NAME.test(name)) throw new Error('not a directive name: ' + JSON.stringify(name));
  const lines = text.split(/\r\n|\r|\n/);
  let cur = null;
  let found = null;
  for (let line of lines) {
    line = line.replace(/^\uFEFF+/, '');
    line = line.replace(/[ \t]+$/, '');
    if (line === '') continue;
    let k = 0;
    while (k < line.length && isSep(line[k])) k++;
    const indent = line.slice(0, k);
    const content = line.slice(k);
    if (content[0] === '#') continue;
    const code = commentCut(content);
    let started = null;
    if (indent === '') {
      let e = 0;
      while (e < code.length && !isSep(code[e])) e++;
      let word = code.slice(0, e);
      const rest = code.slice(e);
      if (word.endsWith(':') && NAME.test(word.slice(0, -1))) word = word.slice(0, -1);
      if (NAME.test(word) && word !== 'CITED') started = { name: word, pieces: [attrCut(rest)] };
    }
    if (started) {
      if (found) break;
      cur = started;
      if (cur.name === name) found = cur;
    } else if (cur) {
      cur.pieces.push(attrCut(' ' + code));
    }
  }
  if (!found) return null;
  return found.pieces.filter((p) => p !== '').join(' ');
}
