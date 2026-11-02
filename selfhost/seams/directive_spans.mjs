// The real function behind unit directive_spans (the review system's self-treatment, phase 2, 2026-11-02): pr-review.spans, each directive line to the last line of its span, as [start, end] pairs.
export const module = 'cli/lsp/pr-review.mjs';
export const make = (m) => (text) => [...m.spans(text)];
