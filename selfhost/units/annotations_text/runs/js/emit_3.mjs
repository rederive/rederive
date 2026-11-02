const LEVELS = new Set(['error', 'warning', 'notice']);

const text = (v) => (v === null || v === undefined ? '' : String(v));

const data = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

const prop = (s) => data(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function annotations_text(findings) {
  const kept = findings.filter((f) => f !== null && typeof f === 'object' && !Array.isArray(f));
  return kept
    .map((f) => {
      const level = LEVELS.has(f.level) ? f.level : 'error';
      const L = f.line;
      const linePart = typeof L === 'number' && Number.isSafeInteger(L) && L > 0 ? ',line=' + String(L) : '';
      return '::' + level + ' file=' + prop(text(f.path)) + linePart + ',title=' + prop(text(f.title)) + '::' + data(text(f.message));
    })
    .join('\n');
}
