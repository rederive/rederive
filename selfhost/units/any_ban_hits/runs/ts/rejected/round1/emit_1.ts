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
const PREFIX_KEYWORDS = new Set([
  'return', 'typeof', 'void', 'in', 'of', 'case', 'delete', 'await', 'yield',
  'throw', 'else', 'do', 'instanceof', 'new', 'extends',
]);

function countLf(s: string): number {
  let n = 0;
  for (let k = 0; k < s.length; k++) {
    if (s.charCodeAt(k) === 10) n++;
  }
  return n;
}

function scan(src: string, memo: Map<number, Hit[]>): Hit[] {
  const n = src.length;
  let i = 0;
  let line = 1;
  let ctx = '';
  let depth = 0;
  const stack: number[] = [];
  const hits: Hit[] = [];
  const seen = new Set<string>();

  const record = (label: string, l: number): void => {
    const key = label + '@' + String(l);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ label, line: l });
  };

  const textMode = (): void => {
    while (i < n) {
      const ch = src.charAt(i);
      if (ch === '\\') {
        if (src.charAt(i + 1) === '\n') line++;
        i += 2;
      } else if (ch === '\n') {
        line++;
        ctx = '';
        i++;
      } else if (ch === '`') {
        i++;
        ctx += '`';
        return;
      } else if (ch === '$' && src.charAt(i + 1) === '{') {
        i += 2;
        stack.push(depth);
        depth++;
        ctx += ' ';
        return;
      } else {
        i++;
      }
    }
    if (i > n) i = n;
  };

  while (i < n) {
    const c = src.charAt(i);
    const c2 = src.charAt(i + 1);
    if (c === '\n') {
      line++;
      ctx = '';
      i++;
      continue;
    }
    if (c === '/' && c2 === '/') {
      let j = i;
      while (j < n) {
        const ch = src.charAt(j);
        if (ch === '\n' || ch === '\r' || ch === ' ' || ch === ' ') break;
        j++;
      }
      const text = src.slice(i, j);
      if (DIRECTIVE.test(text) || DIRECTIVE.test(text.toLowerCase())) record('@ts-ignore', line);
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      const close = src.indexOf('*/', i + 2);
      const end = close < 0 ? n : close + 2;
      const raw = src.slice(i, end);
      const low = raw.toLowerCase();
      const p = raw.search(DIRECTIVE);
      const q = low.search(DIRECTIVE);
      if (p >= 0 || q >= 0) {
        const at = Math.max(p, q);
        const base = p >= 0 ? raw : low;
        record('@ts-ignore', line + countLf(base.slice(0, at)));
      }
      const lf = countLf(raw);
      line += lf;
      if (lf > 0) ctx = '';
      ctx += ' ';
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        const ch = src.charAt(j);
        if (ch === '\\') {
          if (src.charAt(j + 1) === '\r' && src.charAt(j + 2) === '\n') {
            j += 3;
            line++;
          } else if (j + 1 < n) {
            if (src.charAt(j + 1) === '\n') line++;
            j += 2;
          } else {
            j++;
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
      textMode();
      continue;
    }
    if (c === '/' && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
      let k = i + 1;
      let inClass = false;
      let found = -1;
      while (k < n) {
        const ch = src.charAt(k);
        if (ch === '\\') {
          k += 2;
          continue;
        }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) {
          found = k;
          break;
        } else if (ch === '\n') break;
        k++;
      }
      if (found >= 0) {
        const guessed = ctx.trim() === '' || GUESSED_KEYWORD.test(ctx);
        if (guessed) {
          const suffix = src.slice(i + 1);
          let res = memo.get(suffix.length);
          if (res === undefined) {
            res = scan(suffix, memo);
            memo.set(suffix.length, res);
          }
          for (const h of res) record(h.label, line + h.line - 1);
        }
        const body = src.slice(i + 1, found);
        for (const h of scan(body, new Map<number, Hit[]>())) record(h.label, line);
        let e = found + 1;
        while (e < n && /[A-Za-z]/.test(src.charAt(e))) e++;
        ctx += ' ';
        i = e;
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
      const top = stack.length > 0 ? stack[stack.length - 1] : undefined;
      if (top !== undefined && top === depth - 1) {
        stack.pop();
        depth--;
        i++;
        textMode();
      } else {
        depth--;
        ctx += c;
        i++;
      }
      continue;
    }
    if (WORD_CHAR.test(c)) {
      let j = i;
      while (j < n && WORD_CHAR.test(src.charAt(j))) j++;
      const word = src.slice(i, j);
      if (word === 'any') {
        const after = src.slice(j);
        const member = MEMBER.test(ctx);
        const key = KEY_AFTER.test(after) && KEY_BEFORE.test(ctx);
        if (!member && !key) {
          let label = 'any';
          if (/(?:^|\W)as\s*$/.test(ctx)) label = 'as any';
          else if (/<\s*$/.test(ctx) && /^\s*>/.test(after)) label = '<any>';
          else if (/:\s*$/.test(ctx)) label = ': any';
          record(label, line);
        }
      }
      ctx += word;
      i = j;
      continue;
    }
    if (c === '!' && c2 !== '=') {
      const b = ctx.replace(/[ \t]+$/, '');
      if (b !== '' && OPERAND_END.test(b)) {
        const m = /[\w$]+$/.exec(b);
        const run = m === null ? '' : m[0];
        if (!PREFIX_KEYWORDS.has(run)) record('non-null assertion', line);
      }
    }
    ctx += c;
    i++;
  }

  return hits
    .map((h, idx) => ({ h, idx }))
    .sort((a, b) => a.h.line - b.h.line || a.idx - b.idx)
    .map((x) => x.h);
}

export default function any_ban_hits(src: string): string[] {
  return scan(src, new Map<number, Hit[]>()).map((h) => h.label + '@' + String(h.line));
}
