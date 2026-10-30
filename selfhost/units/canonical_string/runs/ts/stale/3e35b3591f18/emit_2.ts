const HEX16 = /^[0-9a-f]{16}$/;

function quote(s: string): string {
  return JSON.stringify(s);
}

function render(x: unknown): string {
  if (typeof x === 'string') return quote(x);
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (Array.isArray(x)) {
    const parts: string[] = [];
    for (let i = 0; i < x.length; i++) {
      if (!(i in x)) throw new Error('not canonical: list hole');
      parts.push(render(x[i]));
    }
    return '[' + parts.join(',') + ']';
  }
  if (typeof x === 'object' && x !== null) {
    if (Object.getPrototypeOf(x) !== Object.prototype) {
      throw new Error('not canonical: non-plain object');
    }
    const o = x as Record<string, unknown>;
    const tag = Object.prototype.hasOwnProperty.call(o, 't') ? o['t'] : undefined;
    if (tag === 'f64') {
      const bits = Object.prototype.hasOwnProperty.call(o, 'bits') ? o['bits'] : undefined;
      if (typeof bits !== 'string' || !HEX16.test(bits)) {
        throw new Error('not canonical: an f64 tag without 16-hex bits');
      }
      return '{"bits":' + quote(bits) + ',"t":"f64"}';
    }
    if (tag === 'throw') return '{"t":"throw"}';
    const keys = Object.keys(o).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(quote(k) + ':' + render(o[k]));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not canonical: ' + typeof x);
}

export default function canonical_string(value: unknown): string {
  return render(value);
}
