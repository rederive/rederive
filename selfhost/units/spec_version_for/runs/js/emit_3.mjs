const FEATURES = new Map([
  ['vectors', '0.2'],
  ['carried-data', '0.3'],
  ['envelope', '0.3'],
  ['trace-seam', '0.3'],
  ['scheduler', '0.4'],
  ['lifecycle', '0.4'],
  ['par-interleaving', '0.4'],
  ['ring', '0.4'],
  ['lang-variant', '0.5'],
  ['cross-lang-anchor', '0.5'],
]);
const ORDER = ['0.2', '0.3', '0.4', '0.5'];

export default function spec_version_for(features) {
  if (!Array.isArray(features)) throw new Error('features must be a list');
  let result = '0.2';
  for (const name of features) {
    if (typeof name !== 'string' || !FEATURES.has(name)) {
      throw new Error(`unknown feature "${name}" — not in cli/capabilities.json; refusing to stamp a version for it`);
    }
    const since = FEATURES.get(name);
    if (ORDER.indexOf(since) > ORDER.indexOf(result)) result = since;
  }
  return result;
}
