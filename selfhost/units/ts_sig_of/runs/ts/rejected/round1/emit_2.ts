const HEAD = /^export[ \t]+(default[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*/;
const LITERAL = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const ONE_DECL = new RegExp("[;`\\r\\n\\u2028\\u2029]|\\/\\/|\\/\\*|\\*\\/|=(?!>)");
const ANY_NEVER = /(?:^|[^\w$.])(?:any|never)(?![\w$])/;
const NO_VALUE_TYPE = /(?:^|[^\w$.])(?:typeof|import|infer)(?![\w$])/;

function isBlank(ch: string | undefined): boolean {
  return ch === " " || ch === "\t";
}

function trimBlank(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && isBlank(s[a])) a++;
  while (b > a && isBlank(s[b - 1])) b--;
  return s.slice(a, b);
}

function matchClose(m: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < m.length; i++) {
    const ch = m[i];
    if (ch === open) {
      depth++;
    } else if (ch === close) {
      if (close === ">" && i > 0 && m[i - 1] === "=") continue;
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export default function ts_sig_of(sig: string): { exportName: string | null; fnType: string } {
  const s = trimBlank(sig);
  const head = HEAD.exec(s);
  if (head === null) throw new Error("SIG is not an exported function declaration: " + sig);
  const isDefault = head[1] !== undefined;
  const name = head[2] ?? "";
  let c = head[0].length;
  const m = s.replace(LITERAL, (lit: string) => lit[0] + " ".repeat(lit.length - 2) + lit[lit.length - 1]);
  if (ONE_DECL.test(m)) throw new Error("SIG is more than one declaration: " + sig);
  if (ANY_NEVER.test(m)) throw new Error("SIG uses any or never: " + sig);
  if (NO_VALUE_TYPE.test(m)) throw new Error("SIG uses typeof / import / infer: " + sig);
  let generics = "";
  if (m[c] === "<") {
    const close = matchClose(m, c, "<", ">");
    if (close < 0) throw new Error("unbalanced <>: " + sig);
    generics = s.slice(c, close + 1);
    c = close + 1;
  }
  while (c < m.length && isBlank(m[c])) c++;
  if (m[c] !== "(") throw new Error("SIG has no parameter list: " + sig);
  const pclose = matchClose(m, c, "(", ")");
  if (pclose < 0) throw new Error("unbalanced (): " + sig);
  const params = s.slice(c, pclose + 1);
  let r = pclose + 1;
  while (r < s.length && isBlank(s[r])) r++;
  if (s[r] !== ":") throw new Error("SIG declares no return type: " + sig);
  const after = s.slice(r + 1);
  if (after.trim().length === 0) throw new Error("SIG declares no return type: " + sig);
  let k = 0;
  while (k < after.length && isBlank(after[k])) k++;
  const ret = after.slice(k);
  return { exportName: isDefault ? null : name, fnType: generics + params + " => " + ret };
}
