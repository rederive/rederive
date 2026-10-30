type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function write(x: Json): string {
  if (x === null) return "null";
  if (typeof x === "number") {
    if (Number.isNaN(x)) throw new Error("carried table: NaN has no JSON form");
    if (x === Infinity) throw new Error("carried table: Infinity has no JSON form");
    if (x === -Infinity) throw new Error("carried table: -Infinity has no JSON form");
    if (Object.is(x, -0)) throw new Error("carried table: -0 has no JSON form");
    return JSON.stringify(x);
  }
  if (typeof x === "string" || typeof x === "boolean") return JSON.stringify(x);
  if (Array.isArray(x)) {
    const parts: string[] = [];
    for (let i = 0; i < x.length; i++) parts.push(write(x[i]));
    return "[" + parts.join(",") + "]";
  }
  const keys = Object.keys(x).sort();
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(JSON.stringify(k) + ":" + write(x[k]));
  }
  return "{" + parts.join(",") + "}";
}

export default function carried_canonical(table: { [key: string]: Json }): string {
  return write(table);
}
