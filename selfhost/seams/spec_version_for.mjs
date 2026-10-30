// The real function behind unit spec_version_for: the spec version a feature set requires (specVersionFor) — throws on an unknown feature.
export const module = 'cli/features.mjs';
export const make = (m) => (features) => m.specVersionFor(features);
