const HEAD = /^export[ \t]+(default[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*/;
const LITERAL = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const ONE_DECL = new RegExp("[;`\\r\\n\\u2028\\u2029]|\\/\\/|\\/\\*|\\*\\/|=(?!>)");
const ANY_NEVER = new RegExp("(?:^|[^\\w$.])(?:any|never)(?![\\w$])");
const NO_VALUE_TYPE = new RegExp("(?:^|[^\\w$.])(?:typeof|import|infer)(?![\\w$])");

function trimBlank(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && (s[a] === " " || s[a] === "\t")) a++;
  while (b > a && (s[b - 1] === " " || s[b - 1] === "\t")) b--;
  return s.slice(a, b);
}

function skipBlank(s: string, i: number): number {
  let k = i;
  while (k < s.length && (s[k] === " " || s[k] === "\t")) k++;
  return k;
}

function matchClose(m: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < m.length; i++) {
    const ch = m[i];
    if (ch === open) depth++;
    else if (ch === close) {
      if (close === ">" && i > 0 && m[i - 1] === "=") continue;
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export default function ts_sig_of(sig: string): { exportName: string | null; fnType: string } {
  const S = trimBlank(sig);
  const h = HEAD.exec(S);
  if (h === null) throw new Error("SIG is not an exported function declaration: " + sig);
  const isDefault = h[1] !== undefined;
  const name = h[2];
  if (name === undefined) throw new Error("SIG is not an exported function declaration: " + sig);
  let c = h[0].length;
  const M = S.replace(LITERAL, (lit: string) => lit[0] + " ".repeat(lit.length - 2) + lit[0]);
  if (ONE_DECL.test(M)) throw new Error("SIG is more than one declaration: " + sig);
  if (ANY_NEVER.test(M)) throw new Error("SIG uses any or never: " + sig);
  if (NO_VALUE_TYPE.test(M)) throw new Error("SIG uses typeof / import / infer: " + sig);
  let generics = "";
  if (M[c] === "<") {
    const e = matchClose(M, c, "<", ">");
    if (e < 0) throw new Error("unbalanced <>: " + sig);
    generics = S.slice(c, e + 1);
    c = e + 1;
  }
  c = skipBlank(M, c);
  if (M[c] !== "(") throw new Error("SIG has no parameter list: " + sig);
  const pe = matchClose(M, c, "(", ")");
  if (pe < 0) throw new Error("unbalanced (): " + sig);
  const params = S.slice(c, pe + 1);
  const rest = S.slice(pe + 1).replace(/^[ \t]+/, "");
  if (rest[0] !== ":") throw new Error("SIG declares no return type: " + sig);
  const after = rest.slice(1);
  if (after.trim().length === 0) throw new Error("SIG declares no return type: " + sig);
  const ret = after.replace(/^[ \t]+/, "");
  return { exportName: isDefault ? null : name, fnType: generics + params + " => " + ret };
}
