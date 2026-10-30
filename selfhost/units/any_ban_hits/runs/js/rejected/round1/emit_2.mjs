const REGEX_AFTER = /(?:^|[(,=:[!&|?{};+\-*%<>~^])\s*$|(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
const DIRECTIVE = /@ts-(?:ignore|expect-error)|@ts-nocheck/i;
const OPERAND_END = /[\w$)\]"\u0080-￿]$/;
const KEY_AFTER = /(?:[^\S\n\r  ]|[\u0085​])*[!?]?:/y;
const KEY_BEFORE = /(?:^|[{(,;])\s*$/;
const MEMBER = /(?<!\.)\.\s*$/;
const WORD_CHAR = /(?![\s\u0085​])[\w$\u0080-￿]/;
const GUESSED_KEYWORD = /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$|\.\s*(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
const NOT_REGEX_AFTER = /(?:\+\+|--)\s*$/;
const AS_BEFORE = /(?:^|[^\w])as\s*$/;
const LT_BEFORE = /<\s*$/;
const GT_AFTER = /\s*>/y;
const COLON_BEFORE = /:\s*$/;
const PREFIX = new Set(['return', 'typeof', 'void', 'in', 'of', 'case', 'delete', 'await', 'yield', 'throw', 'else', 'do', 'instanceof', 'new', 'extends']);

function countLF(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

function scan(src, memo) {
  const hits = [];
  const seen = new Set();
  const rec = (label, line) => {
    const e = label + '@' + line;
    if (!seen.has(e)) { seen.add(e); hits.push([label, line]); }
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
      } else if (c === '\n') {
        line++; ctx = ''; i++;
      } else if (c === '`') {
        i++; ctx += '`'; text = false;
      } else if (c === '$' && src[i + 1] === '{') {
        i += 2; stack.push(depth); depth++; ctx += ' '; text = false;
      } else i++;
      continue;
    }
    if (c === '\n') { line++; ctx = ''; i++; continue; }
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = i + 2;
      while (j < n) {
        const x = src.charCodeAt(j);
        if (x === 10 || x === 13 || x === 0x2028 || x === 0x2029) break;
        j++;
      }
      const t = src.slice(i, j);
      if (DIRECTIVE.test(t) || DIRECTIVE.test(t.toLowerCase())) rec('@ts-ignore', line);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      const k = src.indexOf('*/', i + 2);
      const end = k < 0 ? n : k + 2;
      const raw = src.slice(i, end);
      const low = raw.toLowerCase();
      const P = raw.search(DIRECTIVE), Q = low.search(DIRECTIVE);
      const lfs = countLF(raw);
      if (P >= 0 || Q >= 0) {
        const at = Math.max(P, Q);
        const base = P >= 0 ? raw : low;
        rec('@ts-ignore', line + countLF(base.slice(0, at)));
      }
      line += lfs;
      if (lfs > 0) ctx = '';
      ctx += ' ';
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        const x = src[j];
        if (x === '\\') {
          if (src[j + 1] === '\r' && src[j + 2] === '\n') { j += 3; line++; }
          else if (src[j + 1] === '\n') { j += 2; line++; }
          else j += 2;
        } else if (x === c) { j++; break; }
        else if (x === '\n') break;
        else j++;
      }
      if (j > n) j = n;
      ctx += '"';
      i = j;
      continue;
    }
    if (c === '`') { i++; text = true; continue; }
    if (c === '/' && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
      let j = i + 1, cls = false, close = -1;
      while (j < n) {
        const x = src[j];
        if (x === '\\') j += 2;
        else if (x === '[') { cls = true; j++; }
        else if (x === ']') { cls = false; j++; }
        else if (x === '/' && !cls) { close = j; break; }
        else if (x === '\n') break;
        else j++;
      }
      if (close >= 0) {
        if (/^\s*$/.test(ctx) || GUESSED_KEYWORD.test(ctx)) {
          const key = n - (i + 1);
          let r = memo.get(key);
          if (!r) {
            r = scan(src.slice(i + 1), memo);
            memo.set(key, r);
          }
          for (const e of r) {
            const a = e.lastIndexOf('@');
            rec(e.slice(0, a), line + Number(e.slice(a + 1)) - 1);
          }
        }
        const br = scan(src.slice(i + 1, close), new Map());
        for (const e of br) {
          const a = e.lastIndexOf('@');
          rec(e.slice(0, a), line);
        }
        let k = close + 1;
        while (k < n) {
          const x = src.charCodeAt(k);
          if ((x >= 65 && x <= 90) || (x >= 97 && x <= 122)) k++; else break;
        }
        ctx += ' ';
        i = k;
        continue;
      }
    }
    if (c === '}' && stack.length && stack[stack.length - 1] === depth - 1) {
      stack.pop(); depth--; i++; text = true;
      continue;
    }
    if (c === '{') { depth++; ctx += c; i++; continue; }
    if (c === '}') { depth--; ctx += c; i++; continue; }
    if (WORD_CHAR.test(c)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(src[j])) j++;
      const w = src.slice(i, j);
      if (w === 'any') {
        let excused = MEMBER.test(ctx);
        if (!excused) {
          KEY_AFTER.lastIndex = j;
          if (KEY_AFTER.test(src) && KEY_BEFORE.test(ctx)) excused = true;
        }
        if (!excused) {
          let label = 'any';
          if (AS_BEFORE.test(ctx)) label = 'as any';
          else if (LT_BEFORE.test(ctx) && (GT_AFTER.lastIndex = j, GT_AFTER.test(src))) label = '<any>';
          else if (COLON_BEFORE.test(ctx)) label = ': any';
          rec(label, line);
        }
      }
      ctx += w;
      i = j;
      continue;
    }
    if (c === '!' && d !== '=') {
      const B = ctx.replace(/[ \t]+$/, '');
      if (B.length > 0 && OPERAND_END.test(B)) {
        const m = /[\w$]*$/.exec(B)[0];
        if (!PREFIX.has(m)) rec('non-null assertion', line);
      }
    }
    ctx += c;
    i++;
  }
  const idx = hits.map((h, k) => k);
  idx.sort((a, b) => hits[a][1] - hits[b][1] || a - b);
  return idx.map((k) => hits[k][0] + '@' + hits[k][1]);
}

export default function any_ban_hits(src) {
  return scan(src, new Map());
}
