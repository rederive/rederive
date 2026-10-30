const FEATURES = new Map([
  ['vectors', 0], ['carried-data', 1], ['envelope', 1], ['trace-seam', 1],
  ['scheduler', 2], ['lifecycle', 2], ['par-interleaving', 2], ['ring', 2],
  ['lang-variant', 3], ['cross-lang-anchor', 3],
]);
const VERSIONS = ['0.2', '0.3', '0.4', '0.5'];

export default function spec_version_for(features) {
  if (!Array.isArray(features)) throw new Error('features must be a list');
  let best = 0;
  for (const name of features) {
    if (typeof name !== 'string' || !FEATURES.has(name)) {
      throw new Error(`unknown feature "${name}" — not in cli/capabilities.json; refusing to stamp a version for it`);
    }
    const v = FEATURES.get(name);
    if (v > best) best = v;
  }
  return VERSIONS[best];
}
