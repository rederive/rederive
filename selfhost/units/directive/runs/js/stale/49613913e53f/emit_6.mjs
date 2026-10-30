const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const attr = (s) => {
  const m = ATTR.exec(s);
  return trim(m ? s.slice(0, m.index) : s);
};
const isSep = (c) => c === ' ' || c === '\t';

export default function directive(text, name) {
  if (!NAME.test(name)) throw new Error('not a directive name: ' + JSON.stringify(name));
  let found = false;
  const pieces = [];
  for (let line of text.split(/\r\n|\r|\n/)) {
    line = line.replace(/^\uFEFF+/, '').replace(/[ \t]+$/, '');
    if (line === '') continue;
    let k = 0;
    while (k < line.length && isSep(line[k])) k++;
    const indent = k;
    const content = line.slice(k);
    if (content[0] === '#') continue;
    const spans = [];
    for (const m of content.matchAll(/"(?:\\.|[^"\\])*"/g)) spans.push([m.index, m.index + m[0].length]);
    let code = content;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      if (!isSep(content[i - 1])) continue;
      if (i + 1 < content.length && !isSep(content[i + 1])) continue;
      if (spans.some(([a, b]) => a < i && i < b)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, '');
      break;
    }
    let dname = null;
    let rest = '';
    if (indent === 0) {
      let j = 0;
      while (j < code.length && !isSep(code[j])) j++;
      let word = code.slice(0, j);
      rest = code.slice(j);
      if (word.endsWith(':') && NAME.test(word.slice(0, -1))) word = word.slice(0, -1);
      if (NAME.test(word) && word !== 'CITED') dname = word;
    }
    if (dname !== null) {
      if (found) break;
      if (dname === name) {
        found = true;
        pieces.push(attr(rest));
      }
    } else if (found) {
      pieces.push(attr(' ' + code));
    }
  }
  if (!found) return null;
  return pieces.filter((p) => p).join(' ');
}
