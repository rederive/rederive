const ABSENT_TEXT = 'undefined';
const ABSENT_REASON = 'the absent value has no serde_json form';
const HOLE_TEXT = 'an array hole has no serde_json form';
const NARROWED_JSON = 'json holds no NaN/Inf/-0 in serde_json::Value';
const LONE = 'a lone surrogate has no UTF-8 form';

const nar = (r) => ({ __narrowed: r });
const isN = (w) => typeof w !== 'string';
const hasHole = (v) => { for (let i = 0; i < v.length; i++) if (!(i in v)) return true; return false; };
const isPlain = (v) => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

function optionOf(t) {
  if (t.k !== 'union') return null;
  const nn = t.alts.filter((a) => a.k !== 'none');
  return t.alts.length === 2 && nn.length === 1 ? nn[0] : null;
}

function carry(v) {
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
}

function plain(v) {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return '[' + v.map(plain).join(',') + ']';
  if (isPlain(v)) return '{' + Object.keys(v).map((k) => JSON.stringify(k) + ':' + plain(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

function bits(v) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, v);
  let b = dv.getBigUint64(0);
  if (Number.isNaN(v)) b = 0x7ff8000000000000n;
  return JSON.stringify(b.toString(16).padStart(16, '0'));
}

function joinWires(ws) {
  const bad = ws.find(isN);
  return bad !== undefined ? bad : '[' + ws.join(',') + ']';
}

function wire(v, t) {
  if (v === undefined && !(t.k === 'none' || optionOf(t))) return nar(ABSENT_REASON);
  if (v === undefined || v === null) return 'null';
  const k = t.k;
  switch (k) {
    case 'union': {
      const o = optionOf(t);
      if (o) return wire(v, o);
      const r = carry(v);
      return r !== null ? nar(r) : plain(v);
    }
    case 'f64':
      return typeof v === 'number' ? bits(v) : nar('not an f64 value');
    case 'text':
      if (typeof v !== 'string') return nar('not a text value');
      return v.isWellFormed() ? JSON.stringify(v) : nar(LONE);
    case 'bool':
      return typeof v === 'boolean' ? String(v) : nar('not a bool value');
    case 'i64':
    case 'u64': {
      const bad = nar('not a ' + k + ' value');
      if (!((typeof v === 'number' && Number.isSafeInteger(v)) || typeof v === 'bigint')) return bad;
      const b = BigInt(v);
      const lo = k === 'i64' ? -(2n ** 63n) : 0n;
      const hi = k === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      return b >= lo && b <= hi ? b.toString() : bad;
    }
    case 'list': {
      if (!Array.isArray(v)) return nar('not a list value');
      if (hasHole(v)) return nar(HOLE_TEXT);
      return joinWires(v.map((e) => wire(e, t.item)));
    }
    case 'tuple': {
      if (Array.isArray(v) && hasHole(v)) return nar(HOLE_TEXT);
      if (!Array.isArray(v) || v.length !== t.items.length) return nar('not a ' + t.items.length + '-tuple');
      return joinWires(v.map((e, i) => wire(e, t.items[i])));
    }
    case 'record': {
      if (!isPlain(v)) return nar('not a record value');
      const ws = t.fields.map(([name, ty]) => wire(Object.hasOwn(v, name) ? v[name] : undefined, ty));
      const bad = ws.find(isN);
      if (bad !== undefined) return bad;
      return '{' + t.fields.map(([name], i) => JSON.stringify(name) + ':' + ws[i]).join(',') + '}';
    }
    case 'json':
    case 'map': {
      const r = carry(v);
      return r !== null ? nar(r) : plain(v);
    }
    default:
      return nar('the rust harness has no route for ' + (k === undefined ? ABSENT_TEXT : k));
  }
}

export default function wireLine(args, sig) {
  const nFixed = sig.args.filter((a) => !a.rest).length;
  const rest = sig.args.find((a) => a.rest)?.type ?? null;
  if (!Array.isArray(args)) return nar('the args are not a list');
  if (rest === null && args.length !== nFixed) return nar(args.length + ' args for a ' + nFixed + '-parameter SIG');
  if (hasHole(args)) return nar(HOLE_TEXT);
  const out = [];
  for (let j = 0; j < args.length; j++) {
    const t = j < nFixed ? sig.args[j].type : rest;
    let w;
    try {
      w = wire(args[j], t);
    } catch (e) {
      w = nar('wire: ' + e.message);
    }
    if (isN(w)) return w;
    out.push(w);
  }
  return '[' + out.join(',') + ']';
}
