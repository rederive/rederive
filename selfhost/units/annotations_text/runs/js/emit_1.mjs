const LEVELS = new Set(['error', 'warning', 'notice']);

function textOf(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

function prop(t) {
  return t.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function data(t) {
  return t.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export function annotations_text(findings) {
  const kept = findings.filter((f) => f !== null && typeof f === 'object' && !Array.isArray(f));
  return kept
    .map((f) => {
      const level = LEVELS.has(f.level) ? f.level : 'error';
      const L = f.line;
      const linePart = Number.isSafeInteger(L) && L > 0 ? ',line=' + String(L) : '';
      return '::' + level + ' file=' + prop(textOf(f.path)) + linePart + ',title=' + prop(textOf(f.title)) + '::' + data(textOf(f.message));
    })
    .join('\n');
}
