const REGEX_AFTER = /(?:^|[(,=:[!&|?{};+\-*%<>~^])\s*$|(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
const DIRECTIVE = /@ts-(?:ignore|expect-error)|@ts-nocheck/i;
const OPERAND_END = /[\w$)\]"\u0080-￿]$/;
const KEY_AFTER = /^(?:[^\S\n\r  ]|[\u0085​])*[!?]?:/;
const KEY_BEFORE = /(?:^|[{(,;])\s*$/;
const MEMBER = /(?<!\.)\.\s*$/;
const WORD_CHAR = /(?![\s\u0085​])[\w$\u0080-￿]/;
const GUESSED_KEYWORD = /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$|\.\s*(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
const NOT_REGEX_AFTER = /(?:\+\+|--)\s*$/;
const PREFIX = new Set(['return', 'typeof', 'void', 'in', 'of', 'case', 'delete', 'await', 'yield', 'throw', 'else', 'do', 'instanceof', 'new', 'extends']);

function countLF(s) {
  let c = 0;
  for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) === 10) c++;
  return c;
}

function scan(src, memo) {
  const n = src.length;
  const hits = [];
  const seen = new Set();
  const rec = (label, ln) => {
    const e = label + '@' + ln;
    if (!seen.has(e)) { seen.add(e); hits.push([ln, e]); }
  };
  let i = 0, line = 1, ctx = '', depth = 0, text = false;
  const stack = [];
  while (i < n) {
    const c = src[i];
    if (text) {
      if (c === '\\') {
        if (i + 1 < n && src[i + 1] === '\n') line++;
        i += 2;
      } else if (c === '\n') { line++; ctx = ''; i++; }
      else if (c === '`') { ctx += '`'; i++; text = false; }
      else if (c === '$' && src[i + 1] === '{') { stack.push(depth); depth++; ctx += ' '; i += 2; text = false; }
      else i++;
      continue;
    }
    if (c === '\n') { line++; ctx = ''; i++; continue; }
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      let j = i + 2;
      while (j < n) {
        const ch = src[j];
        if (ch === '\n' || ch === '\r' || ch === ' ' || ch === ' ') break;
        j++;
      }
      const t = src.slice(i, j);
      if (DIRECTIVE.test(t) || DIRECTIVE.test(t.toLowerCase())) rec('@ts-ignore', line);
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      const raw = src.slice(i, end);
      const low = raw.toLowerCase();
      const P = raw.search(DIRECTIVE), Q = low.search(DIRECTIVE);
      if (P >= 0 || Q >= 0) {
        const at = Math.max(P, Q);
        const base = P >= 0 ? raw : low;
        rec('@ts-ignore', line + countLF(base.slice(0, at)));
      }
      const lf = countLF(raw);
      line += lf;
      if (lf > 0) ctx = '';
      ctx += ' ';
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') {
          if (src[j + 1] === '\r' && src[j + 2] === '\n') { j += 3; line++; }
          else if (j + 1 < n) { if (src[j + 1] === '\n') line++; j += 2; }
          else j++;
        } else if (ch === c) { j++; break; }
        else if (ch === '\n') break;
        else j++;
      }
      ctx += '"';
      i = j;
      continue;
    }
    if (c === '`') { i++; text = true; continue; }
    if (c === '/' && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
      let j = i + 1, cls = false, found = -1;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') cls = true;
        else if (ch === ']') cls = false;
        else if (ch === '/' && !cls) { found = j; break; }
        else if (ch === '\n') break;
        j++;
      }
      if (found >= 0) {
        if (ctx.trim() === '' || GUESSED_KEYWORD.test(ctx)) {
          const sub = src.slice(i + 1);
          let res = memo.get(sub.length);
          if (!res) { res = scan(sub, memo); memo.set(sub.length, res); }
          for (const e of res) {
            const at = e.lastIndexOf('@');
            rec(e.slice(0, at), line + Number(e.slice(at + 1)) - 1);
          }
        }
        const body = scan(src.slice(i + 1, found), new Map());
        for (const e of body) {
          const at = e.lastIndexOf('@');
          rec(e.slice(0, at), line);
        }
        let k = found + 1;
        while (k < n && /[A-Za-z]/.test(src[k])) k++;
        ctx += ' ';
        i = k;
        continue;
      }
    }
    if (c === '{') { depth++; ctx += c; i++; continue; }
    if (c === '}') {
      if (stack.length && stack[stack.length - 1] === depth - 1) {
        stack.pop(); depth--; i++; text = true;
      } else { depth--; ctx += c; i++; }
      continue;
    }
    if (WORD_CHAR.test(c)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(src[j])) j++;
      const word = src.slice(i, j);
      if (word === 'any') {
        const after = src.slice(j);
        const member = MEMBER.test(ctx);
        const key = KEY_AFTER.test(after) && KEY_BEFORE.test(ctx);
        if (!member && !key) {
          let label;
          if (/(?:^|[^\w])as\s*$/.test(ctx)) label = 'as any';
          else if (/<\s*$/.test(ctx) && /^\s*>/.test(after)) label = '<any>';
          else if (/:\s*$/.test(ctx)) label = ': any';
          else label = 'any';
          rec(label, line);
        }
      }
      ctx += word;
      i = j;
      continue;
    }
    if (c === '!' && src[i + 1] !== '=') {
      const B = ctx.replace(/[ \t]+$/, '');
      if (B !== '' && OPERAND_END.test(B)) {
        const m = /[\w$]+$/.exec(B);
        if (!(m && PREFIX.has(m[0]))) rec('non-null assertion', line);
      }
    }
    ctx += c;
    i++;
  }
  const idx = hits.map((h, k) => [h[0], k, h[1]]);
  idx.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return idx.map((h) => h[2]);
}

export default function any_ban_hits(src) {
  return scan(src, new Map());
}
