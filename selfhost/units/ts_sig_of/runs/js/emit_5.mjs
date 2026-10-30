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

function matchClose(m, start, open, close, arrowSkip) {
  let n = 0;
  for (let i = start; i < m.length; i++) {
    const ch = m[i];
    if (ch === open) n++;
    else if (ch === close) {
      if (arrowSkip && i > 0 && m[i - 1] === "=") continue;
      n--;
      if (n === 0) return i;
    }
  }
  return -1;
}

export default function ts_sig_of(sig) {
  const S = trimBlank(sig);
  const h = HEAD.exec(S);
  if (!h) throw new Error("SIG is not an exported function declaration: " + sig);
  const isDefault = h[1] !== undefined;
  const name = h[2];
  let C = h[0].length;
  const M = S.replace(LITERAL, (lit) => lit[0] + " ".repeat(lit.length - 2) + lit[0]);
  let depth = 0;
  let T = "";
  for (let i = 0; i < M.length; i++) {
    const ch = M[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    T += ch === ";" && depth > 0 ? " " : ch;
  }
  if (ONE_DECL.test(T)) throw new Error("SIG is more than one declaration: " + sig);
  if (ANY_NEVER.test(M)) throw new Error("SIG uses any or never: " + sig);
  if (NO_VALUE_TYPE.test(M)) throw new Error("SIG uses typeof / import / infer: " + sig);
  let generics = "";
  if (M[C] === "<") {
    const e = matchClose(M, C, "<", ">", true);
    if (e < 0) throw new Error("unbalanced <>: " + sig);
    generics = S.slice(C, e + 1);
    C = e + 1;
  }
  while (C < S.length && (S[C] === " " || S[C] === "\t")) C++;
  if (M[C] !== "(") throw new Error("SIG has no parameter list: " + sig);
  const pe = matchClose(M, C, "(", ")", false);
  if (pe < 0) throw new Error("unbalanced (): " + sig);
  const params = S.slice(C, pe + 1);
  const rest = lstripBlank(S.slice(pe + 1));
  if (rest[0] !== ":" || rest.slice(1).trim() === "") {
    throw new Error("SIG declares no return type: " + sig);
  }
  const ret = lstripBlank(rest.slice(1));
  return { exportName: isDefault ? null : name, fnType: generics + params + " => " + ret };
}
