const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export default function reshape(v, t) {
  if (v === null || v === undefined) return null;
  if (t === null || t === undefined) throw new Error('reshape: missing type');
  if (!isMap(t)) return v;
  const k = t.k;
  if (k === 'union') {
    const alts = t.alts;
    if (!Array.isArray(alts)) throw new Error('reshape: alts');
    if (alts.some((a) => a === null || a === undefined)) throw new Error('reshape: null alt');
    const isNone = (a) => isMap(a) && a.k === 'none';
    if (alts.length === 2) {
      const n0 = isNone(alts[0]);
      const n1 = isNone(alts[1]);
      if (n0 !== n1) return reshape(v, n0 ? alts[1] : alts[0]);
    }
    return v;
  }
  if (k === 'record') {
    if (!Array.isArray(v)) return v;
    const fields = t.fields;
    if (fields === null || fields === undefined) throw new Error('reshape: fields');
    if (!Array.isArray(fields)) return v;
    if (fields.length !== v.length) return v;
    const entries = fields.map((e, i) => {
      if (!Array.isArray(e)) throw new Error('reshape: field entry');
      return [e[0], reshape(v[i], e[1])];
    });
    return Object.fromEntries(entries);
  }
  if (k === 'tuple') {
    if (!Array.isArray(v)) return v;
    if (v.length === 0) return [];
    const items = t.items;
    if (items === null || items === undefined) throw new Error('reshape: items');
    if (!Array.isArray(items)) return v.slice();
    return v.map((x, i) => (i < items.length && isMap(items[i]) ? reshape(x, items[i]) : x));
  }
  if (k === 'list') {
    if (!Array.isArray(v)) return v;
    return v.map((x) => reshape(x, t.item));
  }
  if (k === 'map') {
    if (!isMap(v)) return v;
    return Object.fromEntries(Object.keys(v).map((key) => [key, reshape(v[key], t.val)]));
  }
  return v;
}
