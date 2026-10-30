const ABSENT_REASON = 'the absent value has no serde_json form';
const HOLE_TEXT = 'an array hole has no serde_json form';
const NARROWED_JSON = 'json holds no NaN/Inf/-0 in serde_json::Value';
const LONE = 'a lone surrogate has no UTF-8 form';
const nar = (r) => ({ __narrowed: r });
const isNar = (w) => typeof w !== 'string';
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
const bits = (v) => {
  let b;
  if (Number.isNaN(v)) b = 0x7ff8000000000000n;
  else {
    dv.setFloat64(0, v);
    b = dv.getBigUint64(0);
  }
  return JSON.stringify(b.toString(16).padStart(16, '0'));
};
const carry = (v) => {
  if (v === undefined) return ABSENT_REASON;
  if (v === null || typeof v === 'boolean') return null;
  if (typeof v === 'number') {
    if (Number.isNaN(v) || v === Infinity || v === -Infinity || Object.is(v, -0)) return NARROWED_JSON;
    if (Number.isInteger(v) && Math.abs(v) > 2 ** 53) return 'a whole number past 2^53 reaches serde_json as a different integer';
    return null;
  }
  if (typeof v === 'bigint') {
    if (v < -(2n ** 63n) || v > 2n ** 64n - 1n) return 'an integer past i64/u64 has no serde_json form';
    return null;
  }
  if (typeof v === 'string') return v.isWellFormed() ? null : LONE;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) return HOLE_TEXT;
      const r = carry(v[i]);
      if (r !== null) return r;
    }
    return null;
  }
  if (isPlain(v)) {
    for (const k of Object.keys(v)) {
      if (!k.isWellFormed()) return LONE;
      const r = carry(v[k]);
      if (r !== null) return r;
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
const firstOr = (ws, open, close) => {
  const bad = ws.find(isNar);
  return bad !== undefined ? bad : open + ws.join(',') + close;
};
const wire = (v, t) => {
  if (v === undefined && !(t.k === 'none' || optionOf(t))) return nar(ABSENT_REASON);
  if (v === null || v === undefined) return 'null';
  switch (t.k) {
    case 'f64':
      return typeof v === 'number' ? bits(v) : nar('not an f64 value');
    case 'text':
      if (typeof v !== 'string') return nar('not a text value');
      return v.isWellFormed() ? JSON.stringify(v) : nar(LONE);
    case 'bool':
      return typeof v === 'boolean' ? String(v) : nar('not a bool value');
    case 'i64':
    case 'u64': {
      const ok = (typeof v === 'number' && Number.isSafeInteger(v)) || typeof v === 'bigint';
      if (ok) {
        const b = BigInt(v);
        const lo = t.k === 'i64' ? -(2n ** 63n) : 0n;
        const hi = t.k === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
        if (b >= lo && b <= hi) return b.toString();
      }
      return nar('not a ' + t.k + ' value');
    }
    case 'list': {
      if (!Array.isArray(v)) return nar('not a list value');
      if (hasHole(v)) return nar(HOLE_TEXT);
      return firstOr(v.map((e) => wire(e, t.item)), '[', ']');
    }
    case 'tuple': {
      if (Array.isArray(v) && hasHole(v)) return nar(HOLE_TEXT);
      if (!Array.isArray(v) || v.length !== t.items.length) return nar('not a ' + t.items.length + '-tuple');
      return firstOr(v.map((e, i) => wire(e, t.items[i])), '[', ']');
    }
    case 'record': {
      if (!isPlain(v)) return nar('not a record value');
      const ws = t.fields.map(([n, ft]) => wire(Object.hasOwn(v, n) ? v[n] : undefined, ft));
      const bad = ws.find(isNar);
      if (bad !== undefined) return bad;
      return '{' + t.fields.map(([n], i) => JSON.stringify(n) + ':' + ws[i]).join(',') + '}';
    }
    case 'union': {
      const o = optionOf(t);
      if (o) return wire(v, o);
      return jsonWire(v);
    }
    case 'json':
    case 'map':
      return jsonWire(v);
    default:
      return nar('the rust harness has no route for ' + (t.k === undefined ? 'undefined' : t.k));
  }
};
const jsonWire = (v) => {
  const r = carry(v);
  return r !== null ? nar(r) : plain(v);
};
export default function wireLine(args, sig) {
  const nFixed = sig.args.filter((a) => !a.rest).length;
  const REST = sig.args.find((a) => a.rest)?.type ?? null;
  if (!Array.isArray(args)) return nar('the args are not a list');
  if (REST === null && args.length !== nFixed) return nar(args.length + ' args for a ' + nFixed + '-parameter SIG');
  if (hasHole(args)) return nar(HOLE_TEXT);
  const ws = [];
  for (let j = 0; j < args.length; j++) {
    const t = j < nFixed ? sig.args[j].type : REST;
    let w;
    try {
      w = wire(args[j], t);
    } catch (e) {
      w = nar('wire: ' + e.message);
    }
    if (isNar(w)) return w;
    ws.push(w);
  }
  return '[' + ws.join(',') + ']';
}
