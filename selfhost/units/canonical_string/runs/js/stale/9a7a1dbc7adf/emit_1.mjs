const HEX16 = /^[0-9a-f]{16}$/;

function render(x) {
  if (typeof x === 'string') return JSON.stringify(x);
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (Array.isArray(x)) {
    for (let i = 0; i < x.length; i++) {
      if (!(i in x)) throw new Error('not canonical: hole');
    }
    return '[' + x.map(render).join(',') + ']';
  }
  if (x !== null && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype) {
    if (x.t === 'f64') {
      if (typeof x.bits !== 'string' || !HEX16.test(x.bits)) {
        throw new Error('not canonical: an f64 tag without 16-hex bits');
      }
      return '{"bits":' + JSON.stringify(x.bits) + ',"t":"f64"}';
    }
    if (x.t === 'throw') return '{"t":"throw"}';
    const keys = Object.keys(x).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + render(x[k])).join(',') + '}';
  }
  throw new Error('not canonical: ' + typeof x);
}

export default function canonical_string(value) {
  return render(value);
}
