type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

type Res = { readonly k: 's'; readonly s: string } | { readonly k: 'missing' } | { readonly k: 'null' };

const PLAIN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function str(s: string): Res {
  return { k: 's', s };
}

function isObj(x: Json | undefined): x is { readonly [key: string]: Json } {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function has(o: { readonly [key: string]: Json }, key: string): boolean {
  return Object.hasOwn(o, key);
}

function quote(s: string): string {
  return JSON.stringify(s);
}

function fieldName(n: Json): string {
  if (typeof n === 'string') return PLAIN.test(n) ? n : quote(n);
  return String(n);
}

function entryItems(e: Json): readonly [Json, Json] {
  let items: readonly Json[];
  if (Array.isArray(e)) items = e as readonly Json[];
  else if (typeof e === 'string') items = [...e];
  else throw new Error('bad entry');
  if (items.length < 2) throw new Error('short entry');
  return [items[0] as Json, items[1] as Json];
}

function asList(v: Json | undefined): readonly Json[] {
  if (Array.isArray(v)) return v as readonly Json[];
  throw new Error('v must be a list');
}

function inner(r: Res): string {
  if (r.k === 's') return r.s;
  return r.k === 'missing' ? 'undefined' : 'null';
}

function display(x: Json): Res {
  if (x === null) throw new Error('none node');
  if (!isObj(x) || !has(x, 't') || typeof x['t'] !== 'string') return str('?');
  const t = x['t'];
  const hv = has(x, 'v');
  const v: Json | undefined = hv ? x['v'] : undefined;
  switch (t) {
    case 'none':
      return str('null');
    case 'undefined':
      return str('undefined');
    case 'text':
      if (!hv) return { k: 'missing' };
      if (typeof v === 'string') return str(quote(v));
      if (typeof v === 'boolean') return str(v ? 'true' : 'false');
      if (v === null) return str('null');
      return str('?');
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
      if (v === true) return str('true');
      if (v === false) return str('false');
      return str(String(v));
    case 'throw': {
      const m: Json | undefined = has(x, 'msg') ? x['msg'] : undefined;
      if (typeof m === 'string') return str('throw(' + quote(m) + ')');
      if (typeof m === 'boolean') return str('throw(' + (m ? 'true' : 'false') + ')');
      return str('throw("")');
    }
    case 'list':
    case 'tuple': {
      const items = asList(v);
      const parts: string[] = [];
      for (const it of items) {
        const r = display(it);
        parts.push(r.k === 's' ? r.s : '');
      }
      return str('[' + parts.join(',') + ']');
    }
    case 'record': {
      const items = asList(v);
      const parts: string[] = [];
      for (const e of items) {
        const [a, b] = entryItems(e);
        parts.push(fieldName(a) + ':' + inner(display(b)));
      }
      return str('{' + parts.join(', ') + '}');
    }
    case 'map': {
      const items = asList(v);
      const parts: string[] = [];
      for (const e of items) {
        const [a, b] = entryItems(e);
        const ka = inner(display(a));
        parts.push(ka + ':' + inner(display(b)));
      }
      return str('{' + parts.join(',') + '}');
    }
    default:
      return str('?');
  }
}

export default function display_value(tv: Json): string | null {
  const r = display(tv);
  return r.k === 's' ? r.s : null;
}
