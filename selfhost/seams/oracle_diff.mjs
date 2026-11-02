// The real function behind unit oracle_diff (the review system's self-treatment, phase 2, 2026-11-02): explain.oracleDiff (with shown), what a PR did to an oracle file: added, removed, rewritten answers, changed inputs.
export const module = 'cli/lsp/explain.mjs';
export const make = (m) => (beforeJson, afterJson) => m.oracleDiff(beforeJson, afterJson);
