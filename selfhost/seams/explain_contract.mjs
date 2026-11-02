// The real function behind unit explain_contract (the review system's self-treatment, phase 2, 2026-11-02): explain.explain, the plain-English reading of one primary (sections, items, tested-or-note).
export const module = 'cli/lsp/explain.mjs';
export const make = (m) => (primaryText) => m.explain(primaryText);
