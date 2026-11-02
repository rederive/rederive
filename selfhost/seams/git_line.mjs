// The real function behind unit git_line (the review system's self-treatment, phase 3 prerequisite, 2026-11-02): pr-review.gitLine, a parser line (CR, LF and CRLF all break) mapped to git's line (only LF and CRLF advance it), for each requested line.
export const module = 'cli/lsp/pr-review.mjs';
export const make = (m) => (text, lines) => lines.map(m.gitLine(text));
