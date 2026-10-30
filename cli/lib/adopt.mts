/**
 * Detects a profile's CLAUDE.md/AGENTS.md section already present UNMANAGED (pasted in by
 * hand, or by an agent, before the marker discipline existed for this project) so `rdv init`
 * doesn't duplicate it — and `--adopt` lets a consumer explicitly replace that unmanaged
 * block with the managed one instead of leaving two copies of the same guidance around.
 *
 * A profile's section is often GENERICIZED from the exact repo it was extracted from — "the
 * design doc" instead of "the GDD", "the giver" instead of a name — so most prose lines don't
 * match verbatim even when the section plainly IS the same content. What survives genericizing
 * is (a) headings, usually untouched or only lightly reworded, and (b) literal, structural
 * lines — command blocks, paths, code — which genericizing has no reason to touch. So:
 *
 * Detection: match if ANY heading in the profile section appears in the existing file
 * (punctuation/whitespace-normalized, case-insensitive, a trailing parenthetical ignored on
 * both sides) AND at least two lines from the WHOLE section (any subsection, non-blank,
 * non-heading, not a code-fence delimiter, length > 15, whitespace-normalized) appear
 * verbatim as whole lines anywhere in the file. Two independent line matches plus a heading
 * is deliberately more than either alone would give: a single heading match is too generic
 * to trust ("## Hard rules" could be anyone's file), and two long prose/command lines
 * matching by coincidence across unrelated documents is vanishingly unlikely.
 */
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
// A file's lines with a CRLF line's CR removed (selfhost adopt_find_duplicate #9: in a CRLF file no heading matched, since `.`
// refuses CR — the section was silently duplicated). Line COUNT is the file's own '\n' split, so the indices map back.
const linesOf = (text: string): string[] => text.split('\n').map((l) => l.replace(/\r$/, ''));
// a fence delimiter is ``` or ~~~ (CommonMark); a ONE-LINE fence (```x```) is a whole block and flips nothing (round 5b, #110:
// findHeadings flipped on it while extractItems did not, so the giver's next heading was hidden and swallowed)
const isFence = (line: string): boolean => /^\s*(?:```|~~~)/.test(line) && !isOneLineFence(line);
// CommonMark's closing rule (round 5c, #135): a fence closes only on the SAME character, at least as long, with no info string — so a
// nested ``` inside ~~~ (a markdown example) or ```` stays content (it closed the outer fence and the code read as prose)
const fenceRun = (line: string) => /^\s*(`{3,}|~{3,})/.exec(line)?.[1] ?? '';
const closesFence = (opener: string, line: string) => { const r = fenceRun(line); return !!r && r[0] === fenceRun(opener)[0] && r.length >= fenceRun(opener).length && !line.trim().slice(r.length).trim(); };
const isOneLineFence = (line: string): boolean => /^\s*```.*```\s*$/.test(line) && line.trim().length > 6;
// The MANAGED markers, exactly — never "the first `-->` anywhere" (selfhost #7 adopt: an unrelated `<!-- note -->` cut the section
// there and dropped every heading before it). Any rederive:begin counts, so an older marker wording is still recognized.
// the begin marker may wrap lines, but never runs into ANOTHER comment (#110: a lazy [\s\S] ran to an unrelated `-->`; #123: the
// line-bound fix stopped recognizing a wrapped marker, so the managed block itself read as an unmanaged copy — data loss)
const BEGIN_RE = /<!--\s*rederive:begin\b(?:(?!<!--)[\s\S])*?-->/;
const HAS_BEGIN = /<!--\s*rederive:begin\b/;   // the guard: ANY begin marker, closed or not, means "already managed"
const END_RE = /<!--\s*rederive:end\s*-->/;
function stripMarkers(section: string): string {
  let body = linesOf(section).join('\n');
  const b = body.match(BEGIN_RE); if (b) body = body.slice(b.index! + b[0].length);
  const e = body.match(END_RE); if (e) body = body.slice(0, e.index);
  return body.trim();
}

/** Heading TEXT (the part after the #'s), normalized for cross-document comparison: a
 * trailing parenthetical is dropped (genericizing often reworks or drops it), then
 * lowercased with punctuation collapsed to spaces so wording differences in dashes/quotes/
 * capitalization don't matter — only the run of words does. */
function normalizeHeadingText(text: string): string {
  const noTrailingParen = text.replace(/\s*\([^)]*\)\s*$/, '');
  return noTrailingParen.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

interface Heading { level: number; text: string; lineIdx: number }
/** Headings OUTSIDE fenced code (#5: a `# install deps` shell comment matched, ended and extended blocks). */
function findHeadings(lines: string[]): Heading[] {
  const out: Heading[] = []; let opener: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (opener !== null) { if (closesFence(opener, lines[i])) opener = null; continue; }
    if (isFence(lines[i])) { opener = lines[i]; continue; }
    const m = lines[i].match(HEADING_RE);
    if (m) out.push({ level: m[1].length, text: normalizeHeadingText(m[2]), lineIdx: i });
  }
  return out;
}

export interface SectionSignature { headings: Set<string>; distinctiveLines: string[] }

/** Every heading (normalized) in the profile section, and the pool of candidate distinctive
 * lines gathered across the WHOLE section (not just near the first heading) — genericizing
 * can rewrite everything close to a given heading while leaving a command block eight lines
 * later untouched, so a narrow "just after the heading" window misses real matches. */
export function sectionSignature(section: string): SectionSignature | null {
  const lines = stripMarkers(section).split('\n');
  // a heading whose text normalizes to nothing (`## (draft)`, `## ---`) can never match (#6: any two such headings matched)
  const headings = findHeadings(lines).filter((h) => h.text);
  if (!headings.length) return null;
  const pool = new Set<string>(); const headingLines = new Set(findHeadings(lines).map((h) => h.lineIdx));
  lines.forEach((l, i) => {
    if (!l.trim() || headingLines.has(i) || isFence(l)) return;
    const n = norm(l);
    if (n.length > 15) pool.add(n);   // DISTINCT lines (#4: one line repeated in the profile counted twice)
  });
  return { headings: new Set(headings.map((h) => h.text)), distinctiveLines: [...pool] };
}

export interface UnmanagedBlock { heading: string; startLine: number; endLine: number }

/** Is `sig` already present, unmanaged, in `existing`? Null when `existing` already holds a managed marker block (#8: the
 * managed block itself was reported as an "unmanaged" duplicate when the begin marker's wording differed).
 * The block is a CONTIGUOUS RUN of matched sections — each section a heading and its lines up to the NEXT heading of any
 * level — starting at a matched heading and ending at the first heading that is not matched (or EOF), confirmed by at least
 * two DISTINCT distinctive lines of the profile section found INSIDE the run. Round 5 of rederive's self re-derivation
 * (selfhost adopt_find_duplicate): the old extent ran from the first matched heading to the end of the LAST one's section,
 * so a giver's own section between two matched headings, an unmatched deeper subsection, or everything after a level-1 match
 * was inside the block a later replace deletes; and the confirming lines could sit anywhere in the file. A section the run
 * does not cover stays where it is: duplicated guidance is recoverable, deleted guidance is not. */
export function findUnmanagedDuplicate(existing: string, section: string): UnmanagedBlock | null {
  if (HAS_BEGIN.test(existing)) return null;
  const sig = sectionSignature(section);
  if (!sig) return null;
  const lines = linesOf(existing);
  const hs = findHeadings(lines);
  const isMatched = (h: Heading) => !!h.text && sig.headings.has(h.text);
  for (let k = 0; k < hs.length; k++) {
    if (!isMatched(hs[k])) continue;
    let j = k; while (j + 1 < hs.length && isMatched(hs[j + 1])) j++;
    const startLine = hs[k].lineIdx, endLine = j + 1 < hs.length ? hs[j + 1].lineIdx : lines.length;
    const inside = new Set(lines.slice(startLine, endLine).map(norm));
    if (sig.distinctiveLines.filter((d) => inside.has(d)).length >= 2) return { heading: lines[startLine].trim(), startLine, endLine };
    k = j;
  }
  return null;
}

/** Replace the unmanaged block (as located by findUnmanagedDuplicate) with the managed
 * section, keeping everything before and after it untouched. `keptLines`, when non-empty,
 * become a NEW unmanaged "## Project rules" section placed immediately after the managed
 * block — see extractKeptContent. Never re-touched on a later run: once the managed marker
 * block exists, findUnmanagedDuplicate short-circuits to null and this function isn't called
 * again, so a second --adopt is a no-op on both the managed block and the kept section. */
export function replaceUnmanagedBlock(existing: string, block: UnmanagedBlock, managedSection: string, keptLines: string[] = []): string {
  // The giver's text OUTSIDE the block comes back exactly as written (round 5, selfhost adopt_replace_block F1–F5: a \s trim
  // took the trailing spaces of the line before the block — a markdown hard break — and the indentation of the line after it —
  // an indented code block —, an extra newline was appended at EOF, a CRLF file came back with mixed endings, and an inverted
  // or negative range duplicated or deleted the giver's lines). Only whole BLANK lines at the block's edges are replaced by the
  // one blank line that separates the parts; the file's own line ending joins them.
  const lines = existing.split('\n');
  const { startLine: a, endLine: b } = block;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b <= a || b > lines.length) throw new Error(`adopt: block lines [${a}, ${b}) are not a range of this ${lines.length}-line file`);
  const visible = (t: string) => /[^\s\p{Cf}]/u.test(t);   // one emptiness rule (#111)
  if (!visible(managedSection)) throw new Error('adopt: the managed section is empty — refusing to replace the giver\'s block with nothing');
  const eol = /\r\n/.test([...lines.slice(0, a), ...lines.slice(b)].join('\n')) ? '\r\n' : '\n';   // the GIVER'S text decides, never the removed block (#111)
  const blank = (l: string) => /^[ \t\r]*$/.test(l);
  const head = lines.slice(0, a); while (head.length && blank(head[head.length - 1])) head.pop();
  const tail = lines.slice(b); while (tail.length && blank(tail[0]) && tail.length > 1) tail.shift(); if (tail.length === 1 && blank(tail[0])) tail.length = 0;
  const asEol = (t: string) => t.replace(/\r\n|\r|\n/g, eol);
  const kept = keptLines.filter(visible).map((k) => k.replace(/[\r\n]+$/, ''));
  const projectRules = kept.length ? `## Project rules (kept by \`rdv init --adopt\` — review and merge)${eol}${eol}${kept.map(asEol).join(eol + eol)}` : '';
  const before = head.map((l, i) => (i < head.length - 1 || eol === '\n' ? l : l.replace(/\r$/, ''))).join('\n');
  const after = tail.join('\n');
  const parts = [before, asEol(managedSection.trim()), projectRules, after].filter((p) => p.length > 0);
  const out = parts.join(eol + eol);
  return after ? out : out + eol;   // the tail carries the file's own ending; with no tail the managed part ends the file
}

