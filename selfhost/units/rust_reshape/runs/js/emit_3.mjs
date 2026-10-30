const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isNone = (x) => x === null || x === undefined;

function put(o, k, val) {
  Object.defineProperty(o, k, { value: val, enumerable: true, writable: true, configurable: true });
}

export default function reshape(v, t) {
  if (isNone(v)) return null;
  if (isNone(t)) throw new Error('reshape: missing type tree');
  if (!isMap(t)) return v;
  switch (t.k) {
    case 'union': {
      const alts = t.alts;
      if (!Array.isArray(alts)) throw new Error('reshape: union alts');
      for (let i = 0; i < alts.length; i++) {
        if (isNone(alts[i])) throw new Error('reshape: none alt');
      }
      const isNoneAlt = (e) => isMap(e) && e.k === 'none';
      if (alts.length === 2) {
        const a = isNoneAlt(alts[0]);
        const b = isNoneAlt(alts[1]);
        if (a !== b) return reshape(v, a ? alts[1] : alts[0]);
      }
      return v;
    }
    case 'record': {
      if (!Array.isArray(v)) return v;
      const fields = t.fields;
      if (isNone(fields)) throw new Error('reshape: record fields');
      if (!Array.isArray(fields)) return v;
      if (fields.length !== v.length) return v;
      const out = {};
      for (let i = 0; i < fields.length; i++) {
        const e = fields[i];
        if (!Array.isArray(e)) throw new Error('reshape: field entry');
        put(out, String(e[0]), reshape(v[i], e[1]));
      }
      return out;
    }
    case 'tuple': {
      if (!Array.isArray(v)) return v;
      if (v.length === 0) return [];
      const items = t.items;
      if (isNone(items)) throw new Error('reshape: tuple items');
      if (!Array.isArray(items)) return v.slice();
      return v.map((x, i) => (i < items.length && isMap(items[i]) ? reshape(x, items[i]) : x));
    }
    case 'list': {
      if (!Array.isArray(v)) return v;
      return v.map((x) => reshape(x, t.item));
    }
    case 'map': {
      if (!isMap(v)) return v;
      const out = {};
      for (const k of Object.keys(v)) put(out, k, reshape(v[k], t.val));
      return out;
    }
    default:
      return v;
  }
}
