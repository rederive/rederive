type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type Res = { readonly k: 's'; readonly s: string } | { readonly k: 'missing' } | { readonly k: 'null' };

const PLAIN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function has(o: { readonly [key: string]: Json }, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

function str(s: string): Res {
  return { k: 's', s };
}

function fieldName(n: Json): string {
  if (typeof n === 'string') return PLAIN.test(n) ? n : JSON.stringify(n);
  throw new Error('field name not text');
}

function seq(v: Json | undefined): readonly Json[] {
  if (Array.isArray(v)) return v as readonly Json[];
  throw new Error('v must be a list');
}

function entry(e: Json): readonly [Json, Json] {
  let items: readonly Json[];
  if (Array.isArray(e)) items = e as readonly Json[];
  else if (typeof e === 'string') items = [...e];
  else throw new Error('bad entry');
  if (items.length < 2) throw new Error('short entry');
  return [items[0] as Json, items[1] as Json];
}

function inner(r: Res): string {
  if (r.k === 's') return r.s;
  return r.k === 'missing' ? 'undefined' : 'null';
}

function disp(tv: Json): Res {
  if (tv === null) throw new Error('none at node position');
  if (typeof tv !== 'object' || Array.isArray(tv)) return str('?');
  const x = tv as { readonly [key: string]: Json };
  const t = has(x, 't') ? x['t'] : undefined;
  if (typeof t !== 'string') return str('?');
  const hv = has(x, 'v');
  const v: Json = hv ? (x['v'] as Json) : null;
  switch (t) {
    case 'none':
      return str('null');
    case 'undefined':
      return str('undefined');
    case 'text':
      if (!hv) return { k: 'missing' };
      if (typeof v === 'string') return str(JSON.stringify(v));
      if (typeof v === 'boolean') return str(v ? 'true' : 'false');
      return str('null');
    case 'f64':
    case 'i64':
    case 'u64':
    case 'bytes':
      if (!hv) return { k: 'missing' };
      if (v === null) return { k: 'null' };
      return str(String(v));
    case 'bigint':
      if (!hv) return str('undefinedn');
      return str(String(v) + 'n');
    case 'bool':
      if (!hv) return str('undefined');
      if (v === null) return str('null');
      return str(String(v));
    case 'throw': {
      const m: Json = has(x, 'msg') ? (x['msg'] as Json) : null;
      if (typeof m === 'string') return str('throw(' + JSON.stringify(m) + ')');
      if (typeof m === 'boolean') return str('throw(' + (m ? 'true' : 'false') + ')');
      return str('throw("")');
    }
    case 'list':
    case 'tuple': {
      const items = seq(hv ? v : undefined);
      const parts: string[] = [];
      for (const e of items) {
        const r = disp(e);
        parts.push(r.k === 's' ? r.s : '');
      }
      return str('[' + parts.join(',') + ']');
    }
    case 'record': {
      const items = seq(hv ? v : undefined);
      const parts: string[] = [];
      for (const e of items) {
        const [a, b] = entry(e);
        const name = fieldName(a);
        parts.push(name + ':' + inner(disp(b)));
      }
      return str('{' + parts.join(', ') + '}');
    }
    case 'map': {
      const items = seq(hv ? v : undefined);
      const parts: string[] = [];
      for (const e of items) {
        const [a, b] = entry(e);
        const ka = inner(disp(a));
        const kb = inner(disp(b));
        parts.push(ka + ':' + kb);
      }
      return str('{' + parts.join(',') + '}');
    }
    default:
      return str('?');
  }
}

export default function display_value(tv: Json): string | null {
  const r = disp(tv);
  return r.k === 's' ? r.s : null;
}
