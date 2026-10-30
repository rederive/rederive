const HEAD = /^export[ \t]+(default[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*/;
const LITERAL = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const ONE_DECL = /[;`\r\n\u2028\u2029]|\/\/|\/\*|\*\/|=(?!>)/;
const ANY_NEVER = /(?:^|[^\w$.])(?:any|never)(?![\w$])/;
const NO_VALUE_TYPE = /(?:^|[^\w$.])(?:typeof|import|infer)(?![\w$])/;

function trimBlank(s) {
  let a = 0;
  let b = s.length;
  while (a < b && (s[a] === " " || s[a] === "\t")) a++;
  while (b > a && (s[b - 1] === " " || s[b - 1] === "\t")) b--;
  return s.slice(a, b);
}

function lstripBlank(s) {
  let a = 0;
  while (a < s.length && (s[a] === " " || s[a] === "\t")) a++;
  return s.slice(a);
}

function matchClose(m, start, open, close, arrows) {
  let depth = 0;
  for (let i = start; i < m.length; i++) {
    const ch = m[i];
    if (ch === open) depth++;
    else if (ch === close) {
      if (arrows && i > 0 && m[i - 1] === "=") continue;
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export default function ts_sig_of(sig) {
  const S = trimBlank(sig);
  const h = HEAD.exec(S);
  if (!h) throw new Error("SIG is not an exported function declaration: " + sig);
  let c = h[0].length;
  const M = S.replace(LITERAL, (x) => x[0] + " ".repeat(x.length - 2) + x[x.length - 1]);
  if (ONE_DECL.test(M)) throw new Error("SIG is more than one declaration: " + sig);
  if (ANY_NEVER.test(M)) throw new Error("SIG uses any or never: " + sig);
  if (NO_VALUE_TYPE.test(M)) throw new Error("SIG uses typeof / import / infer: " + sig);
  let generics = "";
  if (M[c] === "<") {
    const e = matchClose(M, c, "<", ">", true);
    if (e < 0) throw new Error("unbalanced <>: " + sig);
    generics = S.slice(c, e + 1);
    c = e + 1;
  }
  while (c < M.length && (M[c] === " " || M[c] === "\t")) c++;
  if (M[c] !== "(") throw new Error("SIG has no parameter list: " + sig);
  const pe = matchClose(M, c, "(", ")", false);
  if (pe < 0) throw new Error("unbalanced (): " + sig);
  const params = S.slice(c, pe + 1);
  const rest = lstripBlank(S.slice(pe + 1));
  if (rest[0] !== ":" || rest.slice(1).trim() === "") {
    throw new Error("SIG declares no return type: " + sig);
  }
  const ret = lstripBlank(rest.slice(1));
  return { exportName: h[1] ? null : h[2], fnType: generics + params + " => " + ret };
}
