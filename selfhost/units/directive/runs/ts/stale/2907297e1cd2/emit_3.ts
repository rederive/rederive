const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const LINE_BREAK = /\r\n|\r|\n/;
const COMMENT_CUT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const ATTRIBUTE = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;

function attrCut(s: string): string {
  const m = ATTRIBUTE.exec(s);
  if (m !== null) return s.slice(0, m.index).trim();
  return s.trim();
}

export default function directive(text: string, name: string): string | null {
  if (!NAME.test(name)) throw new Error('not a directive name: ' + JSON.stringify(name));
  let started = false;
  let hit = false;
  const parts: string[] = [];
  for (const raw of text.split(LINE_BREAK)) {
    const line = raw.replace(/^﻿+/, '').replace(/[ \t]+$/, '');
    if (/^\s*$/.test(line)) continue;
    const indent = /^[ \t]*/.exec(line);
    const indentLen = indent === null ? 0 : indent[0].length;
    const content = line.slice(indentLen);
    if (content.startsWith('#')) continue;
    const cm = COMMENT_CUT.exec(content);
    let code = content;
    if (cm !== null) {
      const g = cm[1];
      code = (g === undefined ? '' : g).replace(/\s+$/, '');
    }
    let isStart = false;
    let dname = '';
    let args = '';
    if (indentLen === 0) {
      const sep = code.search(/[ \t]/);
      let word = code;
      let rest = '';
      if (sep >= 0) {
        word = code.slice(0, sep);
        rest = code.slice(sep + 1).replace(/^[ \t]+/, '');
      }
      let cand = word;
      if (word.endsWith(':') && NAME.test(word.slice(0, -1))) cand = word.slice(0, -1);
      if (NAME.test(cand)) {
        isStart = true;
        dname = cand;
        args = attrCut(rest);
      }
    }
    if (isStart) {
      if (hit) break;
      started = true;
      if (dname === name) {
        hit = true;
        parts.push(args);
      }
    } else if (started && hit) {
      parts.push(attrCut(' ' + code));
    }
  }
  if (!hit) return null;
  return parts.join(' ').trim();
}