// ── content preservation: --adopt must never SILENTLY drop content ─────────────────────────
// A genericized section rewrites nearly every sentence, so replacing the unmanaged block
// wholesale would steamroll whatever project-specific substance the giver's own words carried
// that the profile never generalized — a rule the profile no longer has at all, a clause
// naming something project-specific, a citation into the project's own design doc, a
// diagram/command line whose details changed. NO HEURISTIC (a fuzzy word-overlap "is this
// roughly the same rule?" check was tried and rejected: a paraphrased GENERIC rule scored as
// "matching" the project's SPECIFIC one, which is exactly the drop this exists to prevent).
// The only standard: a sentence/list-item/diagram-line of the unmanaged block is REPRESENTED
// only if its normalized text is an EXACT duplicate of some sentence in the managed section.
// Over-keeping is fine — the giver reviews and merges "## Project rules" by hand. Dropping
// isn't, ever, without the explicit --force-adopt.

/** Normalizes a fragment for exact-duplicate comparison: strip markdown backticks/asterisks
 * (formatting, not content), collapse whitespace, lowercase. Nothing else — no stemming, no
 * stopwords, no partial credit. Punctuation, citations (§11), and specific nouns all stay
 * exactly as written, because THAT is precisely the content a generic rewording drops. */
function normalizeForMatch(s: string): string {
  // a `code span` is compared EXACTLY (#adopt A3/A4: stripping `*` turned `*.env` into `.env`, folding case turned `-S` into
  // `-s`); only prose around it loses emphasis asterisks and case
  // round 5c (#135): a span keeps its BOUNDARY (`ls` -S ≠ `ls -s`), and only PAIRED emphasis asterisks go (a bare *.env stays)
  // round 5d (#144): NO asterisk is stripped any more — emphasis rules read globs and exponents as bold (`**/node_modules/**`
  // matched `/node_modules/`, `x**2**` matched `x2`) and dropped the giver's rule; a bolded duplicate is simply kept (over-keeping
  // is recoverable). A fragment carrying U+0000 or U+0001 (the span machinery's own marks) is compared RAW.
  if (/[\u0000\u0001]/.test(s)) return `\u0002${s}`;
  const prose = (p: string) => p.toLowerCase();
  return s.split(/(`[^`]*`)/).map((p) => (p.startsWith('`') && p.endsWith('`') && p.length >= 2 ? `\u0001${p.slice(1, -1)}\u0001` : prose(p)))
    .join('').replace(/\s+/g, ' ').trim();
}

/** Reconstructs logical items from a markdown block: a numbered ("1.") or bulleted ("-"/"*")
 * list item with its wrapped continuation lines joined back into one string, a plain
 * (non-list) paragraph likewise joined, or — inside a fenced code block — each non-blank line
 * standing alone (a diagram/command table's rows are already one row per line, never wrapped,
 * and are exactly the kind of "specific to this project" content a citation-free rewording
 * silently drops: `architect: … in Lane's words` vs `… in the giver's words`). */
interface Item { marker: string; body: string; fence?: string[] }
function extractItems(text: string): Item[] {
  const lines = linesOf(text);
  const items: Item[] = [];
  let fence: string[] | null = null;
  let current: Item | null = null;
  const flush = () => { if (current && current.body.trim()) items.push(current); current = null; };
  for (const line of lines) {
    // a fenced block is ONE item, kept whole and verbatim (#adopt A2/A6: its delimiter line — info string included — was
    // dropped, a one-line fence flipped the fence state for the rest of the file, and its lines were sentence-split)
    if (fence) { fence.push(line); if (closesFence(fence[0], line)) { items.push({ marker: '', body: fence.join('\n'), fence }); fence = null; } continue; }
    if (isOneLineFence(line)) { flush(); items.push({ marker: '', body: line.trim(), fence: [line] }); continue; }
    if (isFence(line)) { flush(); fence = [line]; continue; }
    // a heading is an item too (#adopt A1: a rule written as a heading vanished)
    const h = line.match(HEADING_RE); if (h) { flush(); items.push({ marker: h[1], body: h[2].trim() }); continue; }
    if (!line.trim()) { flush(); continue; }
    const listMatch = line.match(/^\s*(\d+\.|[-*])\s+(.*)$/);
    if (listMatch) { flush(); current = { marker: listMatch[1], body: listMatch[2] }; }
    else if (current) current.body += ' ' + line.trim();
    else current = { marker: '', body: line.trim() };
  }
  flush();
  if (fence) items.push({ marker: '', body: fence.join('\n'), fence });   // an unclosed fence is kept as written
  return items;
}

/** A pragmatic sentence split, not a linguistic one: break after a `.`/`!`/`?` (optionally
 * followed by a closing quote/paren/bracket) that's followed by whitespace and then something
 * that looks like a new sentence start (a capital letter, backtick, or open-paren). Markdown
 * bold markers (`word.**`) don't trip it, since the character right before the whitespace is
 * `*`, not terminal punctuation — good enough for prose written like these rule files. */
function splitSentences(body: string): string[] {
  // a break never falls INSIDE a `code span` (round 5b, #118: `ls -S. Then` split, and each half was lowercased as prose)
  if (/[\u0000\u0001]/.test(body)) return [body.trim()].filter(Boolean);   // the giver's own NUL / U+0001: one fragment, compared raw (#135, #144)
  const spans: string[] = []; const masked = body.replace(/`[^`]*`/g, (m) => { spans.push(m); return `\u0000${spans.length - 1}\u0000`; });
  return masked.split(/(?<=[.!?]["')\]]?)\s+(?=[A-Z`(\u0000])/).map((x) => x.replace(/\u0000(\d+)\u0000/g, (_, k) => spans[Number(k)]).trim()).filter(Boolean);
}

/** Every sentence/list-item/diagram-line fragment of `unmanagedText` (the raw text of the
 * block --adopt is about to replace) whose normalized text is NOT an exact duplicate of any
 * fragment in `managedText` — the profile's genericized section. Returned verbatim, in
 * original reading order, with the ORIGINAL list marker (e.g. "4.") re-attached only to the
 * first fragment of an item (so a fully-orphaned numbered rule still reads as "4. …", while a
 * single kept clause mid-rule doesn't inherit a misleading number). This is what --adopt must
 * not silently discard. */
export function extractKeptContent(unmanagedText: string, managedText: string): string[] {
  const managedItems = extractItems(stripMarkers(managedText));
  // Round 5b (#118): an item is REPRESENTED only when ONE managed item says all of it — a prose item's every sentence inside one
  // managed prose item, a fence's lines as the same block of one managed fence — never sentences gathered from several rules, a
  // code line "covered" by profile prose, or a fence's lines in another order. The giver's text is read as written: markers are
  // stripped from the MANAGED side only (a stray end marker in the giver's block cut everything after it).
  const proseLists = managedItems.filter((it) => !it.fence).map((it) => splitSentences(it.body).map(normalizeForMatch));
  // #135 order matters; #144 and CONTIGUOUSLY — a managed rule that slips a qualifier between the giver's sentences changed it
  const inOrder = (want: string[], have: string[]) => want.length > 0 && have.some((_, at) => want.every((w, k) => have[at + k] === w));
  // a fence's KEY is its content lines: everything between its own opener and closer — a NESTED fence line is content (#144:
  // filtering every fence line let `~~~md` + nested ``` match a managed block without them, and the example was dropped)
  // #146: the key includes the OPENER (its info string is the giver's: ```bash ≠ ```py), and an UNCLOSED fence is never represented
  // (a lone trailing opener matched a managed text ending in the same opener and was dropped) — it keys to nothing
  const fenceKey = (f: string[]) => f.length === 1 && isOneLineFence(f[0]) ? [norm(f[0])]
    : f.length > 1 && closesFence(f[0], f[f.length - 1]) ? [norm(f[0]), ...f.slice(1, -1).filter((l) => l.trim()).map(norm)] : [];
  const fenceBlocks = new Set(managedItems.filter((it) => it.fence).map((it) => fenceKey(it.fence!).join('\n')));
  const kept: string[] = [];
  for (const item of extractItems(linesOf(unmanagedText).join('\n').trim())) {
    const represented = item.fence
      ? fenceKey(item.fence).length > 0 && fenceBlocks.has(fenceKey(item.fence).join('\n'))
      : (() => { const ss = splitSentences(item.body).map(normalizeForMatch); return proseLists.some((have) => inOrder(ss, have)); })();
    if (!represented) kept.push(item.fence ? item.body : item.marker ? `${item.marker} ${item.body}` : item.body);
  }
  return kept;
}
