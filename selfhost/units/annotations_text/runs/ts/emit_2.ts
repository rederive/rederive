type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type JMap = { readonly [key: string]: Json };

const PROP_CLASS = /[%\r\n:,]/g;
const DATA_CLASS = /[%\r\n]/g;

const PROP_MAP: { readonly [key: string]: string } = {
  "%": "%25",
  "\r": "%0D",
  "\n": "%0A",
  ":": "%3A",
  ",": "%2C",
};

function esc(t: string, re: RegExp): string {
  return t.replace(re, (c: string): string => PROP_MAP[c] ?? c);
}

function textOf(v: Json | undefined): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

function isMap(f: Json | undefined): f is JMap {
  return f !== undefined && f !== null && typeof f === "object" && !Array.isArray(f);
}

function field(e: JMap, k: string): Json | undefined {
  return Object.prototype.hasOwnProperty.call(e, k) ? e[k] : undefined;
}

export function annotations_text(findings: readonly Json[]): string {
  if (!Array.isArray(findings)) throw new Error("findings must be a list");
  const kept: JMap[] = [];
  for (const f of findings as readonly (Json | undefined)[]) {
    if (isMap(f)) kept.push(f);
  }
  const lines: string[] = [];
  for (const e of kept) {
    const lv = field(e, "level");
    const level = lv === "error" || lv === "warning" || lv === "notice" ? lv : "error";
    const L = field(e, "line");
    const linePart = typeof L === "number" && Number.isSafeInteger(L) && L > 0 ? ",line=" + String(L) : "";
    const path = esc(textOf(field(e, "path")), PROP_CLASS);
    const title = esc(textOf(field(e, "title")), PROP_CLASS);
    const message = esc(textOf(field(e, "message")), DATA_CLASS);
    lines.push("::" + level + " file=" + path + linePart + ",title=" + title + "::" + message);
  }
  return lines.join("\n");
}
