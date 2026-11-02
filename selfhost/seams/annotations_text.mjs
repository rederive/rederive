// The real function behind unit annotations_text (the review system's self-treatment, phase 2, 2026-11-02): pr-review.annotations, the workflow-command lines for the review findings.
export const module = 'cli/lsp/pr-review.mjs';
export const make = (m) => (findings) => m.annotations(findings);
