const HEX16 = /^[0-9a-f]{16}$/;
const CAP = 416;

function render(x, d) {
  if (d > CAP) throw new Error('not canonical: too deep');
  if (typeof x === 'string') return JSON.stringify(x);
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (Array.isArray(x)) {
    const parts = [];
    for (let i = 0; i < x.length; i++) {
      if (!(i in x)) throw new Error('not canonical: hole');
    }
    for (let i = 0; i < x.length; i++) parts.push(render(x[i], d + 1));
    return '[' + parts.join(',') + ']';
  }
  if (typeof x === 'object' && x !== null) {
    const p = Object.getPrototypeOf(x);
    if (p !== Object.prototype && p !== null) throw new Error('not canonical: object');
    const tag = Object.prototype.hasOwnProperty.call(x, 't') ? x.t : undefined;
    if (tag === 'f64') {
      const bits = Object.prototype.hasOwnProperty.call(x, 'bits') ? x.bits : undefined;
      if (typeof bits !== 'string' || !HEX16.test(bits)) {
        throw new Error('not canonical: an f64 tag without 16-hex bits');
      }
      return '{' + JSON.stringify('bits') + ':' + render(bits, d + 1) + ',' +
        JSON.stringify('t') + ':' + render('f64', d + 1) + '}';
    }
    if (tag === 'throw') {
      return '{' + JSON.stringify('t') + ':' + render('throw', d + 1) + '}';
    }
    const keys = Object.keys(x).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ':' + render(x[k], d + 1));
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not canonical: ' + typeof x);
}

export default function canonical_string(value) {
  return render(value, 0);
}
