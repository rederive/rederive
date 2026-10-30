const ABSENT_TEXT = 'undefined';
const ABSENT_REASON = 'the absent value has no serde_json form';
const HOLE_TEXT = 'an array hole has no serde_json form';
const NARROWED_JSON = 'json holds no NaN/Inf/-0 in serde_json::Value';
const narrowed = (r) => ({ __narrowed: r });
const isN = (x) => typeof x === 'object' && x !== null && !Array.isArray(x) && '__narrowed' in x;
const lone = (s) => !s.isWellFormed();
const isPlain = (v) => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const hasHole = (v) => {
  for (let i = 0; i < v.length; i++) if (!(i in v)) return true;
  return false;
};
const optionOf = (t) => {
  if (t.k !== 'union') return null;
  const non = t.alts.filter((a) => a.k !== 'none');
  return t.alts.length === 2 && non.length === 1 ? non[0] : null;
};
const dv = new DataView(new ArrayBuffer(8));
const f64bits = (v) => {
  let b;
  if (Number.isNaN(v)) b = 0x7ff8000000000000n;
  else {
    dv.setFloat64(0, v);
    b = dv.getBigUint64(0);
  }
  return JSON.stringify(b.toString(16).padStart(16, '0'));
};
const carry = (v) => {
  if (v === null || typeof v === 'boolean') return null;
  if (v === undefined) return ABSENT_REASON;
  if (typeof v === 'number') {
    if (Number.isNaN(v) || v === Infinity || v === -Infinity || Object.is(v, -0)) return NARROWED_JSON;
    if (Number.isInteger(v) && Math.abs(v) > 2 ** 53) return 'a whole number past 2^53 reaches serde_json as a different integer';
    return null;
  }
  if (typeof v === 'bigint') {
    if (v < -(2n ** 63n) || v > 2n ** 64n - 1n) return 'an integer past i64/u64 has no serde_json form';
    return null;
  }
  if (typeof v === 'string') return lone(v) ? 'a lone surrogate has no UTF-8 form' : null;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) return HOLE_TEXT;
      const r = carry(v[i]);
      if (r) return r;
    }
    return null;
  }
  if (isPlain(v)) {
    for (const k of Object.keys(v)) {
      if (lone(k)) return 'a lone surrogate has no UTF-8 form';
      const r = carry(v[k]);
      if (r) return r;
    }
    return null;
  }
  return 'a ' + Object.prototype.toString.call(v).slice(8, -1) + ' has no serde_json form';
};
const plain = (v) => {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return '[' + v.map(plain).join(',') + ']';
  if (isPlain(v)) return '{' + Object.keys(v).map((k) => JSON.stringify(k) + ':' + plain(v[k])).join(',') + '}';
  return JSON.stringify(v);
};
const jsonRule = (v) => {
  const r = carry(v);
  return r ? narrowed(r) : plain(v);
};
const firstN = (ws) => ws.find(isN);
const wire = (v, t) => {
  if (v === undefined) {
    if (t.k === 'none' || optionOf(t)) return 'null';
    return narrowed(ABSENT_REASON);
  }
  if (v === null) return 'null';
  const k = t.k;
  switch (k) {
    case 'text':
      if (typeof v !== 'string') return narrowed('not a text value');
      return lone(v) ? narrowed('a lone surrogate has no UTF-8 form') : JSON.stringify(v);
    case 'bool':
      return typeof v === 'boolean' ? String(v) : narrowed('not a bool value');
    case 'f64':
      return typeof v === 'number' ? f64bits(v) : narrowed('not an f64 value');
    case 'i64':
    case 'u64': {
      if ((typeof v === 'number' && Number.isSafeInteger(v)) || typeof v === 'bigint') {
        const b = BigInt(v);
        const ok = k === 'i64' ? b >= -(2n ** 63n) && b <= 2n ** 63n - 1n : b >= 0n && b <= 2n ** 64n - 1n;
        if (ok) return b.toString();
      }
      return narrowed('not a ' + k + ' value');
    }
    case 'union': {
      const o = optionOf(t);
      return o ? wire(v, o) : jsonRule(v);
    }
    case 'json':
    case 'map':
      return jsonRule(v);
    case 'list': {
      if (!Array.isArray(v)) return narrowed('not a list value');
      if (hasHole(v)) return narrowed(HOLE_TEXT);
      const ws = v.map((e) => wire(e, t.item));
      return firstN(ws) ?? '[' + ws.join(',') + ']';
    }
    case 'tuple': {
      if (Array.isArray(v) && hasHole(v)) return narrowed(HOLE_TEXT);
      if (!Array.isArray(v) || v.length !== t.items.length) return narrowed('not a ' + t.items.length + '-tuple');
      const ws = t.items.map((it, i) => wire(v[i], it));
      return firstN(ws) ?? '[' + ws.join(',') + ']';
    }
    case 'record': {
      if (!isPlain(v)) return narrowed('not a record value');
      const ws = t.fields.map(([n, ft]) => wire(Object.hasOwn(v, n) ? v[n] : undefined, ft));
      const bad = firstN(ws);
      if (bad) return bad;
      return '{' + t.fields.map(([n], i) => JSON.stringify(n) + ':' + ws[i]).join(',') + '}';
    }
    default:
      return narrowed('the rust harness has no route for ' + (k === undefined ? ABSENT_TEXT : k));
  }
};
export default function wireLine(args, sig) {
  const nFixed = sig.args.filter((a) => !a.rest).length;
  const REST = sig.args.find((a) => a.rest)?.type ?? null;
  if (!Array.isArray(args)) return narrowed('the args are not a list');
  if (!REST && args.length !== nFixed) return narrowed(args.length + ' args for a ' + nFixed + '-parameter SIG');
  if (hasHole(args)) return narrowed(HOLE_TEXT);
  const out = [];
  for (let j = 0; j < args.length; j++) {
    const t = j < nFixed ? sig.args[j].type : REST;
    let w;
    try {
      w = wire(args[j], t);
    } catch (e) {
      w = narrowed('wire: ' + e.message);
    }
    if (isN(w)) return w;
    out.push(w);
  }
  return '[' + out.join(',') + ']';
}
