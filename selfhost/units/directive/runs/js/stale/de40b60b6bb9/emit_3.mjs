const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const CUT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;

function attrCut(s) {
  const m = ATTR.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
}

export default function directive(text, name) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error('not a directive name: ' + JSON.stringify(name));
  const lines = String(text).split(/\r\n|\r|\n/);
  let cur = null;
  let target = null;
  for (let line of lines) {
    line = line.replace(/^﻿+/, '').replace(/[ \t]+$/, '');
    if (line.trim() === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const m = CUT.exec(content);
    const code = m ? m[1].trimEnd() : content;
    let started = false;
    if (indent === '') {
      const sp = code.search(/[ \t]/);
      let word = sp < 0 ? code : code.slice(0, sp);
      const rest = sp < 0 ? '' : code.slice(sp + 1).replace(/^[ \t]+/, '');
      if (word.endsWith(':') && NAME.test(word.slice(0, -1))) word = word.slice(0, -1);
      if (NAME.test(word)) {
        cur = { name: word, pieces: [attrCut(rest)] };
        if (!target && word === name) target = cur;
        started = true;
      }
    }
    if (!started && cur) cur.pieces.push(attrCut(' ' + code));
  }
  return target ? target.pieces.join(' ').trim() : null;
}
