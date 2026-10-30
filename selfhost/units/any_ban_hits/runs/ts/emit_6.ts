type Hit = { label: string; line: number };

const REGEX_AFTER = /(?:^|[(,=:[!&|?{};+\-*%<>~^])\s*$|(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
const DIRECTIVE = /@ts-(?:ignore|expect-error)|@ts-nocheck/i;
const OPERAND_END = new RegExp("[\\w$)\\]\"\\u0080-\\uffff]$");
const KEY_AFTER = new RegExp("^(?:[^\\S\\n\\r\\u2028\\u2029]|[\\u0085\\u200b])*[!?]?:");
const KEY_BEFORE = /(?:^|[{(,;])\s*$/;
const MEMBER = /(?<!\.)\.\s*$/;
const WORD_CHAR = new RegExp("(?![\\s\\u0085\\u200b])[\\w$\\u0080-\\uffff]");
const GUESSED_KEYWORD = /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$|\.\s*(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
const NOT_REGEX_AFTER = /(?:\+\+|--)\s*$/;
const PREFIX = new Set(["return", "typeof", "void", "in", "of", "case", "delete", "await", "yield", "throw", "else", "do", "instanceof", "new", "extends"]);

function countLF(s: string): number {
  let n = 0;
  for (let k = 0; k < s.length; k++) if (s.charAt(k) === "\n") n++;
  return n;
}

function scan(src: string, memo: Map<string, Hit[]>): Hit[] {
  const n = src.length;
  let i = 0;
  let line = 1;
  let ctx = "";
  let depth = 0;
  const stack: number[] = [];
  const hits: Hit[] = [];
  const seen = new Set<string>();
  let text = false;

  const rec = (label: string, l: number): void => {
    const key = label + "@" + String(l);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ label, line: l });
  };

  while (i < n) {
    if (text) {
      const c = src.charAt(i);
      if (c === "\\") {
        i++;
        if (i < n) {
          if (src.charAt(i) === "\n") line++;
          i++;
        }
      } else if (c === "\n") {
        line++;
        ctx = "";
        i++;
      } else if (c === "`") {
        ctx += "`";
        i++;
        text = false;
      } else if (c === "$" && src.charAt(i + 1) === "{") {
        i += 2;
        stack.push(depth);
        depth++;
        ctx += " ";
        text = false;
      } else {
        i++;
      }
      continue;
    }
    const c = src.charAt(i);
    const c2 = src.charAt(i + 1);
    if (c === "\n") {
      line++;
      ctx = "";
      i++;
    } else if (c === "/" && c2 === "/") {
      let j = i;
      while (j < n) {
        const d = src.charAt(j);
        if (d === "\n" || d === "\r" || d === " " || d === " ") break;
        j++;
      }
      const t = src.slice(i, j);
      if (DIRECTIVE.test(t) || DIRECTIVE.test(t.toLowerCase())) rec("@ts-ignore", line);
      i = j;
    } else if (c === "/" && c2 === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      const raw = src.slice(i, end);
      const low = raw.toLowerCase();
      const p = raw.search(DIRECTIVE);
      const q = low.search(DIRECTIVE);
      if (p >= 0 || q >= 0) {
        const at = Math.max(p, q);
        const base = p >= 0 ? raw : low;
        rec("@ts-ignore", line + countLF(base.slice(0, at)));
      }
      const lf = countLF(raw);
      line += lf;
      if (lf > 0) ctx = "";
      ctx += " ";
      i = end;
    } else if (c === '"' || c === "'") {
      i++;
      while (i < n) {
        const ch = src.charAt(i);
        if (ch === "\\") {
          if (src.charAt(i + 1) === "\r" && src.charAt(i + 2) === "\n") {
            line++;
            i += 3;
          } else if (src.charAt(i + 1) === "\n") {
            line++;
            i += 2;
          } else {
            i += 2;
          }
        } else if (ch === c) {
          i++;
          break;
        } else if (ch === "\n") {
          break;
        } else {
          i++;
        }
      }
      if (i > n) i = n;
      ctx += '"';
    } else if (c === "`") {
      i++;
      text = true;
    } else {
      let handled = false;
      if (c === "/" && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
        let j = i + 1;
        let inClass = false;
        let close = -1;
        while (j < n) {
          const ch = src.charAt(j);
          if (ch === "\\") {
            j += 2;
            continue;
          }
          if (ch === "[") inClass = true;
          else if (ch === "]") inClass = false;
          else if (ch === "/" && !inClass) {
            close = j;
            break;
          } else if (ch === "\n") break;
          j++;
        }
        if (close >= 0) {
          const guessed = ctx.trim() === "" || GUESSED_KEYWORD.test(ctx);
          if (guessed) {
            const suffix = src.slice(i + 1);
            let res = memo.get(suffix);
            if (res === undefined) {
              res = scan(suffix, memo);
              memo.set(suffix, res);
            }
            for (const h of res) rec(h.label, line + h.line - 1);
          }
          const body = scan(src.slice(i + 1, close), memo);
          for (const h of body) rec(h.label, line);
          let k = close + 1;
          while (k < n && /[A-Za-z]/.test(src.charAt(k))) k++;
          ctx += " ";
          i = k;
          handled = true;
        }
      }
      if (handled) continue;
      if (c === "{") {
        depth++;
        ctx += c;
        i++;
      } else if (c === "}") {
        if (stack.length > 0 && stack[stack.length - 1] === depth - 1) {
          stack.pop();
          depth--;
          i++;
          text = true;
        } else {
          depth--;
          ctx += c;
          i++;
        }
      } else if (WORD_CHAR.test(c)) {
        let j = i;
        while (j < n && WORD_CHAR.test(src.charAt(j))) j++;
        const word = src.slice(i, j);
        if (word === "any") {
          const after = src.slice(j);
          const member = MEMBER.test(ctx);
          const key = KEY_AFTER.test(after) && KEY_BEFORE.test(ctx);
          if (!member && !key) {
            let label = "any";
            if (/(?:^|\W)as\s*$/.test(ctx)) label = "as any";
            else if (/<\s*$/.test(ctx) && /^\s*>/.test(after)) label = "<any>";
            else if (/:\s*$/.test(ctx)) label = ": any";
            rec(label, line);
          }
        }
        ctx += word;
        i = j;
      } else if (c === "!" && c2 !== "=") {
        const b = ctx.replace(/[ \t]+$/, "");
        if (b !== "" && OPERAND_END.test(b)) {
          const m = /[\w$]+$/.exec(b);
          if (m === null || !PREFIX.has(m[0])) rec("non-null assertion", line);
        }
        ctx += c;
        i++;
      } else {
        ctx += c;
        i++;
      }
    }
  }
  const order = hits.slice();
  order.sort((a, b) => a.line - b.line);
  return order;
}

export default function any_ban_hits(src: string): string[] {
  return scan(src, new Map<string, Hit[]>()).map((h) => h.label + "@" + String(h.line));
}
