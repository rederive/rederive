type Rec = Record<string, unknown>;

function isObj(x: unknown): x is object {
  return typeof x === 'object' && x !== null;
}

function thrown(x: unknown): boolean {
  return isObj(x) && !Array.isArray(x) && Object.hasOwn(x, '__throw');
}

function mk(src: object, f: (x: unknown) => unknown): Rec {
  const r: Rec = {};
  const s = src as Rec;
  for (const k of Object.keys(src)) {
    const val = s[k];
    if (typeof val === 'function') continue;
    Object.defineProperty(r, k, { value: f(val), enumerable: true, writable: true, configurable: true });
  }
  return r;
}

function isIndexKey(k: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(k) && Number(k) <= 4294967294;
}

function canon(v: unknown): unknown {
  if (v === undefined) return { __t: 'undef' };
  if (typeof v === 'bigint') return { __t: 'bigint', v: v.toString() };
  if (Object.is(v, -0)) return { __t: 'num', v: '-0' };
  if (typeof v === 'number' && !Number.isFinite(v)) return { __t: 'num', v: String(v) };
  if (v instanceof RegExp) return { __t: 'regex', source: v.source, flags: v.flags };
  if (v instanceof Number) return { __t: 'boxed', k: 'Number', v: canon(v.valueOf()) };
  if (v instanceof String) return { __t: 'boxed', k: 'String', v: canon(v.valueOf()) };
  if (v instanceof Boolean) return { __t: 'boxed', k: 'Boolean', v: canon(v.valueOf()) };
  if (v instanceof Set) return { __t: 'set', values: Array.from(v as Set<unknown>).map((x) => canon(x)) };
  if (v instanceof Map) {
    const entries = Array.from(v as Map<unknown, unknown>).map((p) => [canon(p[0]), canon(p[1])]);
    return { __t: 'map', entries };
  }
  if (v instanceof Uint8Array) return { __t: 'u8', bytes: Array.from(v), buf: Buffer.isBuffer(v) };
  if (Array.isArray(v)) {
    const a: readonly unknown[] = v;
    const keys = Object.keys(a).filter(isIndexKey);
    if (keys.length < a.length) {
      const entries = keys.map((k) => [Number(k), canon(a[Number(k)])]);
      return { __t: 'sparse', length: a.length, entries };
    }
    return a.map((x) => canon(x));
  }
  if (isObj(v)) {
    const m = mk(v, canon);
    if (Object.hasOwn(v, '__t') || Object.hasOwn(v, '__throw') || Object.hasOwn(v, '__threw')) {
      return { __t: 'obj', v: m };
    }
    return m;
  }
  return v;
}

function pair(el: unknown): [unknown, unknown] {
  if (Array.isArray(el)) {
    const a: readonly unknown[] = el;
    return [a[0], a[1]];
  }
  if (typeof el === 'string') {
    const c = Array.from(el);
    return [c[0], c[1]];
  }
  throw new TypeError('not a pair');
}

function toByte(x: unknown): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  const m = Math.trunc(n) % 256;
  return (m + 256) % 256;
}

function entriesList(e: unknown): readonly unknown[] {
  if (!e) return [];
  if (Array.isArray(e)) {
    const a: readonly unknown[] = e;
    return a;
  }
  if (typeof e === 'string') return Array.from(e);
  throw new TypeError('entries not a list');
}

function listOrEmpty(e: unknown): readonly unknown[] {
  if (!e) return [];
  if (Array.isArray(e)) {
    const a: readonly unknown[] = e;
    return a;
  }
  throw new TypeError('not a list');
}

function revive(e: unknown): unknown {
  if (Array.isArray(e)) {
    const a: readonly unknown[] = e;
    const out: unknown[] = new Array(a.length);
    for (const k of Object.keys(a)) {
      if (isIndexKey(k)) out[Number(k)] = revive(a[Number(k)]);
    }
    return out;
  }
  if (!isObj(e)) return e;
  const t = e as Rec;
  const tag = t['__t'];
  switch (tag) {
    case 'undef':
      return undefined;
    case 'regex':
      return new RegExp(t['source'] as string, t['flags'] as string);
    case 'bigint': {
      const v = t['v'];
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') {
        return BigInt(v);
      }
      if (Array.isArray(v)) return BigInt(String(v));
      throw new TypeError('cannot convert to BigInt');
    }
    case 'num': {
      const v = t['v'];
      if (v === 'NaN') return NaN;
      if (v === 'Infinity') return Infinity;
      if (v === '-Infinity') return -Infinity;
      if (v === '-0') return -0;
      throw new Error('legacy num tag');
    }
    case 'boxed': {
      const x = revive(t['v']);
      const k = t['k'];
      if (k === 'Number') return new Number(Number(x));
      if (k === 'String') return new String(String(x));
      return new Boolean(x);
    }
    case 'set': {
      const arr = listOrEmpty(t['values']);
      return new Set<unknown>(Array.from(arr, (x) => revive(x)));
    }
    case 'map': {
      const arr = listOrEmpty(t['entries']);
      const m = new Map<unknown, unknown>();
      for (const el of arr) {
        const p = pair(el);
        m.set(revive(p[0]), revive(p[1]));
      }
      return m;
    }
    case 'u8': {
      const b = t['bytes'];
      const buf = !!t['buf'];
      let bytes: number[];
      if (Array.isArray(b)) {
        const a: readonly unknown[] = b;
        bytes = Array.from(a, (x) => toByte(x));
      } else if (typeof b === 'string') {
        if (buf) return Buffer.from(b, 'utf8');
        bytes = Array.from(b).map((c) => toByte(c));
      } else if (b === undefined || b === null) {
        throw new TypeError('bytes absent');
      } else {
        if (buf) throw new TypeError('bad buffer source');
        bytes = [];
      }
      return buf ? Buffer.from(bytes) : new Uint8Array(bytes);
    }
    case 'sparse': {
      const len = t['length'];
      let list: unknown[];
      if (typeof len === 'number') {
        if (!Number.isInteger(len) || len < 0 || len > 4294967295) throw new RangeError('Invalid array length');
        list = new Array(len);
      } else {
        list = [len];
      }
      for (const el of entriesList(t['entries'])) {
        const p = pair(el);
        const key = String(p[0]);
        const x = revive(p[1]);
        if (isIndexKey(key)) list[Number(key)] = x;
      }
      return list;
    }
    case 'obj': {
      const v = t['v'];
      if (!isObj(v) || Array.isArray(v)) throw new Error('legacy obj tag');
      return mk(v, revive);
    }
    default:
      return mk(e, revive);
  }
}

export default function legacy_grade(
  gots: readonly unknown[],
  vectors: readonly { readonly name: string; readonly expected?: unknown }[],
): { pass: number; total: number; full: boolean; miss: string[] } {
  if (vectors === null || vectors === undefined) throw new TypeError('vectors');
  const total = vectors.length;
  let pass = 0;
  const miss: string[] = [];
  for (let i = 0; i < total; i++) {
    const vec = vectors[i];
    if (vec === null || vec === undefined) throw new TypeError('vector');
    const got = gots[i];
    const exp = vec.expected;
    let ok: boolean;
    if (thrown(got) && thrown(exp)) {
      ok = true;
    } else {
      ok = JSON.stringify(canon(got)) === JSON.stringify(canon(revive(exp)));
    }
    if (ok) pass++;
    else if (miss.length < 8) miss.push(vec.name);
  }
  return { pass, total, full: pass === total, miss };
}
