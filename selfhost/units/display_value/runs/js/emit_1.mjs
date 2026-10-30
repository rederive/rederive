const MISSING = Symbol('missing');
const NULLV = Symbol('null');
const has = (o, k) => Object.hasOwn(o, k);
const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const q = (s) => JSON.stringify(s);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const fieldName = (n) => (typeof n === 'string' && IDENT.test(n) ? n : q(n));

function disp(x) {
  if (x === null || x === undefined) throw new Error('none at node position');
  if (!isMap(x) || !has(x, 't') || typeof x.t !== 'string') return '?';
  const hv = has(x, 'v');
  const v = hv ? x.v : undefined;
  switch (x.t) {
    case 'none': return 'null';
    case 'undefined': return 'undefined';
    case 'text':
      if (!hv) return MISSING;
      if (typeof v === 'string') return q(v);
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (v === null) return 'null';
      return q(String(v));
    case 'f64': case 'i64': case 'u64': case 'bytes':
      if (!hv) return MISSING;
      if (v === null) return NULLV;
      return v;
    case 'bigint':
      if (!hv) return 'undefinedn';
      return String(v) + 'n';
    case 'bool':
      if (!hv) return 'undefined';
      if (v === true) return 'true';
      if (v === false) return 'false';
      if (v === null) return 'null';
      return v;
    case 'throw': {
      const m = has(x, 'msg') ? x.msg : undefined;
      if (typeof m === 'string') return 'throw(' + q(m) + ')';
      if (typeof m === 'boolean') return 'throw(' + (m ? 'true' : 'false') + ')';
      return 'throw("")';
    }
    case 'list': case 'tuple': {
      if (!Array.isArray(v)) throw new Error('v not a list');
      return '[' + v.map((e) => {
        const d = disp(e);
        return d === MISSING || d === NULLV ? '' : d;
      }).join(',') + ']';
    }
    case 'record': case 'map': {
      if (!Array.isArray(v)) throw new Error('v not a list');
      const rec = x.t === 'record';
      const parts = v.map((e) => {
        let items;
        if (Array.isArray(e)) items = e;
        else if (typeof e === 'string') items = [...e];
        else throw new Error('bad entry');
        if (items.length < 2) throw new Error('short entry');
        const fix = (d) => (d === MISSING ? 'undefined' : d === NULLV ? 'null' : d);
        const a = rec ? fieldName(items[0]) : fix(disp(items[0]));
        return a + ':' + fix(disp(items[1]));
      });
      return rec ? '{' + parts.join(', ') + '}' : '{' + parts.join(',') + '}';
    }
    default: return '?';
  }
}

export default function display_value(tv) {
  const d = disp(tv);
  return d === MISSING || d === NULLV ? null : d;
}
