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

function countLF(s) {
  let c = 0;
  for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) === 10) c++;
  return c;
}

function scan(src, memo) {
  const hit = memo.get(src);
  if (hit) return hit;
  const n = src.length;
  let i = 0, line = 1, ctx = "", depth = 0, inText = false;
  const stack = [];
  const hits = [];
  const seen = new Set();
  const record = (label, l) => {
    const e = label + "@" + l;
    if (!seen.has(e)) { seen.add(e); hits.push(e); }
  };
  const replay = (entries, mapLine) => {
    for (const e of entries) {
      const at = e.lastIndexOf("@");
      record(e.slice(0, at), mapLine(Number(e.slice(at + 1))));
    }
  };
  while (i < n) {
    if (inText) {
      const ch = src[i];
      if (ch === "\\") {
        if (src[i + 1] === "\n") line++;
        i += 2;
      } else if (ch === "\n") {
        line++; ctx = ""; i++;
      } else if (ch === "`") {
        i++; ctx += "`"; inText = false;
      } else if (ch === "$" && src[i + 1] === "{") {
        i += 2; stack.push(depth); depth++; ctx += " "; inText = false;
      } else i++;
      continue;
    }
    const c = src[i];
    if (c === "\n") { line++; ctx = ""; i++; continue; }
    if (c === "/" && src[i + 1] === "/") {
      let end = i;
      while (end < n) {
        const e = src.charCodeAt(end);
        if (e === 10 || e === 13 || e === 0x2028 || e === 0x2029) break;
        end++;
      }
      const cm = src.slice(i, end);
      if (DIRECTIVE.test(cm) || DIRECTIVE.test(cm.toLowerCase())) record("@ts-ignore", line);
      i = end;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      const close = e < 0 ? n : e + 2;
      const raw = src.slice(i, close);
      const low = raw.toLowerCase();
      const P = raw.search(DIRECTIVE), Q = low.search(DIRECTIVE);
      if (P >= 0 || Q >= 0) {
        const at = Math.max(P, Q);
        const base = P >= 0 ? raw : low;
        record("@ts-ignore", line + countLF(base.slice(0, at)));
      }
      const lf = countLF(raw);
      line += lf;
      if (lf > 0) ctx = "";
      ctx += " ";
      i = close;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        const ch = src[j];
        if (ch === "\\") {
          if (src[j + 1] === "\r" && src[j + 2] === "\n") { j += 3; line++; }
          else if (src[j + 1] === "\n") { j += 2; line++; }
          else j += 2;
        } else if (ch === c) { j++; break; }
        else if (ch === "\n") break;
        else j++;
      }
      ctx += '"';
      i = Math.min(j, n);
      continue;
    }
    if (c === "`") { i++; inText = true; continue; }
    if (c === "/" && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
      let j = i + 1, inClass = false, end = -1;
      while (j < n) {
        const ch = src[j];
        if (ch === "\\") { j += 2; continue; }
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) { end = j; break; }
        else if (ch === "\n") break;
        j++;
      }
      if (end >= 0) {
        if (ctx.trim() === "" || GUESSED_KEYWORD.test(ctx)) {
          const rest = scan(src.slice(i + 1), memo);
          replay(rest, (l) => line + l - 1);
        }
        const body = scan(src.slice(i + 1, end), memo);
        replay(body, () => line);
        j = end + 1;
        while (j < n) {
          const k = src.charCodeAt(j);
          if ((k >= 65 && k <= 90) || (k >= 97 && k <= 122)) j++; else break;
        }
        ctx += " ";
        i = j;
        continue;
      }
      ctx += c; i++;
      continue;
    }
    if (c === "{") { depth++; ctx += c; i++; continue; }
    if (c === "}") {
      if (stack.length && stack[stack.length - 1] === depth - 1) {
        stack.pop(); depth--; i++; inText = true;
      } else { depth--; ctx += c; i++; }
      continue;
    }
    if (WORD_CHAR.test(c)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(src[j])) j++;
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
          record(label, line);
        }
      }
      ctx += word;
      i = j;
      continue;
    }
    if (c === "!") {
      if (src[i + 1] !== "=") {
        const B = ctx.replace(/[ \t]+$/, "");
        if (B !== "" && OPERAND_END.test(B)) {
          const m = /[\w$]+$/.exec(B);
          if (!(m && PREFIX.has(m[0]))) record("non-null assertion", line);
        }
      }
      ctx += c; i++;
      continue;
    }
    ctx += c;
    i++;
  }
  const keyed = hits.map((e, idx) => [Number(e.slice(e.lastIndexOf("@") + 1)), idx, e]);
  keyed.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = keyed.map((x) => x[2]);
  memo.set(src, out);
  return out;
}

export default function any_ban_hits(src) {
  return scan(src, new Map()).slice();
}
