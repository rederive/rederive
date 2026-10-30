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
  const hits = [];
  const seen = new Set();
  const rec = (label, l) => {
    const k = label + '@' + l;
    if (!seen.has(k)) { seen.add(k); hits.push([l, k]); }
  };
  const recAll = (list, base) => {
    for (const e of list) {
      const p = e.lastIndexOf('@');
      rec(e.slice(0, p), base + Number(e.slice(p + 1)) - 1);
    }
  };
  const n = src.length;
  let i = 0, line = 1, ctx = '', depth = 0, text = false;
  const stack = [];
  while (i < n) {
    const c = src[i];
    if (text) {
      if (c === '\\') {
        if (src[i + 1] === '\n') line++;
        i += 2;
      } else if (c === '\n') { line++; ctx = ''; i++; }
      else if (c === '`') { i++; ctx += '`'; text = false; }
      else if (c === '$' && src[i + 1] === '{') {
        i += 2; stack.push(depth); depth++; ctx += ' '; text = false;
      } else i++;
      continue;
    }
    if (c === '\n') { line++; ctx = ''; i++; continue; }
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let e = i;
      while (e < n) {
        const ch = src[e];
        if (ch === '\n' || ch === '\r' || ch === ' ' || ch === ' ') break;
        e++;
      }
      const t = src.slice(i, e);
      if (DIRECTIVE.test(t) || DIRECTIVE.test(t.toLowerCase())) rec('@ts-ignore', line);
      i = e;
      continue;
    }
    if (c === '/' && d === '*') {
      const x = src.indexOf('*/', i + 2);
      const e = x < 0 ? n : x + 2;
      const raw = src.slice(i, e);
      const low = raw.toLowerCase();
      const P = raw.search(DIRECTIVE);
      const Q = low.search(DIRECTIVE);
      if (P >= 0 || Q >= 0) {
        const at = Math.max(P, Q);
        const base = P >= 0 ? raw : low;
        rec('@ts-ignore', line + countLF(base.slice(0, at)));
      }
      const lf = countLF(raw);
      line += lf;
      if (lf > 0) ctx = '';
      ctx += ' ';
      i = e;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n) {
        const ch = src[i];
        if (ch === '\\') {
          if (src[i + 1] === '\r' && src[i + 2] === '\n') { i += 3; line++; }
          else if (src[i + 1] === '\n') { line++; i += 2; }
          else i += 2;
        } else if (ch === c) { i++; break; }
        else if (ch === '\n') break;
        else i++;
      }
      ctx += '"';
      continue;
    }
    if (c === '`') { i++; text = true; continue; }
    if (c === '/' && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
      let j = i + 1, inc = false, close = -1;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') inc = true;
        else if (ch === ']') inc = false;
        else if (ch === '/' && !inc) { close = j; break; }
        else if (ch === '\n') break;
        j++;
      }
      if (close >= 0) {
        if (ctx.trim() === '' || GUESSED_KEYWORD.test(ctx)) {
          const len = n - (i + 1);
          let r = memo.get(len);
          if (r === undefined) {
            r = scan(src.slice(i + 1), memo);
            memo.set(len, r);
          }
          recAll(r, line);
        }
        const b = scan(src.slice(i + 1, close), new Map());
        for (const e of b) {
          const p = e.lastIndexOf('@');
          rec(e.slice(0, p), line);
        }
        j = close + 1;
        while (j < n && /[A-Za-z]/.test(src[j])) j++;
        ctx += ' ';
        i = j;
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
      let j = i;
      while (j < n && WORD_CHAR.test(src[j])) j++;
      const word = src.slice(i, j);
      if (word === 'any') {
        const after = src.slice(j);
        const member = MEMBER.test(ctx);
        const key = KEY_AFTER.test(after) && KEY_BEFORE.test(ctx);
        if (!member && !key) {
          let label;
          if (/(?:^|\W)as\s*$/.test(ctx)) label = 'as any';
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
    if (c === '!' && d !== '=') {
      const B = ctx.replace(/[ \t]+$/, '');
      if (B !== '' && OPERAND_END.test(B) && !PREFIX.has(/[\w$]*$/.exec(B)[0])) {
        rec('non-null assertion', line);
      }
    }
    ctx += c;
    i++;
  }
  hits.sort((a, b) => a[0] - b[0]);
  return hits.map((h) => h[1]);
}

export default function any_ban_hits(src) {
  return scan(src, new Map());
}
