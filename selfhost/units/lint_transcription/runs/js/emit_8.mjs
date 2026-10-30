const LINES = /\r\n|\r|\n/;
const NORMALIZE_LEAD = /^[ \t\uFEFF]+/;
const NORMALIZE_TRAIL = /[ \t]+$/;
const QUOTED = /(?<=^|[ \t(\[{,=:;|<>!&\-~])(?:"(?:\\[\s\S]|[^"\\])*")+/g;
const SPAN = /"(?:\\[\s\S]|[^"\\])*"/g;

const SHAPES = [
  ["typeof", /\btypeof\b/],
  ["arrow fn", /=>/],
  ["method call", /\.(match|reduce|slice|test|exec|split|map|filter)\(/],
  ["JS builtin", /\b(parseInt|parseFloat|Number|String|Math)\s*[.(]/],
  ["if (", /\bif\s*\(/],
  ["return", /\breturn\b/],
  ["loop", /\bfor\s+\w+\s+in\b|\bfor\s*\(|\bwhile\s*\(/],
  ["STEP/NODE/BRANCH narration", /^\s*#?\s*(STEP|NODE|BRANCH|GATE)\s+[\w-]+/i],
  ["indexed assignment", /\w\[\w+\]\s*(?:\*\*|<<|>>>?|&&|\|\||\?\?|[-+*\/%&|^])?=(?![=>])/],
  ["dialect regex literal", /\/\^.*\$\/[a-z]*/],
  ["JS value name (say none)", /\b(null|undefined)\b/],
  ["assignment statement", /[A-Za-z_]\w*\s*=\s*[^=\s].*;\s*$/],
  ["capture-group reference", /\bgroup\d\b/],
];

export function lint_transcription(text) {
  const hits = [];
  const hitSet = new Set();
  let lines = 0;
  let commentLines = 0;
  const raw = text.split(LINES);
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]
      .replace(NORMALIZE_LEAD, (lead) => lead.replace(/\uFEFF/g, ""))
      .replace(NORMALIZE_TRAIL, "");
    const trimmed = line.trim();
    if (trimmed === "") continue;
    lines++;
    if (trimmed.startsWith("#")) commentLines++;
    const S = line.replace(QUOTED, (run) => run.replace(SPAN, '""'));
    const t = Array.from(trimmed).slice(0, 96).join("");
    for (const [what, re] of SHAPES) {
      if (re.test(S)) {
        hits.push({ line: i + 1, what, text: t });
        hitSet.add(i + 1);
      }
    }
  }
  const hitLines = hitSet.size;
  return { hits, hitLines, lines, commentLines, density: lines === 0 ? 0 : hitLines / lines };
}

export default lint_transcription;
