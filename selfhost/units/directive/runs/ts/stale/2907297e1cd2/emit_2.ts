const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const LINE_BREAK = /\r\n|\r|\n/;
const COMMENT_CUT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const ATTRIBUTE = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;

function attrCut(s: string): string {
  const m = ATTRIBUTE.exec(s);
  if (m === null) return s.trim();
  return s.slice(0, m.index).trim();
}

export default function directive(text: string, name: string): string | null {
  if (!NAME.test(name)) throw new Error('not a directive name: "' + name + '"');
  let found = false;
  let pieces: string[] = [];
  let current: string | null = null;
  for (const raw of text.split(LINE_BREAK)) {
    const line = raw.replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    if (/^\s*$/.test(line)) continue;
    const indent = /^[ \t]*/.exec(line);
    const ind = indent === null ? "" : indent[0];
    const content = line.slice(ind.length);
    if (content.startsWith("#")) continue;
    const cm = COMMENT_CUT.exec(content);
    const code = (cm === null ? content : cm[1] === undefined ? content : cm[1]).trimEnd();
    let started: string | null = null;
    let args = "";
    if (ind.length === 0) {
      const sp = code.search(/[ \t]/);
      const word = sp < 0 ? code : code.slice(0, sp);
      const rest = sp < 0 ? "" : code.slice(sp + 1).replace(/^[ \t]+/, "");
      let nm: string | null = null;
      if (NAME.test(word)) nm = word;
      else if (word.endsWith(":") && NAME.test(word.slice(0, -1))) nm = word.slice(0, -1);
      if (nm !== null) {
        started = nm;
        args = attrCut(rest);
      }
    }
    if (started !== null) {
      if (found) break;
      current = started;
      if (current === name) {
        found = true;
        pieces = [args];
      }
    } else if (found) {
      pieces.push(attrCut(" " + code));
    }
  }
  if (!found) return null;
  return pieces.join(" ").trim();
}
