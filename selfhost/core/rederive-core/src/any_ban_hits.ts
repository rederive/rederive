type Entry = [string, number];

const REGEX_AFTER = new RegExp("(?:^|[(,=:[!&|?{};+\\-*%<>~^])\\s*$|(?:^|[^\\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\\s*$");
const DIRECTIVE = new RegExp("@ts-(?:ignore|expect-error)|@ts-nocheck", "i");
const OPERAND_END = new RegExp("[\\w$)\\]\"\\u0080-\\uffff]$");
const KEY_AFTER = new RegExp("^(?:[^\\S\\n\\r\\u2028\\u2029]|[\\u0085\\u200b])*[!?]?:");
const KEY_BEFORE = new RegExp("(?:^|[{(,;])\\s*$");
const MEMBER = new RegExp("(?<!\\.)\\.\\s*$");
const WORD_CHAR = new RegExp("(?![\\s\\u0085\\u200b])[\\w$\\u0080-\\uffff]");
const GUESSED_KEYWORD = new RegExp("(?:^|[^\\w$.])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\\s*$|\\.\\s*(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\\s*$");
const NOT_REGEX_AFTER = new RegExp("(?:\\+\\+|--)\\s*$");
const ALL_WS = new RegExp("^\\s*$");
const AS_BEFORE = new RegExp("(?:^|[^\\w])as\\s*$");
const LT_BEFORE = new RegExp("<\\s*$");
const GT_AFTER = new RegExp("^\\s*>");
const COLON_BEFORE = new RegExp(":\\s*$");
const TRAIL_BLANK = new RegExp("[ \\t]+$");
const TRAIL_IDENT = new RegExp("[\\w$]+$");
const PREFIX_KEYWORDS = ["return", "typeof", "void", "in", "of", "case", "delete", "await", "yield", "throw", "else", "do", "instanceof", "new", "extends"];

function countLF(t: string): number {
  let n = 0;
  for (let k = 0; k < t.length; k++) if (t.charCodeAt(k) === 10) n++;
  return n;
}

function scan(s: string, memo: Map<number, Entry[]>): Entry[] {
  const n = s.length;
  const hits: Entry[] = [];
  const seen = new Set<string>();
  const stack: number[] = [];
  let i = 0;
  let line = 1;
  let ctx = "";
  let depth = 0;
  let inText = false;

  const record = (label: string, ln: number): void => {
    const key = label + "@" + String(ln);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push([label, ln]);
  };

  while (i < n) {
    const c = s.charAt(i);
    if (inText) {
      if (c === "\\") {
        if (s.charAt(i + 1) === "\n") line++;
        i += 2;
      } else if (c === "\n") {
        line++;
        ctx = "";
        i++;
      } else if (c === "`") {
        i++;
        ctx += "`";
        inText = false;
      } else if (c === "$" && s.charAt(i + 1) === "{") {
        i += 2;
        stack.push(depth);
        depth++;
        ctx += " ";
        inText = false;
      } else {
        i++;
      }
      continue;
    }
    const d = s.charAt(i + 1);
    if (c === "\n") {
      line++;
      ctx = "";
      i++;
      continue;
    }
    if (c === "/" && d === "/") {
      let end = i + 2;
      while (end < n) {
        const e = s.charCodeAt(end);
        if (e === 10 || e === 13 || e === 0x2028 || e === 0x2029) break;
        end++;
      }
      const text = s.slice(i, end);
      if (DIRECTIVE.test(text) || DIRECTIVE.test(text.toLowerCase())) record("@ts-ignore", line);
      i = end;
      continue;
    }
    if (c === "/" && d === "*") {
      const close = s.indexOf("*/", i + 2);
      const end = close < 0 ? n : close + 2;
      const raw = s.slice(i, end);
      const low = raw.toLowerCase();
      const p = raw.search(DIRECTIVE);
      const q = low.search(DIRECTIVE);
      if (p >= 0 || q >= 0) {
        const at = Math.max(p, q);
        const base = p >= 0 ? raw : low;
        record("@ts-ignore", line + countLF(base.slice(0, at)));
      }
      const lf = countLF(raw);
      line += lf;
      if (lf > 0) ctx = "";
      ctx += " ";
      i = end;
      continue;
    }
    if (c === "\"" || c === "'") {
      let j = i + 1;
      while (j < n) {
        const ch = s.charAt(j);
        if (ch === "\\") {
          if (s.charAt(j + 1) === "\r" && s.charAt(j + 2) === "\n") {
            j += 3;
            line++;
          } else if (s.charAt(j + 1) === "\n") {
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
      if (j > n) j = n;
      ctx += "\"";
      i = j;
      continue;
    }
    if (c === "`") {
      i++;
      inText = true;
      continue;
    }
    if (c === "/" && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
      let j = i + 1;
      let inClass = false;
      let found = -1;
      while (j < n) {
        const ch = s.charAt(j);
        if (ch === "\\") {
          j += 2;
          continue;
        }
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) {
          found = j;
          break;
        } else if (ch === "\n") break;
        j++;
      }
      if (found >= 0) {
        const guessed = ALL_WS.test(ctx) || GUESSED_KEYWORD.test(ctx);
        if (guessed) {
          const suffix = s.slice(i + 1);
          let res = memo.get(suffix.length);
          if (res === undefined) {
            res = scan(suffix, memo);
            memo.set(suffix.length, res);
          }
          for (const [lab, ln] of res) record(lab, line + ln - 1);
        }
        const body = s.slice(i + 1, found);
        const sub = scan(body, new Map<number, Entry[]>());
        for (const [lab] of sub) record(lab, line);
        let k = found + 1;
        while (k < n) {
          const cc = s.charCodeAt(k);
          if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122)) k++;
          else break;
        }
        ctx += " ";
        i = k;
        continue;
      }
    }
    if (c === "{") {
      depth++;
      ctx += c;
      i++;
      continue;
    }
    if (c === "}") {
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
      if (word === "any") {
        const after = s.slice(j);
        const member = MEMBER.test(ctx);
        const key = KEY_AFTER.test(after) && KEY_BEFORE.test(ctx);
        if (!member && !key) {
          let label = "any";
          if (AS_BEFORE.test(ctx)) label = "as any";
          else if (LT_BEFORE.test(ctx) && GT_AFTER.test(after)) label = "<any>";
          else if (COLON_BEFORE.test(ctx)) label = ": any";
          record(label, line);
        }
      }
      ctx += word;
      i = j;
      continue;
    }
    if (c === "!" && d !== "=") {
      const b = ctx.replace(TRAIL_BLANK, "");
      if (b !== "" && OPERAND_END.test(b)) {
        const m = TRAIL_IDENT.exec(b);
        if (m === null || PREFIX_KEYWORDS.indexOf(m[0]) < 0) record("non-null assertion", line);
      }
    }
    ctx += c;
    i++;
  }
  return hits
    .map((h, idx): [Entry, number] => [h, idx])
    .sort((a, b) => a[0][1] - b[0][1] || a[1] - b[1])
    .map((x) => x[0]);
}

export default function any_ban_hits(src: string): string[] {
  return scan(src, new Map<number, Entry[]>()).map(([l, n]) => l + "@" + String(n));
}
