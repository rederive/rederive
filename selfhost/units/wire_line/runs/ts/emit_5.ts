type TypeNode = { k?: string; item?: TypeNode; items?: TypeNode[]; key?: TypeNode; val?: TypeNode; fields?: [string, TypeNode][]; alts?: TypeNode[] };
type Narrowed = { __narrowed: string };
type Wire = string | Narrowed;

const ABSENT_REASON = 'the absent value has no serde_json form';
const HOLE_TEXT = 'an array hole has no serde_json form';
const NARROWED_JSON = 'json holds no NaN/Inf/-0 in serde_json::Value';

function nar(reason: string): Narrowed {
  return { __narrowed: reason };
}

function isPlainMap(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function hasHole(v: unknown[]): boolean {
  for (let i = 0; i < v.length; i++) if (!(i in v)) return true;
  return false;
}

function optionOf(t: TypeNode): TypeNode | null {
  if (t.k !== 'union') return null;
  const nn = (t.alts as TypeNode[]).filter((a) => a.k !== 'none');
  if ((t.alts as TypeNode[]).length === 2 && nn.length === 1) return nn[0] ?? null;
  return null;
}

function carry(v: unknown): string | null {
  if (v === null || typeof v === 'boolean') return null;
  if (v === undefined) return ABSENT_REASON;
  if (typeof v === 'number') {
    if (Number.isNaN(v) || v === Infinity || v === -Infinity || Object.is(v, -0)) return NARROWED_JSON;
    if (Number.isInteger(v) && Math.abs(v) > 9007199254740992) {
      return 'a whole number past 2^53 reaches serde_json as a different integer';
    }
    return null;
  }
  if (typeof v === 'bigint') {
    if (v < -(2n ** 63n) || v > 2n ** 64n - 1n) return 'an integer past i64/u64 has no serde_json form';
    return null;
  }
  if (typeof v === 'string') {
    return v.isWellFormed() ? null : 'a lone surrogate has no UTF-8 form';
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) return HOLE_TEXT;
      const r = carry(v[i]);
      if (r !== null) return r;
    }
    return null;
  }
  if (typeof v === 'object') {
    if (isPlainMap(v)) {
      for (const key of Object.keys(v)) {
        if (!key.isWellFormed()) return 'a lone surrogate has no UTF-8 form';
        const r = carry(v[key]);
        if (r !== null) return r;
      }
      return null;
    }
    return 'a ' + Object.prototype.toString.call(v).slice(8, -1) + ' has no serde_json form';
  }
  return null;
}

function plain(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map((e) => plain(e)).join(',') + ']';
  if (isPlainMap(v)) {
    return '{' + Object.keys(v).map((k) => JSON.stringify(k) + ':' + plain(v[k])).join(',') + '}';
  }
  return 'null';
}

function f64bits(v: number): string {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, v);
  let bits = dv.getBigUint64(0);
  if (Number.isNaN(v)) bits = 0x7ff8000000000000n;
  return JSON.stringify(bits.toString(16).padStart(16, '0'));
}

function pick(ws: Wire[]): Wire {
  for (const w of ws) if (typeof w !== 'string') return w;
  return '[' + ws.join(',') + ']';
}

function wire(v: unknown, t0: TypeNode | null | undefined): Wire {
  const t = t0 as TypeNode;
  if (v === undefined && !(t.k === 'none' || optionOf(t) !== null)) return nar(ABSENT_REASON);
  if (v === null || v === undefined) return 'null';
  const k = t.k;
  if (k === 'union') {
    const opt = optionOf(t);
    if (opt !== null) return wire(v, opt);
    const r = carry(v);
    return r === null ? plain(v) : nar(r);
  }
  switch (k) {
    case 'f64':
      return typeof v === 'number' ? f64bits(v) : nar('not an f64 value');
    case 'text':
      if (typeof v !== 'string') return nar('not a text value');
      if (!v.isWellFormed()) return nar('a lone surrogate has no UTF-8 form');
      return JSON.stringify(v);
    case 'bool':
      if (v === true) return 'true';
      if (v === false) return 'false';
      return nar('not a bool value');
    case 'i64':
    case 'u64': {
      let b: bigint | null = null;
      if (typeof v === 'bigint') b = v;
      else if (typeof v === 'number' && Number.isSafeInteger(v)) b = BigInt(v);
      if (b !== null) {
        const lo = k === 'i64' ? -(2n ** 63n) : 0n;
        const hi = k === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
        if (b >= lo && b <= hi) return b.toString();
      }
      return nar('not a ' + k + ' value');
    }
    case 'list': {
      if (!Array.isArray(v)) return nar('not a list value');
      if (hasHole(v)) return nar(HOLE_TEXT);
      const ws: Wire[] = [];
      for (let i = 0; i < v.length; i++) ws.push(wire(v[i], t.item));
      return pick(ws);
    }
    case 'tuple': {
      if (Array.isArray(v) && hasHole(v)) return nar(HOLE_TEXT);
      const n = (t.items as TypeNode[]).length;
      if (!Array.isArray(v) || v.length !== n) return nar('not a ' + (t.items as TypeNode[]).length + '-tuple');
      const items = t.items as TypeNode[];
      const ws: Wire[] = [];
      for (let i = 0; i < items.length; i++) ws.push(wire(v[i], items[i]));
      return pick(ws);
    }
    case 'record': {
      if (!isPlainMap(v)) return nar('not a record value');
      const obj = v;
      const names: string[] = [];
      const ws = (t.fields as [string, TypeNode][]).map(([name, ft]) => {
        names.push(name);
        return wire(Object.hasOwn(obj, name) ? obj[name] : undefined, ft);
      });
      for (const w of ws) if (typeof w !== 'string') return w;
      return '{' + ws.map((w, i) => JSON.stringify(names[i]) + ':' + String(w)).join(',') + '}';
    }
    case 'json':
    case 'map': {
      const r = carry(v);
      return r === null ? plain(v) : nar(r);
    }
    default:
      return nar('the rust harness has no route for ' + String(k));
  }
}

export default function wireLine(args: unknown, sig: { args: { name: string; type?: TypeNode | null; rest?: boolean }[] }): string | { __narrowed: string } {
  const params = sig.args;
  const nFixed = params.filter((a) => !a.rest).length;
  const rest = params.find((a) => a.rest)?.type ?? null;
  if (!Array.isArray(args)) return nar('the args are not a list');
  if (rest === null && args.length !== nFixed) return nar(args.length + ' args for a ' + nFixed + '-parameter SIG');
  if (hasHole(args)) return nar(HOLE_TEXT);
  const ws: string[] = [];
  for (let j = 0; j < args.length; j++) {
    let w: Wire;
    try {
      const entry = params[j];
      const type = j < nFixed ? (entry as { type?: TypeNode | null }).type : rest;
      w = wire(args[j], type);
    } catch (e) {
      return nar('wire: ' + (e instanceof Error ? e.message : String(e)));
    }
    if (typeof w !== 'string') return w;
    ws.push(w);
  }
  return '[' + ws.join(',') + ']';
}
