const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const SEPTRIM = /^[ \t]+|[ \t]+$/g;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;

const attrCut = (s) => {
  const m = ATTR.exec(s);
  if (m) s = s.slice(0, m.index);
  return s.replace(SEPTRIM, '');
};

export default function directive(text, name) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error('not a directive name: ' + JSON.stringify(name));
  const lines = String(text).split(/\r\n|\r|\n/);
  let cur = false;
  let found = false;
  const pieces = [];
  for (let line of lines) {
    line = line.replace(/^\uFEFF+/, '').replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const spans = [];
    const q = /"(?:\\.|[^"\\])*"/g;
    let m;
    while ((m = q.exec(content)) !== null) spans.push([m.index, m.index + m[0].length]);
    let code = content;
    for (let i = 0; i < content.length; i++) {
      if (content[i] !== '#') continue;
      if (i === 0) continue;
      const p = content[i - 1];
      if (p !== ' ' && p !== '\t') continue;
      if (i + 1 < content.length && content[i + 1] !== ' ' && content[i + 1] !== '\t') continue;
      if (spans.some(([a, b]) => a < i && i < b)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, '');
      break;
    }
    if (indent === '') {
      const sp = code.search(/[ \t]/);
      let word = sp === -1 ? code : code.slice(0, sp);
      const rest = sp === -1 ? '' : code.slice(sp);
      if (word.endsWith(':') && NAME.test(word.slice(0, -1))) word = word.slice(0, -1);
      if (NAME.test(word) && word !== 'CITED') {
        if (found) break;
        cur = true;
        if (word === name) {
          found = true;
          pieces.push(attrCut(rest));
        }
        continue;
      }
    }
    if (cur && found) pieces.push(attrCut(' ' + code));
  }
  if (!found) return null;
  return pieces.filter((p) => p !== '').join(' ');
}

export { directive };
