type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type JMap = { readonly [key: string]: Json };

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function field(e: JMap, k: string): Json | undefined {
  return hasOwn(e, k) ? e[k] : undefined;
}

function textOf(v: Json | undefined): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    const arr: readonly Json[] = v;
    return arr.map((x) => textOf(x)).join(",");
  }
  if (hasOwn(v, "toString")) throw new Error("toString is not callable");
  return "[object Object]";
}

function prop(t: string): string {
  return t
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function data(t: string): string {
  return t.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function isMap(f: Json | undefined): f is JMap {
  return f !== undefined && f !== null && typeof f === "object" && !Array.isArray(f);
}

export function annotations_text(findings: readonly Json[]): string {
  if (!Array.isArray(findings)) throw new Error("findings is not a list");
  const lines: string[] = [];
  for (const f of findings as readonly (Json | undefined)[]) {
    if (!isMap(f)) continue;
    const lv = field(f, "level");
    const level = lv === "error" || lv === "warning" || lv === "notice" ? lv : "error";
    const file = prop(textOf(field(f, "path")));
    const l = field(f, "line");
    const linePart = typeof l === "number" && Number.isSafeInteger(l) && l > 0 ? ",line=" + String(l) : "";
    const title = prop(textOf(field(f, "title")));
    const msg = data(textOf(field(f, "message")));
    lines.push("::" + level + " file=" + file + linePart + ",title=" + title + "::" + msg);
  }
  return lines.join("\n");
}
