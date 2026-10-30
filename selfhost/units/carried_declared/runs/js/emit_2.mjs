const OPENERS = ' \t([{,=:;|<>!&-~';
const isSP = (c) => c === ' ' || c === '\t';
const trimSP = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const CF = /[\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]/u;
const VISIBLE = /[^\s]/u;

function quotedSpans(s) {
  const spans = [];
  let prevClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.includes(s[i - 1]) || i === prevClose + 1)) {
      let j = i + 1;
      let close = -1;
      while (j < s.length) {
        if (s[j] === '\\') {
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp === undefined ? 1 : cp > 0xffff ? 2 : 1);
        } else if (s[j] === '"') {
          close = j;
          break;
        } else j++;
      }
      if (close < 0) break;
      spans.push([i, close]);
      prevClose = close;
      i = close + 1;
    } else i++;
  }
  return spans;
}

const inside = (spans, i) => spans.some(([a, b]) => i > a && i < b);

function cutAtHash(content) {
  const spans = quotedSpans(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] === '#' && isSP(content[i - 1]) && (i + 1 === content.length || isSP(content[i + 1])) && !inside(spans, i)) {
      return trimSP(content.slice(0, i)).replace(/[ \t]+$/, '');
    }
  }
  return content;
}

function cutAttrs(r) {
  const spans = quotedSpans(r);
  for (let i = 1; i < r.length; i++) {
    if (!isSP(r[i - 1])) continue;
    for (const w of ['CITED', 'EARNED', 'ANCHOR']) {
      if (r.startsWith(w, i)) {
        const e = i + w.length;
        if ((e === r.length || isSP(r[e])) && !inside(spans, i)) return trimSP(r.slice(0, i));
      }
    }
  }
  return trimSP(r);
}

function checkNumerals(E) {
  const blanked = E.replace(/"(?:\\[^]|[^"\\])*"/g, '');
  const nums = blanked.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) || [];
  for (const n of nums) {
    const X = Number(n);
    if (!Number.isFinite(X)) throw new Error('numeral not finite');
    if (Math.abs(X) > 2 ** 53) throw new Error('numeral too large');
    if (X === 0 && /[1-9]/.test(n.split(/[eE]/)[0])) throw new Error('underflow');
    if (/^-?\d+$/.test(n) && BigInt(n) !== BigInt(X)) throw new Error('inexact integer');
  }
}

export function carried_declared(text) {
  const dirs = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const lead = raw.match(/^[ \t\uFEFF]*/)[0];
    let s = lead.replace(/\uFEFF/g, '') + raw.slice(lead.length);
    s = s.replace(/[ \t]+$/, '');
    const indent = s.match(/^[ \t]*/)[0];
    const content = s.slice(indent.length);
    if (content === '') continue;
    if (content[0] === '#') continue;
    const code = cutAtHash(content);
    let k = 0;
    while (k < code.length && !isSP(code[k])) k++;
    const token = code.slice(0, k);
    const m = indent === '' ? /^([A-Z][A-Z0-9-]*):?$/.exec(token) : null;
    if (m && m[1] !== 'CITED') {
      dirs.push({ name: m[1], args: cutAttrs(code.slice(k)), bodies: [] });
    } else if (dirs.length) {
      const body = cutAttrs(' ' + code);
      if (body !== '') dirs[dirs.length - 1].bodies.push(body);
    }
  }
  const carried = dirs.filter((d) => d.name === 'CARRIED');
  if (carried.length === 0) return null;
  if (dirs.some((d) => d.name === 'CANONICAL-SHA256' || d.name === 'SHAPE' || d.name === 'AUTHORITY')) throw new Error('sub-field at column 0');
  if (carried.length > 1) throw new Error('second CARRIED');
  const c = carried[0];
  const h = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]+FROM[ \t]+(.+)$/.exec(c.args);
  if (!h) throw new Error('malformed CARRIED head');
  let sha = null;
  let shape = null;
  const assertions = [];
  for (const body of c.bodies) {
    if (!/^(?:CANONICAL-SHA256|SHAPE|AUTHORITY)(?![A-Z0-9-])/.test(body)) continue;
    const sm = /^(CANONICAL-SHA256|SHAPE|AUTHORITY)(?:[ \t]+([^]*))?$/.exec(body);
    if (!sm) throw new Error('malformed keyword line');
    const kw = sm[1];
    const value = sm[2] === undefined ? '' : sm[2];
    if (kw === 'CANONICAL-SHA256') {
      if (sha !== null) throw new Error('repeated hash');
      if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('bad hash');
      sha = value;
    } else if (kw === 'SHAPE') {
      if (shape !== null) throw new Error('repeated shape');
      if (value === '') throw new Error('empty shape');
      shape = value;
    } else {
      const am = /^\{[ \t]*expr:[ \t]*("(?:\\[^]|[^"\\])*")[ \t]*,[ \t]*equals:[ \t]*([^]+?)[ \t]*\}$/.exec(value);
      if (!am) throw new Error('malformed AUTHORITY');
      const expr = JSON.parse(am[1]);
      const equals = JSON.parse(am[2]);
      checkNumerals(am[2]);
      if (!/[^\s]/u.test(expr) && true) {
        // only WS characters present
      }
      let visible = false;
      for (const ch of expr) {
        if (!/\s/u.test(ch) && !CF.test(ch)) { visible = true; break; }
      }
      if (!visible) throw new Error('invisible expr');
      assertions.push({ expr, equals });
    }
  }
  return { name: h[1], from: h[2], sha, shape, assertions };
}
