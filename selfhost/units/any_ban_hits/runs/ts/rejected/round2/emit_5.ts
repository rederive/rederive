const REGEX_AFTER = /(?:^|[(,=:[!&|?{};+\-*%<>~^])\s*$|(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
const DIRECTIVE = /@ts-(?:ignore|expect-error)|@ts-nocheck/i;
const OPERAND_END = new RegExp("[\\w$)\\]\"\\u0080-\\uffff]$");
const KEY_AFTER = new RegExp("^(?:[^\\S\\n\\r\\u2028\\u2029]|[\\u0085\\u200b])*[!?]?:");
const KEY_BEFORE = /(?:^|[{(,;])\s*$/;
const MEMBER = new RegExp("(?<!\\.)\\.\\s*$");
const WORD_CHAR = new RegExp("(?![\\s\\u0085\\u200b])[\\w$\\u0080-\\uffff]");
const GUESSED_KEYWORD = /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$|\.\s*(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
const NOT_REGEX_AFTER = /(?:\+\+|--)\s*$/;
const PREFIX_KEYWORDS = new Set(["return", "typeof", "void", "in", "of", "case", "delete", "await", "yield", "throw", "else", "do", "instanceof", "new", "extends"]);
const TRAIL_IDENT = /[\w$]+$/;
const LABEL_AS = /(?:^|[^\w])as\s*$/;
const LABEL_LT = /<\s*$/;
const AFTER_GT = /^\s*>/;
const LABEL_COLON = /:\s*$/;

function countLf(s: string): number {
  let n = 0;
  for (let k = 0; k < s.length; k++) {
    if (s.charCodeAt(k) === 10) n++;
  }
  return n;
}

function hasDirective(t: string): boolean {
  return DIRECTIVE.test(t) || DIRECTIVE.test(t.toLowerCase());
}

export default function any_ban_hits(src: string): string[] {
  const memo = new Map<string, string[]>();

  function scan(text: string): string[] {
    const cached = memo.get(text);
    if (cached !== undefined) return cached;
    const n = text.length;
    const hits: string[] = [];
    const seen = new Set<string>();
    const stack: number[] = [];
    let line = 1;
    let ctx = "";
    let depth = 0;
    let i = 0;
    let inText = false;

    const record = (label: string, ln: number): void => {
      const e = label + "@" + String(ln);
      if (!seen.has(e)) {
        seen.add(e);
        hits.push(e);
      }
    };
    const recordAll = (entries: string[], base: number): void => {
      for (const e of entries) {
        const at = e.lastIndexOf("@");
        record(e.slice(0, at), base + Number(e.slice(at + 1)) - 1);
      }
    };

    while (i < n) {
      if (inText) {
        const c = text[i];
        if (c === "\\") {
          if (text[i + 1] === "\n") line++;
          i += 2;
        } else if (c === "\n") {
          line++;
          ctx = "";
          i++;
        } else if (c === "`") {
          ctx += "`";
          i++;
          inText = false;
        } else if (c === "$" && text[i + 1] === "{") {
          stack.push(depth);
          depth++;
          ctx += " ";
          i += 2;
          inText = false;
        } else {
          i++;
        }
        continue;
      }
      const c = text[i];
      if (c === "\n") {
        line++;
        ctx = "";
        i++;
        continue;
      }
      if (c === "/" && text[i + 1] === "/") {
        let end = i;
        while (end < n) {
          const ch = text.charCodeAt(end);
          if (ch === 10 || ch === 13 || ch === 0x2028 || ch === 0x2029) break;
          end++;
        }
        if (hasDirective(text.slice(i, end))) record("@ts-ignore", line);
        i = end;
        continue;
      }
      if (c === "/" && text[i + 1] === "*") {
        const close = text.indexOf("*/", i + 2);
        const end = close === -1 ? n : close + 2;
        const raw = text.slice(i, end);
        const low = raw.toLowerCase();
        const p = raw.search(DIRECTIVE);
        const q = low.search(DIRECTIVE);
        if (p !== -1 || q !== -1) {
          const at = Math.max(p, q);
          const base = p !== -1 ? raw : low;
          record("@ts-ignore", line + countLf(base.slice(0, at)));
        }
        const lfs = countLf(raw);
        line += lfs;
        if (lfs > 0) ctx = "";
        ctx += " ";
        i = end;
        continue;
      }
      if (c === "\"" || c === "'") {
        let j = i + 1;
        while (j < n) {
          const ch = text[j];
          if (ch === "\\") {
            if (text[j + 1] === "\r" && text[j + 2] === "\n") {
              j += 3;
              line++;
            } else if (text[j + 1] === "\n") {
              j += 2;
              line++;
            } else {
              j += 2;
            }
          } else if (ch === c) {
            j++;
            break;
          } else if (ch === "\n") {
            break;
          } else {
            j++;
          }
        }
        ctx += "\"";
        i = Math.min(j, n);
        continue;
      }
      if (c === "`") {
        inText = true;
        i++;
        continue;
      }
      if (c === "/" && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
        let j = i + 1;
        let inClass = false;
        let close = -1;
        while (j < n) {
          const ch = text[j];
          if (ch === "\\") {
            j += 2;
          } else if (ch === "[") {
            inClass = true;
            j++;
          } else if (ch === "]") {
            inClass = false;
            j++;
          } else if (ch === "/" && !inClass) {
            close = j;
            break;
          } else if (ch === "\n") {
            break;
          } else {
            j++;
          }
        }
        if (close !== -1) {
          if (ctx.trim() === "" || GUESSED_KEYWORD.test(ctx)) {
            recordAll(scan(text.slice(i + 1)), line);
          }
          recordAll(scan(text.slice(i + 1, close)), line);
          let k = close + 1;
          while (k < n) {
            const cc = text.charCodeAt(k);
            if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122)) k++;
            else break;
          }
          ctx += " ";
          i = k;
          continue;
        }
      }
      if (c === "}") {
        if (stack.length > 0 && stack[stack.length - 1] === depth - 1) {
          stack.pop();
          depth--;
          i++;
          inText = true;
          continue;
        }
        depth--;
        ctx += c;
        i++;
        continue;
      }
      if (c === "{") {
        depth++;
        ctx += c;
        i++;
        continue;
      }
      if (WORD_CHAR.test(c)) {
        let j = i + 1;
        while (j < n && WORD_CHAR.test(text[j])) j++;
        const word = text.slice(i, j);
        if (word === "any") {
          const after = text.slice(j);
          const member = MEMBER.test(ctx);
          const key = KEY_AFTER.test(after) && KEY_BEFORE.test(ctx);
          if (!member && !key) {
            let label = "any";
            if (LABEL_AS.test(ctx)) label = "as any";
            else if (LABEL_LT.test(ctx) && AFTER_GT.test(after)) label = "<any>";
            else if (LABEL_COLON.test(ctx)) label = ": any";
            record(label, line);
          }
        }
        ctx += word;
        i = j;
        continue;
      }
      if (c === "!" && text[i + 1] !== "=") {
        const b = ctx.replace(/[ \t]+$/, "");
        if (b !== "" && OPERAND_END.test(b)) {
          const m = TRAIL_IDENT.exec(b);
          const kw = m === null ? "" : m[0];
          if (!PREFIX_KEYWORDS.has(kw)) record("non-null assertion", line);
        }
      }
      ctx += c;
      i++;
    }

    const indexed = hits.map((e, idx) => ({ e, idx, ln: Number(e.slice(e.lastIndexOf("@") + 1)) }));
    indexed.sort((a, b) => a.ln - b.ln || a.idx - b.idx);
    const out = indexed.map((x) => x.e);
    memo.set(text, out);
    return out;
  }

  return scan(src).slice();
}
