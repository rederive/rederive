const isMap = (x) => {
  if (x === null || typeof x !== 'object') return false;
  if (Object.prototype.toString.call(x) !== '[object Object]') return false;
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
    const out = [];
    for (let i = 0; i < x.length; i++) {
      if (!(i in x)) throw new Error('carried table: list hole');
      out.push(write(x[i]));
    }
    return '[' + out.join(',') + ']';
  }
  if (isMap(x)) {
    const keys = Object.keys(x).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + write(x[k])).join(',') + '}';
  }
  throw new Error('carried table: unsupported value');
};

export default function carried_canonical(table) {
  if (!isMap(table)) throw new Error('carried table: not a map');
  return write(table);
}
