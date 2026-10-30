type Hit = { line: number; what: string; text: string };
type Result = { hits: Hit[]; hitLines: number; lines: number; commentLines: number; density: number };

const LINES = /\r\n|\r|\n/;
const NORMALIZE_LEAD = /^[ \t\uFEFF]+/;
const NORMALIZE_TRAIL = /[ \t]+$/;
const QUOTED = /(?<=^|[ \t(\[{,=:;|<>!&\-~])(?:"(?:\\[\s\S]|[^"\\])*")+/g;
const SPAN = /"(?:\\[\s\S]|[^"\\])*"/g;

const SHAPES: { what: string; re: RegExp }[] = [
  { what: "typeof", re: /\btypeof\b/ },
  { what: "arrow fn", re: /=>/ },
  { what: "method call", re: /\.(match|reduce|slice|test|exec|split|map|filter)\(/ },
  { what: "JS builtin", re: /\b(parseInt|parseFloat|Number|String|Math)\s*[.(]/ },
  { what: "if (", re: /\bif\s*\(/ },
  { what: "return", re: /\breturn\b/ },
  { what: "loop", re: /\bfor\s+\w+\s+in\b|\bfor\s*\(|\bwhile\s*\(/ },
  { what: "STEP/NODE/BRANCH narration", re: /^\s*#?\s*(STEP|NODE|BRANCH|GATE)\s+[\w-]+/i },
  { what: "indexed assignment", re: /\w\[\w+\]\s*(?:\*\*|<<|>>>?|&&|\|\||\?\?|[-+*\/%&|^])?=(?![=>])/ },
  { what: "dialect regex literal", re: /\/\^.*\$\/[a-z]*/ },
  { what: "JS value name (say none)", re: /\b(null|undefined)\b/ },
  { what: "assignment statement", re: /[A-Za-z_]\w*\s*=\s*[^=\s].*;\s*$/ },
  { what: "capture-group reference", re: /\bgroup\d\b/ },
];

export default function lint_transcription(text: string): Result {
  const hits: Hit[] = [];
  const hitSet = new Set<number>();
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
    const stripped = line.replace(QUOTED, (run) => run.replace(SPAN, '""'));
    const cut = Array.from(trimmed).slice(0, 96).join("");
    for (const s of SHAPES) {
      if (s.re.test(stripped)) {
        hits.push({ line: i + 1, what: s.what, text: cut });
        hitSet.add(i + 1);
      }
    }
  }
  const hitLines = hitSet.size;
  return { hits, hitLines, lines, commentLines, density: lines === 0 ? 0 : hitLines / lines };
}
