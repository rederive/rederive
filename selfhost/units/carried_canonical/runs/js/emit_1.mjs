const isMap = (x) => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const p = Object.getPrototypeOf(x);
  return p === Object.prototype || p === null;
};

const write = (x) => {
  if (x === null) return 'null';
  const t = typeof x;
  if (t === 'string' || t === 'boolean') return JSON.stringify(x);
  if (t === 'number') {
    if (!Number.isFinite(x) || Object.is(x, -0)) throw new Error('carried table: number has no JSON form');
    return JSON.stringify(x);
  }
  if (Array.isArray(x)) {
    const parts = [];
    for (let i = 0; i < x.length; i++) {
      if (!(i in x)) throw new Error('carried table: list hole');
      parts.push(write(x[i]));
    }
    return '[' + parts.join(',') + ']';
  }
  if (isMap(x)) {
    return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + write(x[k])).join(',') + '}';
  }
  throw new Error('carried table: unsupported value');
};

export default function carried_canonical(table) {
  if (!isMap(table)) throw new Error('carried table: not a map');
  return write(table);
}
