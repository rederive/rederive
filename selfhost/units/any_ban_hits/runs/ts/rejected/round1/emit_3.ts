type Entry = { label: string; line: number };

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

function countLf(t: string): number {
  let c = 0;
  for (let k = 0; k < t.length; k++) if (t.charCodeAt(k) === 10) c++;
  return c;
}

function scan(s: string, memo: Map<number, Entry[]>): Entry[] {
  const n = s.length;
  let i = 0;
  let line = 1;
  let ctx = '';
  let depth = 0;
  const stack: number[] = [];
  const hits: Entry[] = [];
  const seen = new Set<string>();
  let inText = false;

  const rec = (label: string, ln: number): void => {
    const key = label + '@' + ln;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ label, line: ln });
  };

  while (i < n) {
    const c = s.charAt(i);
    if (inText) {
      if (c === '\\') {
        if (s.charAt(i + 1) === '\n') line++;
        i += 2;
      } else if (c === '\n') {
        line++;
        ctx = '';
        i++;
      } else if (c === '`') {
        ctx += '`';
        i++;
        inText = false;
      } else if (c === '$' && s.charAt(i + 1) === '{') {
        stack.push(depth);
        depth++;
        ctx += ' ';
        i += 2;
        inText = false;
      } else {
        i++;
      }
      continue;
    }
    const d = s.charAt(i + 1);
    if (c === '\n') {
      line++;
      ctx = '';
      i++;
      continue;
    }
    if (c === '/' && d === '/') {
      let j = i;
      while (j < n) {
        const ch = s.charAt(j);
        if (ch === '\n' || ch === '\r' || ch === ' ' || ch === ' ') break;
        j++;
      }
      const text = s.slice(i, j);
      if (DIRECTIVE.test(text) || DIRECTIVE.test(text.toLowerCase())) rec('@ts-ignore', line);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      const e = s.indexOf('*/', i + 2);
      const close = e < 0 ? n : e + 2;
      const raw = s.slice(i, close);
      const low = raw.toLowerCase();
      const p = raw.search(DIRECTIVE);
      const q = low.search(DIRECTIVE);
      if (p >= 0 || q >= 0) {
        const at = Math.max(p, q);
        const base = p >= 0 ? raw : low;
        rec('@ts-ignore', line + countLf(base.slice(0, at)));
      }
      const lf = countLf(raw);
      line += lf;
      if (lf > 0) ctx = '';
      ctx += ' ';
      i = close;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        const ch = s.charAt(j);
        if (ch === '\\') {
          if (s.charAt(j + 1) === '\r' && s.charAt(j + 2) === '\n') {
            j += 3;
            line++;
          } else if (s.charAt(j + 1) === '\n') {
            j += 2;
            line++;
          } else {
            j += 2;
          }
        } else if (ch === c) {
          j++;
          break;
        } else if (ch === '\n') {
          break;
        } else {
          j++;
        }
      }
      if (j > n) j = n;
      ctx += '"';
      i = j;
      continue;
    }
    if (c === '`') {
      i++;
      inText = true;
      continue;
    }
    if (c === '/' && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
      let j = i + 1;
      let inClass = false;
      let ended = false;
      while (j < n) {
        const ch = s.charAt(j);
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) {
          ended = true;
          break;
        } else if (ch === '\n') break;
        j++;
      }
      if (ended) {
        if (ctx.trim() === '' || GUESSED_KEYWORD.test(ctx)) {
          const rest = s.slice(i + 1);
          let res = memo.get(rest.length);
          if (res === undefined) {
            res = scan(rest, memo);
            memo.set(rest.length, res);
          }
          for (const en of res) rec(en.label, line + en.line - 1);
        }
        const body = s.slice(i + 1, j);
        for (const en of scan(body, new Map<number, Entry[]>())) rec(en.label, line);
        let k = j + 1;
        while (k < n) {
          const cc = s.charCodeAt(k);
          if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122)) k++;
          else break;
        }
        ctx += ' ';
        i = k;
        continue;
      }
    }
    if (c === '{') {
      depth++;
      ctx += c;
      i++;
      continue;
    }
    if (c === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === depth - 1) {
        stack.pop();
        depth--;
        i++;
        inText = true;
      } else {
        depth--;
        ctx += c;
        i++;
      }
      continue;
    }
    if (WORD_CHAR.test(c)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(s.charAt(j))) j++;
      const word = s.slice(i, j);
      if (word === 'any') {
        const after = s.slice(j);
        const member = MEMBER.test(ctx);
        const key = KEY_AFTER.test(after) && KEY_BEFORE.test(ctx);
        if (!member && !key) {
          let label = 'any';
          if (/(?:^|\W)as\s*$/.test(ctx)) label = 'as any';
          else if (/<\s*$/.test(ctx) && /^\s*>/.test(after)) label = '<any>';
          else if (/:\s*$/.test(ctx)) label = ': any';
          rec(label, line);
        }
      }
      ctx += word;
      i = j;
      continue;
    }
    if (c === '!' && d !== '=') {
      const b = ctx.replace(/[ \t]+$/, '');
      if (b !== '' && OPERAND_END.test(b)) {
        const m = /[\w$]+$/.exec(b);
        if (!(m !== null && PREFIX.has(m[0]))) rec('non-null assertion', line);
      }
    }
    ctx += c;
    i++;
  }
  const out = hits.slice();
  out.sort((a, b) => a.line - b.line);
  return out;
}

export default function any_ban_hits(src: string): string[] {
  return scan(src, new Map<number, Entry[]>()).map((e) => e.label + '@' + e.line);
}
