type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

type Disp = { readonly k: 's'; readonly s: string } | { readonly k: 'missing' } | { readonly k: 'null' };

const PLAIN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function str(s: string): Disp {
  return { k: 's', s };
}

function quote(s: string): string {
  return JSON.stringify(s);
}

function fieldName(n: Json): string {
  if (typeof n === 'string' && PLAIN.test(n)) return n;
  return JSON.stringify(n);
}

function inner(d: Disp): string {
  if (d.k === 's') return d.s;
  return d.k === 'missing' ? 'undefined' : 'null';
}

function elem(d: Disp): string {
  return d.k === 's' ? d.s : '';
}

function entryItems(e: Json): readonly [Json, Json] {
  if (Array.isArray(e)) {
    const a: readonly Json[] = e;
    if (a.length < 2) throw new Error('entry too short');
    return [a[0] as Json, a[1] as Json];
  }
  if (typeof e === 'string') {
    const cps = [...e];
    if (cps.length < 2) throw new Error('entry too short');
    return [cps[0] as string, cps[1] as string];
  }
  throw new Error('bad entry');
}

function listOf(v: Json | undefined): readonly Json[] {
  if (Array.isArray(v)) return v as readonly Json[];
  throw new Error('v must be a list');
}

function disp(x: Json): Disp {
  if (x === null) throw new Error('none at node position');
  if (typeof x !== 'object' || Array.isArray(x)) return str('?');
  const o = x as { readonly [key: string]: Json };
  if (!Object.hasOwn(o, 't')) return str('?');
  const t = o['t'];
  if (typeof t !== 'string') return str('?');
  const has = Object.hasOwn(o, 'v');
  const v: Json | undefined = has ? o['v'] : undefined;
  switch (t) {
    case 'none':
      return str('null');
    case 'undefined':
      return str('undefined');
    case 'text':
      if (!has) return { k: 'missing' };
      if (typeof v === 'string') return str(quote(v));
      if (typeof v === 'boolean') return str(v ? 'true' : 'false');
      if (v === null) return str('null');
      return str(String(v));
    case 'f64':
    case 'i64':
    case 'u64':
    case 'bytes':
      if (!has) return { k: 'missing' };
      if (v === null) return { k: 'null' };
      if (typeof v === 'string') return str(v);
      return str(String(v));
    case 'bigint':
      if (!has) return str('undefinedn');
      return str(String(v) + 'n');
    case 'bool':
      if (!has) return str('undefined');
      if (v === true) return str('true');
      if (v === false) return str('false');
      if (v === null) return str('null');
      return str(String(v));
    case 'throw': {
      const m: Json | undefined = Object.hasOwn(o, 'msg') ? o['msg'] : undefined;
      if (typeof m === 'string') return str('throw(' + quote(m) + ')');
      if (typeof m === 'boolean') return str('throw(' + (m ? 'true' : 'false') + ')');
      return str('throw("")');
    }
    case 'list':
    case 'tuple': {
      const a = listOf(v);
      return str('[' + a.map((e) => elem(disp(e))).join(',') + ']');
    }
    case 'record': {
      const a = listOf(v);
      const parts = a.map((e) => {
        const [k, val] = entryItems(e);
        return fieldName(k) + ':' + inner(disp(val));
      });
      return str('{' + parts.join(', ') + '}');
    }
    case 'map': {
      const a = listOf(v);
      const parts = a.map((e) => {
        const [k, val] = entryItems(e);
        const ks = inner(disp(k));
        return ks + ':' + inner(disp(val));
      });
      return str('{' + parts.join(',') + '}');
    }
    default:
      return str('?');
  }
}

export default function display_value(tv: Json): string | null {
  const d = disp(tv);
  return d.k === 's' ? d.s : null;
}
