const LINE_BREAK = /\r\n|\r|\n/;
const LINE_BREAK_G = /\r\n|\r|\n/g;
const LEAD = new RegExp("^[ \\t\\uFEFF]+");
const BOM_G = new RegExp("\\uFEFF", "g");
const TRAIL = /[ \t]+$/;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^[A-Z][A-Z0-9-]*$/;

function isDirective(raw: string): boolean {
  const line = raw.replace(LEAD, (m: string) => m.replace(BOM_G, "")).replace(TRAIL, "");
  if (line === "") return false;
  const c = line.charAt(0);
  if (c === " " || c === "\t" || c === "#") return false;
  const sp = line.indexOf(" ");
  const tab = line.indexOf("\t");
  let end = line.length;
  if (sp >= 0 && sp < end) end = sp;
  if (tab >= 0 && tab < end) end = tab;
  let name = line.slice(0, end);
  if (COLON_NAME.test(name) && name !== "CITED:") name = name.slice(0, -1);
  return NAME.test(name) && name !== "CITED";
}

export default function directive_spans(text: string): Array<[number, number]> {
  const lines = text.split(LINE_BREAK);
  const breaks = Array.from(text.matchAll(LINE_BREAK_G), (m) => m[0]);
  const starts: number[] = [];
  let git = 1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l !== undefined && isDirective(l)) {
      if (starts.length === 0 || starts[starts.length - 1] !== git) starts.push(git);
    }
    const b = breaks[i];
    if (b === "\n" || b === "\r\n") git++;
  }
  const lfCount = text.split("\n").length;
  const last = Math.max(1, text.endsWith("\n") ? lfCount - 1 : lfCount);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    if (s === undefined) continue;
    const next = starts[i + 1];
    out.push([s, next === undefined ? last : next - 1]);
  }
  return out;
}
