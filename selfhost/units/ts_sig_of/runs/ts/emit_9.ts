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

function matchClose(m: string, start: number, open: string, close: string, arrow: boolean): number {
  let depth = 0;
  for (let i = start; i < m.length; i++) {
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
  const s = trimBlank(sig);
  const h = HEAD.exec(s);
  if (h === null) throw new Error("SIG is not an exported function declaration: " + sig);
  const isDefault = h[1] !== undefined;
  const name = h[2] === undefined ? "" : h[2];
  let c = h[0].length;
  const m = s.replace(LITERAL, (lit: string) => lit[0] + " ".repeat(lit.length - 2) + lit[0]);
  let t = "";
  let depth = 0;
  for (let i = 0; i < m.length; i++) {
    const ch = m[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    t += ch === ";" && depth > 0 ? " " : ch;
  }
  if (ONE_DECL.test(t)) throw new Error("SIG is more than one declaration: " + sig);
  if (ANY_NEVER.test(m)) throw new Error("SIG uses any or never: " + sig);
  if (NO_VALUE_TYPE.test(m)) throw new Error("SIG uses typeof / import / infer: " + sig);
  let generics = "";
  if (m[c] === "<") {
    const close = matchClose(m, c, "<", ">", true);
    if (close < 0) throw new Error("unbalanced <>: " + sig);
    generics = s.slice(c, close + 1);
    c = close + 1;
  }
  while (c < s.length && (s[c] === " " || s[c] === "\t")) c++;
  if (m[c] !== "(") throw new Error("SIG has no parameter list: " + sig);
  const pc = matchClose(m, c, "(", ")", false);
  if (pc < 0) throw new Error("unbalanced (): " + sig);
  const params = s.slice(c, pc + 1);
  let k = pc + 1;
  while (k < s.length && (s[k] === " " || s[k] === "\t")) k++;
  if (s[k] !== ":") throw new Error("SIG declares no return type: " + sig);
  const after = s.slice(k + 1);
  if (after.trim() === "") throw new Error("SIG declares no return type: " + sig);
  const ret = trimBlank(after.slice(0, after.length)).length === 0 ? "" : after.replace(/^[ \t]+/, "");
  return { exportName: isDefault ? null : name, fnType: generics + params + " => " + ret };
}
