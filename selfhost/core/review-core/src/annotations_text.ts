type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

type JsonMap = { readonly [key: string]: Json };

function isMap(f: unknown): f is JsonMap {
  return f !== null && typeof f === 'object' && !Array.isArray(f);
}

function textOf(v: Json | undefined): string {
  if (v === undefined || v === null) return '';
  return String(v);
}

function prop(t: string): string {
  return t
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

function data(t: string): string {
  return t.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function field(e: JsonMap, k: string): Json | undefined {
  return Object.prototype.hasOwnProperty.call(e, k) ? e[k] : undefined;
}

export function annotations_text(findings: readonly Json[]): string {
  if (!Array.isArray(findings)) throw new Error('findings must be a list');
  const lines: string[] = [];
  for (const f of findings as readonly unknown[]) {
    if (!isMap(f)) continue;
    const lv = field(f, 'level');
    const level = lv === 'error' || lv === 'warning' || lv === 'notice' ? lv : 'error';
    const l = field(f, 'line');
    const linePart =
      typeof l === 'number' && Number.isSafeInteger(l) && l > 0 ? ',line=' + String(l) : '';
    const path = prop(textOf(field(f, 'path')));
    const title = prop(textOf(field(f, 'title')));
    const message = data(textOf(field(f, 'message')));
    lines.push('::' + level + ' file=' + path + linePart + ',title=' + title + '::' + message);
  }
  return lines.join('\n');
}
