const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const CUT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;

function attrCut(s) {
  const m = ATTR.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
}

export default function directive(text, name) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error('not a directive name: "' + name + '"');
  let cur = null;
  let args = '';
  let pieces = [];
  let found = false;
  const finish = () => [args, ...pieces].join(' ').trim();
  for (let line of String(text).split(/\r\n|\r|\n/)) {
    line = line.replace(/^﻿+/, '').replace(/[ \t]+$/, '');
    if (line.trim() === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const cm = CUT.exec(content);
    let code = cm ? cm[1].trimEnd() : content;
    let start = null;
    let rest = '';
    if (indent === '') {
      const sp = code.search(/[ \t]/);
      let word = sp < 0 ? code : code.slice(0, sp);
      rest = sp < 0 ? '' : code.slice(sp + 1).replace(/^[ \t]+/, '');
      if (word.endsWith(':') && NAME.test(word.slice(0, -1))) word = word.slice(0, -1);
      if (NAME.test(word)) start = word;
    }
    if (start !== null) {
      if (found) return finish();
      cur = start;
      if (cur === name) {
        found = true;
        args = attrCut(rest);
        pieces = [];
      }
    } else if (found) {
      pieces.push(attrCut(' ' + code));
    }
  }
  return found ? finish() : null;
}
