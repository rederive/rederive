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
      parts.push(render(x[i], d + 1));
    }
    return '[' + parts.join(',') + ']';
  }
  if (typeof x === 'object' && x !== null) {
    const p = Object.getPrototypeOf(x);
    if (p !== Object.prototype && p !== null) throw new Error('not canonical: object');
    if (x.t === 'f64') {
      if (typeof x.bits !== 'string' || !HEX16.test(x.bits)) {
        throw new Error('not canonical: an f64 tag without 16-hex bits');
      }
      if (d + 1 > CAP) throw new Error('not canonical: too deep');
      return '{"bits":' + JSON.stringify(x.bits) + ',"t":"f64"}';
    }
    if (x.t === 'throw') {
      if (d + 1 > CAP) throw new Error('not canonical: too deep');
      return '{"t":"throw"}';
    }
    const keys = Object.keys(x).sort();
    const parts = [];
    for (const k of keys) parts.push(JSON.stringify(k) + ':' + render(x[k], d + 1));
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not canonical: ' + typeof x);
}

export default function canonical_string(value) {
  return render(value, 0);
}
