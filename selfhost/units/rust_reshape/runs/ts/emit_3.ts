type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

type JMap = { readonly [key: string]: Json };

function isMap(x: Json | undefined): x is JMap {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isList(x: Json | undefined): x is readonly Json[] {
  return Array.isArray(x);
}

function rs(v: Json, t: Json | undefined): Json {
  if (v === null) return null;
  if (t === null || t === undefined) throw new Error("reshape: missing type tree");
  if (!isMap(t)) return v;
  const k = t["k"];
  if (k === "union") {
    const alts = t["alts"];
    if (!isList(alts)) throw new Error("reshape: union alts not a list");
    for (const a of alts) {
      if (a === null) throw new Error("reshape: none in alts");
    }
    if (alts.length !== 2) return v;
    const n0 = isMap(alts[0]) && (alts[0] as JMap)["k"] === "none";
    const n1 = isMap(alts[1]) && (alts[1] as JMap)["k"] === "none";
    if (n0 === n1) return v;
    return rs(v, n0 ? alts[1] : alts[0]);
  }
  if (k === "record") {
    if (!isList(v)) return v;
    const fields = t["fields"];
    if (fields === null || fields === undefined) throw new Error("reshape: record fields missing");
    if (typeof fields === "number" || typeof fields === "boolean") return v;
    if (!isList(fields)) return v;
    if (fields.length !== v.length) return v;
    const entries: [string, Json][] = [];
    for (let i = 0; i < fields.length; i++) {
      const e = fields[i];
      if (!isList(e)) throw new Error("reshape: field entry not a list");
      const name = e[0];
      entries.push([String(name), rs(v[i], e[1])]);
    }
    return Object.fromEntries(entries);
  }
  if (k === "tuple") {
    if (!isList(v)) return v;
    if (v.length === 0) return [];
    const items = t["items"];
    if (items === null || items === undefined) throw new Error("reshape: tuple items missing");
    if (!isList(items)) return v.slice();
    const out: Json[] = [];
    for (let i = 0; i < v.length; i++) {
      const it = i < items.length ? items[i] : undefined;
      out.push(isMap(it) ? rs(v[i], it) : v[i]);
    }
    return out;
  }
  if (k === "list") {
    if (!isList(v)) return v;
    const item = t["item"];
    return v.map((x) => rs(x, item));
  }
  if (k === "map") {
    if (!isMap(v)) return v;
    const val = t["val"];
    return Object.fromEntries(Object.keys(v).map((key): [string, Json] => [key, rs(v[key], val)]));
  }
  return v;
}

export default function reshape(v: Json, t: Json): Json {
  return rs(v, t);
}
