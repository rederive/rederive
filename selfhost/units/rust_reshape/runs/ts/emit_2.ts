type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

type JMap = { readonly [key: string]: Json };

function isMap(x: Json | undefined): x is JMap {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function get(m: JMap, key: string): Json | undefined {
  return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : undefined;
}

function isNoneAlt(x: Json): boolean {
  return isMap(x) && get(x, "k") === "none";
}

function rs(v: Json, t: Json | undefined): Json {
  if (v === null) return null;
  if (t === null || t === undefined) throw new Error("reshape: missing type");
  if (!isMap(t)) return v;
  const k = get(t, "k");
  if (k === "union") {
    const alts = get(t, "alts");
    if (!Array.isArray(alts)) throw new Error("reshape: alts not a list");
    const list: readonly Json[] = alts;
    for (const a of list) {
      if (a === null) throw new Error("reshape: none alt");
    }
    if (list.length === 2) {
      const n0 = isNoneAlt(list[0]);
      const n1 = isNoneAlt(list[1]);
      if (n0 && !n1) return rs(v, list[1]);
      if (n1 && !n0) return rs(v, list[0]);
    }
    return v;
  }
  if (k === "record") {
    if (!Array.isArray(v)) return v;
    const vl: readonly Json[] = v;
    const fields = get(t, "fields");
    if (fields === null || fields === undefined) throw new Error("reshape: no fields");
    if (typeof fields === "number" || typeof fields === "boolean") return v;
    if (isMap(fields)) return v;
    if (fields.length !== vl.length) return v;
    const entries: [string, Json][] = [];
    for (let i = 0; i < vl.length; i++) {
      const e: Json = typeof fields === "string" ? fields.charAt(i) : fields[i];
      if (!Array.isArray(e)) throw new Error("reshape: bad field entry");
      const el: readonly Json[] = e;
      const name = el[0];
      const ft: Json = el.length > 1 ? el[1] : null;
      entries.push([String(name), rs(vl[i], ft)]);
    }
    return Object.fromEntries(entries);
  }
  if (k === "tuple") {
    if (!Array.isArray(v)) return v;
    const vl: readonly Json[] = v;
    if (vl.length === 0) return [];
    const items = get(t, "items");
    if (items === null || items === undefined) throw new Error("reshape: no items");
    if (!Array.isArray(items)) return vl.slice();
    const il: readonly Json[] = items;
    const out: Json[] = [];
    for (let i = 0; i < vl.length; i++) {
      const it = i < il.length ? il[i] : null;
      out.push(isMap(it) ? rs(vl[i], it) : vl[i]);
    }
    return out;
  }
  if (k === "list") {
    if (!Array.isArray(v)) return v;
    const vl: readonly Json[] = v;
    const item = get(t, "item");
    return vl.map((x) => rs(x, item));
  }
  if (k === "map") {
    if (!isMap(v)) return v;
    const val = get(t, "val");
    const entries: [string, Json][] = [];
    for (const key of Object.keys(v)) {
      entries.push([key, rs(v[key], val)]);
    }
    return Object.fromEntries(entries);
  }
  return v;
}

export default function reshape(v: Json, t: Json): Json {
  return rs(v, t);
}
