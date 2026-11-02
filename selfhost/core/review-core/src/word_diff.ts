type Op = '=' | '-' | '+';
type Entry = { op: Op; text: string };

const TOKENS = /(\s+)/;
const WS_ONLY = /^\s*$/;

function words(t: string): number {
  if (WS_ONLY.test(t)) return 0;
  return t.trim().split(/\s+/).length;
}

function tok(s: string): string[] {
  if (typeof s !== 'string') throw new Error('not text');
  return s.split(TOKENS);
}

export function wordDiff(a: string, b: string): { op: '=' | '-' | '+'; text: string }[] {
  if (typeof a !== 'string' || typeof b !== 'string') throw new Error('not text');
  const X = tok(a);
  const Y = tok(b);
  const n = X.length;
  const m = Y.length;
  const L: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) L.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = L[i];
    const next = L[i + 1];
    if (row === undefined || next === undefined) continue;
    for (let j = m - 1; j >= 0; j--) {
      if (X[i] === Y[j]) {
        row[j] = (next[j + 1] ?? 0) + 1;
      } else {
        const d = next[j] ?? 0;
        const r = row[j + 1] ?? 0;
        row[j] = d >= r ? d : r;
      }
    }
  }
  const lv = (i: number, j: number): number => {
    const r = L[i];
    return r === undefined ? 0 : (r[j] ?? 0);
  };

  const raw: Entry[] = [];
  const emit = (op: Op, text: string): void => {
    const last = raw[raw.length - 1];
    if (last !== undefined && last.op === op) last.text += text;
    else raw.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const x = X[i] as string;
    const y = Y[j] as string;
    if (x === y) {
      emit('=', x);
      i++;
      j++;
    } else if (lv(i + 1, j) >= lv(i, j + 1)) {
      emit('-', x);
      i++;
    } else {
      emit('+', y);
      j++;
    }
  }
  while (i < n) emit('-', X[i++] as string);
  while (j < m) emit('+', Y[j++] as string);

  const out: Entry[] = [];
  const len = raw.length;
  let k = 0;
  while (k < len) {
    const e = raw[k];
    if (e === undefined) break;
    if (e.op === '=') {
      out.push({ op: '=', text: e.text });
      k++;
      continue;
    }
    let del = '';
    let ins = '';
    let end = k;
    let p = k;
    while (p < len) {
      const c = raw[p];
      if (c === undefined) break;
      if (c.op === '-') {
        del += c.text;
        end = p;
      } else if (c.op === '+') {
        ins += c.text;
        end = p;
      } else if (p !== len - 1 && words(c.text) <= 2) {
        del += c.text;
        ins += c.text;
      } else {
        break;
      }
      p++;
    }
    if (del !== '') out.push({ op: '-', text: del });
    if (ins !== '') out.push({ op: '+', text: ins });
    k = end + 1;
  }
  return out.filter((e) => e.text !== '');
}
