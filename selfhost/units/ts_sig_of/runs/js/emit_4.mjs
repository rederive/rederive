const HEAD = /^export[ \t]+(default[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*/;
const LITERAL = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const ONE_DECL = new RegExp("[;`\\r\\n\\u2028\\u2029]|\\/\\/|\\/\\*|\\*\\/|=(?!>)");
const ANY_NEVER = /(?:^|[^\w$.])(?:any|never)(?![\w$])/;
const NO_VALUE_TYPE = /(?:^|[^\w$.])(?:typeof|import|infer)(?![\w$])/;

const isBlank = (c) => c === " " || c === "\t";
function skipBlank(s, i) {
  while (i < s.length && isBlank(s[i])) i++;
  return i;
}

export default function ts_sig_of(sig) {
  let a = 0;
  let b = sig.length;
  while (a < b && isBlank(sig[a])) a++;
  while (b > a && isBlank(sig[b - 1])) b--;
  const S = sig.slice(a, b);

  const h = HEAD.exec(S);
  if (!h) throw new Error("SIG is not an exported function declaration: " + sig);
  let C = h[0].length;
  const isDefault = h[1] !== undefined;
  const name = h[2];

  const M = S.replace(LITERAL, (m) => m[0] + " ".repeat(m.length - 2) + m[0]);

  let depth = 0;
  let T = "";
  for (let i = 0; i < M.length; i++) {
    const c = M[i];
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    T += c === ";" && depth > 0 ? " " : c;
  }
  if (ONE_DECL.test(T)) throw new Error("SIG is more than one declaration: " + sig);
  if (ANY_NEVER.test(M)) throw new Error("SIG uses any or never: " + sig);
  if (NO_VALUE_TYPE.test(M)) throw new Error("SIG uses typeof / import / infer: " + sig);

  let generics = "";
  if (M[C] === "<") {
    let n = 0;
    let close = -1;
    for (let i = C; i < M.length; i++) {
      const c = M[i];
      if (c === "<") n++;
      else if (c === ">") {
        if (i > 0 && M[i - 1] === "=") continue;
        n--;
        if (n === 0) {
          close = i;
          break;
        }
      }
    }
    if (close < 0) throw new Error("unbalanced <>: " + sig);
    generics = S.slice(C, close + 1);
    C = close + 1;
  }
  C = skipBlank(S, C);

  if (M[C] !== "(") throw new Error("SIG has no parameter list: " + sig);
  let n = 0;
  let pclose = -1;
  for (let i = C; i < M.length; i++) {
    const c = M[i];
    if (c === "(") n++;
    else if (c === ")") {
      n--;
      if (n === 0) {
        pclose = i;
        break;
      }
    }
  }
  if (pclose < 0) throw new Error("unbalanced (): " + sig);
  const params = S.slice(C, pclose + 1);

  const rest = S.slice(pclose + 1);
  const rest2 = rest.slice(skipBlank(rest, 0));
  if (rest2[0] !== ":" || rest2.slice(1).trim() === "") {
    throw new Error("SIG declares no return type: " + sig);
  }
  const after = rest2.slice(1);
  const ret = after.slice(skipBlank(after, 0));

  return { exportName: isDefault ? null : name, fnType: generics + params + " => " + ret };
}
