const SPC = (c) => c === ' ' || c === '\t';
const OPEN = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const ATTRS = ['CITED', 'EARNED', 'ANCHOR'];
const CF = /[\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]/u;
const VISIBLE = /[^\s\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]/u;
void CF;

function trimSp(s) {
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

function spans(s) {
  const out = [];
  const n = s.length;
  let prevClose = -2;
  let i = 0;
  while (i < n) {
    if (s[i] === '"' && (i === 0 || OPEN.has(s[i - 1]) || prevClose === i - 1)) {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const c = s[j];
        if (c === '\\') {
          j += 1;
          if (j < n) {
            const cp = s.codePointAt(j);
            j += cp > 0xffff ? 2 : 1;
          }
        } else if (c === '"') {
          closed = true;
          break;
        } else j++;
      }
      if (!closed) break;
      out.push([i, j]);
      prevClose = j;
      i = j + 1;
    } else i++;
  }
  return out;
}

function inside(sp, p) {
  for (const [a, b] of sp) if (a < p && p < b) return true;
  return false;
}

function cutCode(content) {
  const sp = spans(content);
  const n = content.length;
  for (let i = 1; i < n; i++) {
    if (content[i] === '#' && SPC(content[i - 1]) && (i + 1 === n || SPC(content[i + 1])) && !inside(sp, i)) {
      return trimSp(content.slice(0, i));
    }
  }
  return content;
}

function stripAttrs(t) {
  const sp = spans(t);
  const n = t.length;
  for (let p = 1; p < n; p++) {
    if (!SPC(t[p - 1])) continue;
    for (const w of ATTRS) {
      if (t.startsWith(w, p) && (p + w.length === n || SPC(t[p + w.length])) && !inside(sp, p)) {
        return trimSp(t.slice(0, p));
      }
    }
  }
  return trimSp(t);
}

function checkNumerals(e) {
  const blank = e.replace(/"(?:\\[^]|[^"\\])*"/g, '');
  const re = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let m;
  while ((m = re.exec(blank)) !== null) {
    const num = m[0];
    const x = Number(num);
    if (!Number.isFinite(x)) throw new Error('numeral not finite');
    if (Math.abs(x) > 2 ** 53) throw new Error('numeral too large');
    if (x === 0) {
      const before = num.split(/[eE]/)[0];
      if (/[1-9]/.test(before)) throw new Error('underflow');
    }
    if (/^-?\d+$/.test(num) && BigInt(num) !== BigInt(x)) throw new Error('inexact integer');
  }
}

export function carried_declared(text) {
  const directives = [];
  let cur = null;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const lead = /^[ \t\uFEFF]*/.exec(raw)[0];
    const indent = lead.replace(/\uFEFF/g, '');
    const content = raw.slice(lead.length).replace(/[ \t]+$/, '');
    if (content === '') continue;
    if (content[0] === '#') continue;
    const code = cutCode(content);
    let isDir = false;
    if (indent === '') {
      const sp = code.search(/[ \t]/);
      const tok = sp < 0 ? code : code.slice(0, sp);
      const mm = /^([A-Z][A-Z0-9-]*):?$/.exec(tok);
      if (mm && !ATTRS.includes(mm[1])) {
        isDir = true;
        cur = { name: mm[1], args: stripAttrs(code.slice(tok.length)), conts: [] };
        directives.push(cur);
      }
    }
    if (!isDir) {
      if (!cur) continue;
      const body = stripAttrs(' ' + code);
      if (body !== '') cur.conts.push(body);
    }
  }
  const carried = directives.filter((d) => d.name === 'CARRIED');
  if (carried.length === 0) return null;
  for (const d of directives) {
    if (d.name === 'CANONICAL-SHA256' || d.name === 'SHAPE' || d.name === 'AUTHORITY') throw new Error('sub-field at column 0');
  }
  if (carried.length > 1) throw new Error('multiple CARRIED');
  const c = carried[0];
  const h = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]+FROM[ \t]+(.+)$/.exec(c.args);
  if (!h) throw new Error('bad CARRIED head');
  let sha = null;
  let shape = null;
  const assertions = [];
  for (const body of c.conts) {
    if (!/^(?:CANONICAL-SHA256|SHAPE|AUTHORITY)(?![A-Z0-9-])/.test(body)) continue;
    const m = /^(CANONICAL-SHA256|SHAPE|AUTHORITY)(?:[ \t]+([^]*))?$/.exec(body);
    if (!m) throw new Error('bad keyword line');
    const value = m[2] === undefined ? '' : m[2];
    if (m[1] === 'CANONICAL-SHA256') {
      if (sha !== null) throw new Error('repeated hash');
      if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('bad hash');
      sha = value;
    } else if (m[1] === 'SHAPE') {
      if (shape !== null) throw new Error('repeated shape');
      if (value === '') throw new Error('empty shape');
      shape = value;
    } else {
      const a = /^\{[ \t]*expr:[ \t]*("(?:\\[^]|[^"\\])*")[ \t]*,[ \t]*equals:[ \t]*([^]+?)[ \t]*\}$/.exec(value);
      if (!a) throw new Error('bad authority');
      const expr = JSON.parse(a[1]);
      const equals = JSON.parse(a[2]);
      checkNumerals(a[2]);
      if (!VISIBLE.test(expr)) throw new Error('invisible expr');
      assertions.push({ expr, equals });
    }
  }
  return { name: h[1], from: h[2], sha, shape, assertions };
}
