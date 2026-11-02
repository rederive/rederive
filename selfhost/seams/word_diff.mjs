// The real function behind unit word_diff (the review system's self-treatment, 2026-11-02): explain.wordDiff, the phrase-level diff every PR comment shows.
export const module = 'cli/lsp/explain.mjs';
export const make = (m) => (a, b) => m.wordDiff(a, b);
