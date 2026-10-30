const LINES = /\r\n|\r|\n/;
const HEAD = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]+FROM[ \t]+(.+)$/;
const KEYWORD = /^(?:CANONICAL-SHA256|SHAPE|AUTHORITY)(?![A-Z0-9-])/;
const SUBFIELD = /^(CANONICAL-SHA256|SHAPE|AUTHORITY)(?:[ \t]+([^]*))?$/;
const AUTH = /^\{[ \t]*expr:[ \t]*("(?:\\[^]|[^"\\])*")[ \t]*,[ \t]*equals:[ \t]*([^]+?)[ \t]*\}$/;
const NUMERAL = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const VISIBLE = /[^\s\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]/u;
const OPENERS = ' \t([{,=:;|<>!&-~';
const trimSP = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');

function inside(s) {
  const flags = new Array(s.length).fill(false);
  let i = 0;
  let lastClose = -2;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.includes(s[i - 1]) || i - 1 === lastClose)) {
      let j = i + 1;
      let close = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === '\\') {
          j++;
          if (j < s.length) {
            const cp = s.codePointAt(j);
            j += cp > 0xffff ? 2 : 1;
          }
          continue;
        }
        if (c === '"') { close = j; break; }
        j++;
      }
      if (close < 0) break;
      for (let k = i + 1; k < close; k++) flags[k] = true;
      lastClose = close;
      i = close + 1;
    } else i++;
  }
  return flags;
}

function cutAttr(s) {
  const fl = inside(s);
  for (let i = 1; i < s.length; i++) {
    if (fl[i]) continue;
    if (s[i - 1] !== ' ' && s[i - 1] !== '\t') continue;
    for (const w of ['CITED', 'EARNED', 'ANCHOR']) {
      if (s.startsWith(w, i)) {
        const n = s[i + w.length];
        if (n === undefined || n === ' ' || n === '\t') return trimSP(s.slice(0, i));
      }
    }
  }
  return trimSP(s);
}

function cutComment(s) {
  const fl = inside(s);
  for (let i = 1; i < s.length; i++) {
    if (s[i] !== '#' || fl[i]) continue;
    if (s[i - 1] !== ' ' && s[i - 1] !== '\t') continue;
    const n = s[i + 1];
    if (n === undefined || n === ' ' || n === '\t') return s.slice(0, i).replace(/[ \t]+$/, '');
  }
  return s;
}

function checkNumerals(e) {
  const blanked = e.replace(/"(?:\\[^]|[^"\\])*"/g, '""');
  for (const m of blanked.match(NUMERAL) || []) {
    const x = Number(m);
    if (!Number.isFinite(x)) throw new Error('numeral');
    if (Math.abs(x) > 2 ** 53) throw new Error('numeral');
    const mant = m.split(/[eE]/)[0];
    if (x === 0 && /[1-9]/.test(mant)) throw new Error('numeral');
    if (/^-?\d+$/.test(m) && BigInt(m) !== BigInt(x)) throw new Error('numeral');
  }
}

export function carried_declared(text) {
  const dirs = [];
  for (const raw of text.split(LINES)) {
    const lead = /^[ \t\uFEFF]*/.exec(raw)[0];
    const indent = lead.replace(/\uFEFF/g, '');
    const content = raw.slice(lead.length).replace(/[ \t]+$/, '');
    if (content === '') continue;
    if (content[0] === '#') continue;
    const code = cutComment(content);
    let m;
    if (indent === '' && (m = /^([^ \t]*)/.exec(code)) && /^[A-Z][A-Z0-9-]*:?$/.test(m[1])) {
      const name = m[1].replace(/:$/, '');
      if (name !== 'CITED') {
        dirs.push({ name, args: cutAttr(code.slice(m[1].length)), conts: [] });
        continue;
      }
    }
    if (dirs.length === 0) continue;
    const body = cutAttr(' ' + code);
    if (body !== '') dirs[dirs.length - 1].conts.push(body);
  }
  const carried = dirs.filter((d) => d.name === 'CARRIED');
  if (carried.length === 0) return null;
  if (dirs.some((d) => d.name === 'CANONICAL-SHA256' || d.name === 'SHAPE' || d.name === 'AUTHORITY')) throw new Error('not indented');
  if (carried.length > 1) throw new Error('one CARRIED');
  const hm = HEAD.exec(carried[0].args);
  if (!hm) throw new Error('head');
  let sha = null;
  let shape = null;
  const assertions = [];
  for (const body of carried[0].conts) {
    if (!KEYWORD.test(body)) continue;
    const sm = SUBFIELD.exec(body);
    if (!sm) throw new Error('subfield');
    const value = sm[2] === undefined ? '' : sm[2];
    if (sm[1] === 'CANONICAL-SHA256') {
      if (sha !== null) throw new Error('dup sha');
      if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('sha');
      sha = value;
    } else if (sm[1] === 'SHAPE') {
      if (shape !== null) throw new Error('dup shape');
      if (value === '') throw new Error('shape');
      shape = value;
    } else {
      const am = AUTH.exec(value);
      if (!am) throw new Error('authority');
      const expr = JSON.parse(am[1]);
      const equals = JSON.parse(am[2]);
      checkNumerals(am[2]);
      if (!VISIBLE.test(expr)) throw new Error('expr');
      assertions.push({ expr, equals });
    }
  }
  return { name: hm[1], from: hm[2], sha, shape, assertions };
}
