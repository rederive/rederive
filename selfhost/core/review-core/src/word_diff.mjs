const TOKENS = /(\s+)/;
const WS_ONLY = /^\s*$/;

function words(t) {
  if (WS_ONLY.test(t)) return 0;
  return t.trim().split(/\s+/).length;
}

export function wordDiff(a, b) {
  const X = a.split(TOKENS);
  const Y = b.split(TOKENS);
  const n = X.length, m = Y.length;
  const w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = X[i] === Y[j]
        ? L[(i + 1) * w + j + 1] + 1
        : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
  }
  const raw = [];
  const push = (op, text) => {
    const last = raw[raw.length - 1];
    if (last && last.op === op) last.text += text;
    else raw.push({ op, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (X[i] === Y[j]) { push("=", X[i]); i++; j++; }
    else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) { push("-", X[i]); i++; }
    else { push("+", Y[j]); j++; }
  }
  while (i < n) push("-", X[i++]);
  while (j < m) push("+", Y[j++]);

  const out = [];
  const total = raw.length;
  let k = 0;
  while (k < total) {
    const e = raw[k];
    if (e.op === "=") { out.push({ op: "=", text: e.text }); k++; continue; }
    let del = "", ins = "", end = k;
    let p = k;
    while (p < total) {
      const f = raw[p];
      if (f.op === "-") { del += f.text; end = p; }
      else if (f.op === "+") { ins += f.text; end = p; }
      else if (p !== total - 1 && words(f.text) <= 2) { del += f.text; ins += f.text; }
      else break;
      p++;
    }
    if (del !== "") out.push({ op: "-", text: del });
    if (ins !== "") out.push({ op: "+", text: ins });
    k = end + 1;
  }
  return out.filter((e) => e.text !== "");
}
