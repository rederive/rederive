// The real function behind unit sir_parse: THE SIR parser (parse, default mode): AST + errors + warnings.
export const module = 'cli/sir/sir-parse.mjs';
export const make = (m) => (text) => { const r = m.parse(text); return { ast: r.ast, errors: r.errors, warnings: r.warnings }; };
