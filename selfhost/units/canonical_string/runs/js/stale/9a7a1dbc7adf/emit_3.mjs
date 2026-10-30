const HEX16 = /^[0-9a-f]{16}$/;

function render(x) {
  if (typeof x === 'string') return JSON.stringify(x);
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (Array.isArray(x)) {
    const parts = [];
    for (let i = 0; i < x.length; i++) {
      if (!(i in x)) throw new Error('not canonical: list hole');
    }
    for (let i = 0; i < x.length; i++) parts.push(render(x[i]));
    return '[' + parts.join(',') + ']';
  }
  if (typeof x === 'object' && x !== null && Object.getPrototypeOf(x) === Object.prototype) {
    if (x.t === 'f64') {
      const bits = x.bits;
      if (typeof bits !== 'string' || !HEX16.test(bits)) {
        throw new Error('not canonical: an f64 tag without 16-hex bits');
      }
      return '{"bits":' + JSON.stringify(bits) + ',"t":"f64"}';
    }
    if (x.t === 'throw') return '{"t":"throw"}';
    const keys = Object.keys(x).sort();
    const parts = [];
    for (const k of keys) parts.push(JSON.stringify(k) + ':' + render(x[k]));
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not canonical: ' + (x === null ? 'none' : typeof x));
}

export default function canonical_string(value) {
  return render(value);
}
