type Hit = { line: number, what: string, text: string };
type Result = { hits: Hit[], hitLines: number, lines: number, commentLines: number, density: number };

const SHAPES: [string, RegExp][] = [
  ["typeof", /\btypeof\b/],
  ["arrow fn", /=>/],
  ["method call", /\.(match|reduce|slice|test|exec|split|map|filter)\(/],
  ["JS builtin", /\b(parseInt|parseFloat|Number|String|Math)\s*[.(]/],
  ["if (", /\bif\s*\(/],
  ["return", /\breturn\b/],
  ["loop", /\bfor\s+\w+\s+in\b|\bfor\s*\(|\bwhile\s*\(/],
  ["STEP/NODE/BRANCH narration", /^\s*#?\s*(STEP|NODE|BRANCH|GATE)\s+[\w-]+/i],
  ["indexed assignment", /\w\[\w+\]\s*=[^=]/],
  ["dialect regex literal", /\/\^.*\$\/[a-z]*/],
  ["JS value name (say none)", /\b(null|undefined)\b/],
  ["assignment statement", /[A-Za-z_]\w*\s*=\s*[^=\s].*;\s*$/],
  ["capture-group reference", /\bgroup\d\b/],
];

export default function lint_transcription(text: string): Result {
  const hits: Hit[] = [];
  const hitSet = new Set<number>();
  let lines = 0;
  let commentLines = 0;
  const raw = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < raw.length; i++) {
    const norm = raw[i].replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    const trimmed = norm.trim();
    if (trimmed === "") continue;
    lines++;
    if (trimmed.startsWith("#")) commentLines++;
    const stripped = norm.replace(/"(?:\\.|[^"\\\n])*"/g, '""');
    const cut = Array.from(trimmed).slice(0, 96).join("");
    for (const [what, re] of SHAPES) {
      if (re.test(stripped)) {
        hits.push({ line: i + 1, what, text: cut });
        hitSet.add(i + 1);
      }
    }
  }
  const hitLines = hitSet.size;
  return { hits, hitLines, lines, commentLines, density: lines === 0 ? 0 : hitLines / lines };
}
