type Hit = { label: string; line: number };

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

function countLF(t: string): number {
  let n = 0;
  for (let k = 0; k < t.length; k++) if (t.charAt(k) === '\n') n++;
  return n;
}

function scan(s: string, memo: Map<number, Hit[]>): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const rec = (label: string, ln: number): void => {
    const key = label + '@' + ln;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ label, line: ln });
  };
  const n = s.length;
  let i = 0;
  let line = 1;
  let ctx = '';
  let depth = 0;
  const stack: number[] = [];
  let text = false;
  while (i < n) {
    const c = s.charAt(i);
    if (text) {
      if (c === '\\') {
        if (s.charAt(i + 1) === '\n') line++;
        i += 2;
      } else if (c === '\n') {
        line++;
        ctx = '';
        i++;
      } else if (c === '`') {
        ctx += '`';
        text = false;
        i++;
      } else if (c === '$' && s.charAt(i + 1) === '{') {
        stack.push(depth);
        depth++;
        ctx += ' ';
        text = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    if (c === '\n') {
      line++;
      ctx = '';
      i++;
      continue;
    }
    const d = s.charAt(i + 1);
    if (c === '/' && d === '/') {
      let j = i + 2;
      while (j < n) {
        const ch = s.charAt(j);
        if (ch === '\n' || ch === '\r' || ch === ' ' || ch === ' ') break;
        j++;
      }
      const t = s.slice(i, j);
      if (DIRECTIVE.test(t) || DIRECTIVE.test(t.toLowerCase())) rec('@ts-ignore', line);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      const e = s.indexOf('*/', i + 2);
      const raw = e < 0 ? s.slice(i) : s.slice(i, e + 2);
      const low = raw.toLowerCase();
      const p = raw.search(DIRECTIVE);
      const q = low.search(DIRECTIVE);
      if (p >= 0 || q >= 0) {
        const at = Math.max(p, q);
        const base = p >= 0 ? raw : low;
        rec('@ts-ignore', line + countLF(base.slice(0, at)));
      }
      const lf = countLF(raw);
      line += lf;
      if (lf > 0) ctx = '';
      ctx += ' ';
      i += raw.length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        const ch = s.charAt(j);
        if (ch === '\\') {
          const nx = s.charAt(j + 1);
          if (nx === '\r' && s.charAt(j + 2) === '\n') {
            line++;
            j += 3;
          } else {
            if (nx === '\n') line++;
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
      ctx += '"';
      i = Math.min(j, n);
      continue;
    }
    if (c === '`') {
      text = true;
      i++;
      continue;
    }
    if (c === '/' && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
      let j = i + 1;
      let inClass = false;
      let close = -1;
      while (j < n) {
        const ch = s.charAt(j);
        if (ch === '\\') {
          j += 2;
        } else if (ch === '[') {
          inClass = true;
          j++;
        } else if (ch === ']') {
          inClass = false;
          j++;
        } else if (ch === '/' && !inClass) {
          close = j;
          break;
        } else if (ch === '\n') {
          break;
        } else {
          j++;
        }
      }
      if (close >= 0) {
        const guessed = ctx.trim() === '' || GUESSED_KEYWORD.test(ctx);
        if (guessed) {
          const key = n - (i + 1);
          let rest = memo.get(key);
          if (rest === undefined) {
            rest = scan(s.slice(i + 1), memo);
            memo.set(key, rest);
          }
          for (const h of rest) rec(h.label, line + h.line - 1);
        }
        const body = scan(s.slice(i + 1, close), new Map<number, Hit[]>());
        for (const h of body) rec(h.label, line);
        let k = close + 1;
        while (k < n && /[A-Za-z]/.test(s.charAt(k))) k++;
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
        text = true;
      } else {
        depth--;
        ctx += c;
      }
      i++;
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
          if (/(?:^|[^\w])as\s*$/.test(ctx)) label = 'as any';
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
        const m = /[\w$]*$/.exec(b);
        const run = m === null ? '' : m[0];
        if (!PREFIX.has(run)) rec('non-null assertion', line);
      }
    }
    ctx += c;
    i++;
  }
  return hits.sort((a, b) => a.line - b.line);
}

export default function any_ban_hits(src: string): string[] {
  return scan(src, new Map<number, Hit[]>()).map((h) => h.label + '@' + h.line);
}
