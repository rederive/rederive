type Entry = { op: '=' | '-' | '+'; text: string };

const TOKENS = /(\s+)/;
const WS_ONLY = /^\s*$/;

function words(t: string): number {
  if (WS_ONLY.test(t)) return 0;
  return t.trim().split(/\s+/).length;
}

export function wordDiff(a: string, b: string): { op: '=' | '-' | '+'; text: string }[] {
  if (typeof a !== 'string' || typeof b !== 'string') throw new Error('word_diff: not text');
  const X = a.split(TOKENS);
  const Y = b.split(TOKENS);
  const n = X.length;
  const m = Y.length;
  const L: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) L.push(new Uint32Array(m + 1));
  const at = (i: number, j: number): number => {
    const row = L[i];
    return row === undefined ? 0 : (row[j] ?? 0);
  };
  for (let i = n - 1; i >= 0; i--) {
    const row = L[i];
    if (row === undefined) continue;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = X[i] === Y[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const raw: Entry[] = [];
  const emit = (op: '=' | '-' | '+', text: string): void => {
    const last = raw[raw.length - 1];
    if (last !== undefined && last.op === op) last.text += text;
    else raw.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const xi = X[i] ?? '';
    const yj = Y[j] ?? '';
    if (xi === yj) {
      emit('=', xi);
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      emit('-', xi);
      i++;
    } else {
      emit('+', yj);
      j++;
    }
  }
  while (i < n) emit('-', X[i++] ?? '');
  while (j < m) emit('+', Y[j++] ?? '');

  const out: Entry[] = [];
  const total = raw.length;
  let k = 0;
  while (k < total) {
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
    while (p < total) {
      const f = raw[p];
      if (f === undefined) break;
      if (f.op === '-') {
        del += f.text;
        end = p;
      } else if (f.op === '+') {
        ins += f.text;
        end = p;
      } else if (p !== total - 1 && words(f.text) <= 2) {
        del += f.text;
        ins += f.text;
      } else {
        break;
      }
      p++;
    }
    if (del !== '') out.push({ op: '-', text: del });
    if (ins !== '') out.push({ op: '+', text: ins });
    k = end + 1;
  }
  return out.filter((x) => x.text !== '');
}
