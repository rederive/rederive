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
  let n = 0;
  for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) === 10) n++;
  return n;
}

function lex(src, memo) {
  const n = src.length;
  const hits = [];
  const seen = new Set();
  const record = (label, ln) => {
    const key = label + "@" + ln;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ label, line: ln });
  };
  let i = 0, line = 1, ctx = "", depth = 0, inText = false;
  const stack = [];
  while (i < n) {
    const c = src[i];
    if (inText) {
      if (c === "\\") {
        if (src[i + 1] === "\n") line++;
        i += 2;
      } else if (c === "\n") {
        line++; ctx = ""; i++;
      } else if (c === "`") {
        ctx += "`"; inText = false; i++;
      } else if (c === "$" && src[i + 1] === "{") {
        stack.push(depth); depth++; ctx += " "; inText = false; i += 2;
      } else i++;
      continue;
    }
    if (c === "\n") { line++; ctx = ""; i++; continue; }
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      let e = i;
      while (e < n) {
        const ch = src[e];
        if (ch === "\n" || ch === "\r" || ch === " " || ch === " ") break;
        e++;
      }
      const cm = src.slice(i, e);
      if (DIRECTIVE.test(cm) || DIRECTIVE.test(cm.toLowerCase())) record("@ts-ignore", line);
      i = e;
      continue;
    }
    if (c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2);
      let raw;
      if (e < 0) { raw = src.slice(i); i = n; } else { raw = src.slice(i, e + 2); i = e + 2; }
      const low = raw.toLowerCase();
      const P = raw.search(DIRECTIVE);
      const Q = low.search(DIRECTIVE);
      if (P >= 0 || Q >= 0) {
        const at = Math.max(P, Q);
        const base = P >= 0 ? raw : low;
        record("@ts-ignore", line + countLF(base.slice(0, at)));
      }
      const lf = countLF(raw);
      line += lf;
      if (lf > 0) ctx = "";
      ctx += " ";
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        const ch = src[j];
        if (ch === "\\") {
          if (src[j + 1] === "\r" && src[j + 2] === "\n") { line++; j += 3; }
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
    if (c === "`") { i++; inText = true; continue; }
    if (c === "/" && REGEX_AFTER.test(ctx) && !NOT_REGEX_AFTER.test(ctx)) {
      let j = i + 1, cls = false, found = -1;
      while (j < n) {
        const ch = src[j];
        if (ch === "\\") j += 2;
        else if (ch === "[") { cls = true; j++; }
        else if (ch === "]") { cls = false; j++; }
        else if (ch === "/" && !cls) { found = j; break; }
        else if (ch === "\n") break;
        else j++;
      }
      if (found >= 0) {
        if (/^\s*$/.test(ctx) || GUESSED_KEYWORD.test(ctx)) {
          const suffix = src.slice(i + 1);
          let res = memo.get(suffix.length);
          if (!res) { res = lex(suffix, memo); memo.set(suffix.length, res); }
          for (const h of res) record(h.label, line + h.line - 1);
        }
        const res2 = lex(src.slice(i + 1, found), new Map());
        for (const h of res2) record(h.label, line);
        j = found + 1;
        while (j < n && /[A-Za-z]/.test(src[j])) j++;
        ctx += " ";
        i = j;
        continue;
      }
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
        const excused = MEMBER.test(ctx) || (KEY_AFTER.test(after) && KEY_BEFORE.test(ctx));
        if (!excused) {
          let label = "any";
          if (/(?:^|[^\w])as\s*$/.test(ctx)) label = "as any";
          else if (/<\s*$/.test(ctx) && /^\s*>/.test(after)) label = "<any>";
          else if (/:\s*$/.test(ctx)) label = ": any";
          record(label, line);
        }
      }
      ctx += word;
      i = j;
      continue;
    }
    if (c === "!" && d !== "=") {
      const B = ctx.replace(/[ \t]+$/, "");
      if (B !== "" && OPERAND_END.test(B) && !PREFIX.has(/[\w$]*$/.exec(B)[0])) record("non-null assertion", line);
    }
    ctx += c;
    i++;
  }
  return hits.map((h, k) => [h, k]).sort((a, b) => a[0].line - b[0].line || a[1] - b[1]).map((x) => x[0]);
}

export default function any_ban_hits(src) {
  return lex(src, new Map()).map((h) => h.label + "@" + h.line);
}
