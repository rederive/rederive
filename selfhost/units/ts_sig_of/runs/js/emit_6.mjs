const HEAD = /^export[ \t]+(default[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*/;
const LITERAL = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const ONE_DECL = /[;`\r\n\u2028\u2029]|\/\/|\/\*|\*\/|=(?!>)/;
const ANY_NEVER = /(?:^|[^\w$.])(?:any|never)(?![\w$])/;
const NO_VALUE_TYPE = /(?:^|[^\w$.])(?:typeof|import|infer)(?![\w$])/;

function closeOf(M, start, open, close) {
  let n = 0;
  for (let i = start; i < M.length; i++) {
    const ch = M[i];
    if (ch === open) n++;
    else if (ch === close) {
      if (open === "<" && M[i - 1] === "=") continue;
      n--;
      if (n === 0) return i;
    }
  }
  return -1;
}

function skipBlank(s, i) {
  while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  return i;
}

export default function ts_sig_of(sig) {
  const S = sig.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
  const h = HEAD.exec(S);
  if (!h) throw new Error("SIG is not an exported function declaration: " + sig);
  let C = h[0].length;
  const M = S.replace(LITERAL, (m) => m[0] + " ".repeat(m.length - 2) + m[m.length - 1]);
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
    const e = closeOf(M, C, "<", ">");
    if (e < 0) throw new Error("unbalanced <>: " + sig);
    generics = S.slice(C, e + 1);
    C = e + 1;
  }
  C = skipBlank(M, C);
  if (M[C] !== "(") throw new Error("SIG has no parameter list: " + sig);
  const pe = closeOf(M, C, "(", ")");
  if (pe < 0) throw new Error("unbalanced (): " + sig);
  const params = S.slice(C, pe + 1);
  const rest = S.slice(pe + 1 + (skipBlank(S, pe + 1) - (pe + 1)));
  if (rest[0] !== ":") throw new Error("SIG declares no return type: " + sig);
  const after = rest.slice(1);
  if (after.trim() === "") throw new Error("SIG declares no return type: " + sig);
  const ret = after.slice(skipBlank(after, 0));
  return { exportName: h[1] ? null : h[2], fnType: generics + params + " => " + ret };
}
