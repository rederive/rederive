// The real function behind unit review_summary (the review system's self-treatment, phase 2, 2026-11-02): pr-review.summary, the per-contract report in the job summary.
export const module = 'cli/lsp/pr-review.mjs';
export const make = (m) => (units, stops) => m.summary({ units, stops });
