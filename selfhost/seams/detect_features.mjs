// The real function behind unit detect_features: THE feature detector (detectFeatures) — what pack stamps and rdv gates on.
export const module = 'cli/features.mjs';
export const make = (m) => (input) => m.detectFeatures(input);
