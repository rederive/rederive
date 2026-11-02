const TOKENS = /(\s+)/;
const WS_ONLY = /^\s*$/;

function words(t) {
  if (WS_ONLY.test(t)) return 0;
  return t.trim().split(/\s+/).length;
}

export function wordDiff(a, b) {
  const X = a.split(TOKENS);
  const Y = b.split(TOKENS);
  const n = X.length;
  const m = Y.length;
  const w = m + 1;
  const L = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (X[i] === Y[j]) L[i * w + j] = L[(i + 1) * w + j + 1] + 1;
      else {
        const p = L[(i + 1) * w + j];
        const q = L[i * w + j + 1];
        L[i * w + j] = p >= q ? p : q;
      }
    }
  }
  const raw = [];
  const emit = (op, text) => {
    const last = raw[raw.length - 1];
    if (last && last.op === op) last.text += text;
    else raw.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (X[i] === Y[j]) {
      emit("=", X[i]);
      i++;
      j++;
    } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) {
      emit("-", X[i]);
      i++;
    } else {
      emit("+", Y[j]);
      j++;
    }
  }
  while (i < n) emit("-", X[i++]);
  while (j < m) emit("+", Y[j++]);

  const out = [];
  let k = 0;
  while (k < raw.length) {
    const e = raw[k];
    if (e.op === "=") {
      out.push({ op: "=", text: e.text });
      k++;
      continue;
    }
    let del = "";
    let ins = "";
    let end = k;
    for (let p = k; p < raw.length; p++) {
      const r = raw[p];
      if (r.op === "-") {
        del += r.text;
        end = p;
      } else if (r.op === "+") {
        ins += r.text;
        end = p;
      } else if (p < raw.length - 1 && words(r.text) <= 2) {
        del += r.text;
        ins += r.text;
      } else break;
    }
    if (del !== "") out.push({ op: "-", text: del });
    if (ins !== "") out.push({ op: "+", text: ins });
    k = end + 1;
  }
  return out.filter((e) => e.text !== "");
}
