// The real function behind unit explain_diff (the review system's self-treatment, 2026-11-02): explain.explainDiff, the plain-English change list and the Stop rules (untested change, contradicted citation).
export const module = 'cli/lsp/explain.mjs';
export const make = (m) => (before, after, oracleChanged, langs) => m.explainDiff(before, after, { oracleChanged, langs });
