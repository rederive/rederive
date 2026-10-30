const REGEX_AFTER = /(?:^|[(,=:[!&|?{};+\-*%<>~^])\s*$|(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
const DIRECTIVE = /@ts-(?:ignore|expect-error)|@ts-nocheck/i;
const OPERAND_END = new RegExp("[\\w$)\\]\"\\u0080-\\uffff]$");
const KEY_AFTER = new RegExp("(?:[^\\S\\n\\r\\u2028\\u2029]|[\\u0085\\u200b])*[!?]?:", "y");
const KEY_BEFORE = /(?:^|[{(,;])\s*$/;
const MEMBER = /(?<!\.)\.\s*$/;
const WORD_CHAR = new RegExp("(?![\\s\\u0085\\u200b])[\\w$\\u0080-\\uffff]");
const GUESSED_KEYWORD = /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$|\.\s*(?:return|typeof|case|do|else|in|of|void|yield|await|throw|delete|new)\s*$/;
const NOT_REGEX_AFTER = /(?:\+\+|--)\s*$/;
const AS_BEFORE = /(?:^|\W)as\s*$/;
const LT_BEFORE = /<\s*$/;
const GT_AFTER = /\s*>/y;
const COLON_BEFORE = /:\s*$/;
const PREFIX = new Set(["return", "typeof", "void", "in", "of", "case", "delete", "await", "yield", "throw", "else", "do", "instanceof", "new", "extends"]);

function countLF(s) {
  let c = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) c++;
  return c;
}

function scan(src, memo) {
  const n = src.length;
  const hits = [];
  const seen = new Set();
  const rec = (label, line) => {
    const k = label + "@" + line;
    if (seen.has(k)) return;
    seen.add(k);
    hits.push({ label, line });
  };
  let i = 0, line = 1, ctx = "", depth = 0, text = false;
  const stack = [];
  while (i < n) {
    if (text) {
      const ch = src[i];
      if (ch === "\\") {
        if (src[i + 1] === "\n") line++;
        i += 2;
      } else if (ch === "\n") {
        line++; ctx = ""; i++;
      } else if (ch === "`") {
        ctx += "`"; text = false; i++;
      } else if (ch === "$" && src[i + 1] === "{") {
        stack.push(depth); depth++; ctx += " "; text = false; i += 2;
      } else i++;
      continue;
    }
    const c = src[i];
    if (c === "\n") { line++; ctx = ""; i++; continue; }
    if (c === "/" && src[i + 1] === "/") {
      let e = i + 2;
      while (e < n) {
        const ch = src.charCodeAt(e);
        if (ch === 10 || ch === 13 || ch === 0x2028 || ch === 0x2029) break;
        e++;
      }
      const t = src.slice(i, e);
      if (DIRECTIVE.test(t) || DIRECTIVE.test(t.toLowerCase())) rec("@ts-ignore", line);
      i = e;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      const raw = src.slice(i, end);
      const low = raw.toLowerCase();
      const P = raw.search(DIRECTIVE), Q = low.search(DIRECTIVE);
      if (P >= 0 || Q >= 0) {
        const at = Math.max(P, Q);
        const base = P >= 0 ? raw : low;
        rec("@ts-ignore", line + countLF(base.slice(0, at)));
      }
      const lf = countLF(raw);
      line += lf;
      if (lf > 0) ctx = "";
      ctx += " ";
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        const ch = src[j];
        if (ch === "\\") {
          if (src[j + 1] === "\r" && src[j + 2] === "\n") { j += 3; line++; }
          else if (src[j + 1] === "\n") { line++; j += 2; }
          else j += 2;
        } else if (ch === c) { j++; break; }
        else if (ch === "\n") break;
        else j++;
      }
      ctx += '"';
      i = Math.min(j, n);
      continue;
    }
    if (c === "`") { text = true; i++; continue; }
    if (c === "/" && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
      let j = i + 1, inClass = false, found = -1;
      while (j < n) {
        const ch = src[j];
        if (ch === "\\") { j += 2; continue; }
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) { found = j; break; }
        else if (ch === "\n") break;
        j++;
      }
      if (found >= 0) {
        if (/^\s*$/.test(ctx) || GUESSED_KEYWORD.test(ctx)) {
          const rest = src.slice(i + 1);
          let res = memo.get(rest.length);
          if (!res) { res = scan(rest, memo); memo.set(rest.length, res); }
          for (const h of res) rec(h.label, line + h.line - 1);
        }
        const res2 = scan(src.slice(i + 1, found), new Map());
        for (const h of res2) rec(h.label, line);
        let k = found + 1;
        while (k < n) {
          const cc = src.charCodeAt(k);
          if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122)) k++; else break;
        }
        ctx += " ";
        i = k;
        continue;
      }
    }
    if (c === "{") { depth++; ctx += c; i++; continue; }
    if (c === "}") {
      if (stack.length && stack[stack.length - 1] === depth - 1) {
        stack.pop(); depth--; text = true; i++;
      } else { depth--; ctx += c; i++; }
      continue;
    }
    if (WORD_CHAR.test(c)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(src[j])) j++;
      const word = src.slice(i, j);
      if (word === "any") {
        let excused = MEMBER.test(ctx);
        if (!excused) {
          KEY_AFTER.lastIndex = j;
          if (KEY_AFTER.test(src) && KEY_BEFORE.test(ctx)) excused = true;
        }
        if (!excused) {
          let label = "any";
          GT_AFTER.lastIndex = j;
          if (AS_BEFORE.test(ctx)) label = "as any";
          else if (LT_BEFORE.test(ctx) && GT_AFTER.test(src)) label = "<any>";
          else if (COLON_BEFORE.test(ctx)) label = ": any";
          rec(label, line);
        }
      }
      ctx += word;
      i = j;
      continue;
    }
    if (c === "!" && src[i + 1] !== "=") {
      const B = ctx.replace(/[ \t]+$/, "");
      if (B !== "" && OPERAND_END.test(B) && !PREFIX.has(/[\w$]*$/.exec(B)[0])) rec("non-null assertion", line);
    }
    ctx += c;
    i++;
  }
  return hits.map((h, idx) => ({ h, idx })).sort((a, b) => a.h.line - b.h.line || a.idx - b.idx).map((x) => x.h);
}

export default function any_ban_hits(src) {
  return scan(src, new Map()).map((h) => h.label + "@" + h.line);
}
