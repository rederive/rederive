const HEAD = /^export[ \t]+(default[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*/;
const LITERAL = new RegExp("\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'", "g");
const ONE_DECL = new RegExp("[;`\\r\\n\\u2028\\u2029]|\\/\\/|\\/\\*|\\*\\/|=(?!>)");
const ANY_NEVER = new RegExp("(?:^|[^\\w$.])(?:any|never)(?![\\w$])");
const NO_VALUE_TYPE = new RegExp("(?:^|[^\\w$.])(?:typeof|import|infer)(?![\\w$])");

function skipBlank(s: string, i: number): number {
  let j = i;
  while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
  return j;
}

function matchClose(m: string, from: number, open: string, close: string, arrow: boolean): number {
  let depth = 0;
  for (let i = from; i < m.length; i++) {
    const ch = m[i];
    if (ch === open) depth++;
    else if (ch === close) {
      if (arrow && i > 0 && m[i - 1] === "=") continue;
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export default function ts_sig_of(sig: string): { exportName: string | null; fnType: string } {
  const start = skipBlank(sig, 0);
  let end = sig.length;
  while (end > start && (sig[end - 1] === " " || sig[end - 1] === "\t")) end--;
  const S = sig.slice(start, end);
  const h = HEAD.exec(S);
  if (h === null) throw new Error("SIG is not an exported function declaration: " + sig);
  const isDefault = h[1] !== undefined;
  const name = h[2] === undefined ? "" : h[2];
  let c = h[0].length;
  const M = S.replace(LITERAL, (lit: string) => lit[0] + " ".repeat(lit.length - 2) + lit[0]);
  if (ONE_DECL.test(M)) throw new Error("SIG is more than one declaration: " + sig);
  if (ANY_NEVER.test(M)) throw new Error("SIG uses any or never: " + sig);
  if (NO_VALUE_TYPE.test(M)) throw new Error("SIG uses typeof / import / infer: " + sig);
  let generics = "";
  if (M[c] === "<") {
    const close = matchClose(M, c, "<", ">", true);
    if (close < 0) throw new Error("unbalanced <>: " + sig);
    generics = S.slice(c, close + 1);
    c = close + 1;
  }
  c = skipBlank(M, c);
  if (M[c] !== "(") throw new Error("SIG has no parameter list: " + sig);
  const pc = matchClose(M, c, "(", ")", false);
  if (pc < 0) throw new Error("unbalanced (): " + sig);
  const params = S.slice(c, pc + 1);
  const rest = S.slice(skipBlank(S, pc + 1));
  if (rest[0] !== ":") throw new Error("SIG declares no return type: " + sig);
  const after = rest.slice(1);
  if (after.trim() === "") throw new Error("SIG declares no return type: " + sig);
  const ret = after.slice(skipBlank(after, 0));
  return { exportName: isDefault ? null : name, fnType: generics + params + " => " + ret };
}
