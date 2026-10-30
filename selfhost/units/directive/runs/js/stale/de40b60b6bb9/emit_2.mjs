const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const COMMENT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;

function attrCut(s) {
  const m = ATTR.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
}

export default function directive(text, name) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error('not a directive name: "' + name + '"');
  const lines = String(text).split(/\r\n|\r|\n/);
  let cur = null;
  for (let raw of lines) {
    let line = raw.replace(/^﻿+/, '').replace(/[ \t]+$/, '');
    if (line.trim() === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    let content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const cm = COMMENT.exec(content);
    let code = cm ? cm[1] : content;
    code = code.trimEnd();
    if (indent === '') {
      const sp = code.search(/[ \t]/);
      let word = sp < 0 ? code : code.slice(0, sp);
      let rest = sp < 0 ? '' : code.slice(sp + 1).replace(/^[ \t]+/, '');
      if (/^(?:[A-Z][A-Z0-9-]*|R[0-9]+):$/.test(word)) word = word.slice(0, -1);
      if (NAME.test(word)) {
        if (cur && cur.name === name) break;
        cur = { name: word, parts: [attrCut(rest)] };
        continue;
      }
    }
    if (cur) cur.parts.push(attrCut(' ' + code));
  }
  if (cur && cur.name === name) return cur.parts.join(' ').trim();
  return null;
}
