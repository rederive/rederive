const MISSING = Symbol('missing');
const NULLV = Symbol('null');
const has = (o, k) => Object.hasOwn(o, k);
const Q = (s) => JSON.stringify(s);
const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const fieldName = (n) => (typeof n === 'string' && ID.test(n) ? n : typeof n === 'string' ? Q(n) : Q(String(n)));

function disp(x) {
  if (x === null || x === undefined) throw new Error('none at node position');
  if (typeof x !== 'object' || Array.isArray(x)) return '?';
  if (!has(x, 't') || typeof x.t !== 'string') return '?';
  const f = has(x, 'v');
  const v = f ? x.v : undefined;
  switch (x.t) {
    case 'none': return 'null';
    case 'undefined': return 'undefined';
    case 'text':
      if (!f) return MISSING;
      if (typeof v === 'string') return Q(v);
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (v === null) return 'null';
      return Q(String(v));
    case 'f64': case 'i64': case 'u64': case 'bytes':
      if (!f) return MISSING;
      if (v === null) return NULLV;
      return v;
    case 'bigint':
      if (!f) return 'undefinedn';
      return String(v) + 'n';
    case 'bool':
      if (!f) return 'undefined';
      if (v === true) return 'true';
      if (v === false) return 'false';
      if (v === null) return 'null';
      return v;
    case 'throw': {
      const m = has(x, 'msg') ? x.msg : null;
      if (typeof m === 'string') return 'throw(' + Q(m) + ')';
      if (typeof m === 'boolean') return 'throw(' + (m ? 'true' : 'false') + ')';
      return 'throw("")';
    }
    case 'list': case 'tuple': {
      if (!Array.isArray(v)) throw new Error('v not a list');
      return '[' + v.map((e) => {
        const d = disp(e);
        return typeof d === 'symbol' ? '' : d;
      }).join(',') + ']';
    }
    case 'record': case 'map': {
      if (!Array.isArray(v)) throw new Error('v not a list');
      const rec = x.t === 'record';
      const item = (d) => (d === MISSING ? 'undefined' : d === NULLV ? 'null' : d);
      const parts = v.map((e) => {
        let a, b;
        if (typeof e === 'string') {
          const cs = [...e];
          if (cs.length < 2) throw new Error('short entry');
          a = cs[0]; b = cs[1];
        } else if (Array.isArray(e)) {
          if (e.length < 2) throw new Error('short entry');
          a = e[0]; b = e[1];
        } else throw new Error('bad entry');
        if (rec) return fieldName(a) + ':' + item(disp(b));
        return item(disp(a)) + ':' + item(disp(b));
      });
      return rec ? '{' + parts.join(', ') + '}' : '{' + parts.join(',') + '}';
    }
    default: return '?';
  }
}

export default function display_value(tv) {
  const d = disp(tv);
  return typeof d === 'symbol' ? null : d;
}
