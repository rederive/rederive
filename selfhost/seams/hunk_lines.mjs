// The real function behind unit hunk_lines (the review system's self-treatment, phase 2, 2026-11-02): pr-review.hunkLines, the new-side lines a unified diff covers (where line notes may go).
export const module = 'cli/lsp/pr-review.mjs';
export const make = (m) => (diff) => m.hunkLines(diff);
