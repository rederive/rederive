type Op = '=' | '-' | '+';
type Entry = { op: Op; text: string };

function words(t: string): number {
  let n = 0;
  for (const p of t.split(/\s+/)) if (p !== '') n++;
  return n;
}

export function wordDiff(a: string, b: string): { op: '=' | '-' | '+'; text: string }[] {
  if (typeof a !== 'string' || typeof b !== 'string') throw new Error('word_diff: arguments must be text');
  const X = a.split(/(\s+)/);
  const Y = b.split(/(\s+)/);
  const n = X.length;
  const m = Y.length;
  const L: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) L.push(new Uint32Array(m + 1));
  const at = (i: number, j: number): number => {
    const row = L[i];
    if (row === undefined) return 0;
    const v = row[j];
    return v === undefined ? 0 : v;
  };
  for (let i = n - 1; i >= 0; i--) {
    const row = L[i];
    if (row === undefined) continue;
    for (let j = m - 1; j >= 0; j--) {
      if (X[i] === Y[j]) row[j] = at(i + 1, j + 1) + 1;
      else row[j] = Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
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
    } else if (at(i + 1, j) >= at(i, j + 1)) {
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
  let k = 0;
  while (k < raw.length) {
    const e = raw[k] as Entry;
    if (e.op === '=') {
      out.push({ op: '=', text: e.text });
      k++;
      continue;
    }
    let del = '';
    let ins = '';
    let end = k;
    let p = k;
    while (p < raw.length) {
      const r = raw[p] as Entry;
      if (r.op === '-') {
        del += r.text;
        end = p;
      } else if (r.op === '+') {
        ins += r.text;
        end = p;
      } else if (p !== raw.length - 1 && words(r.text) <= 2) {
        del += r.text;
        ins += r.text;
      } else break;
      p++;
    }
    if (del !== '') out.push({ op: '-', text: del });
    if (ins !== '') out.push({ op: '+', text: ins });
    k = end + 1;
  }
  return out.filter((e) => e.text !== '');
}
