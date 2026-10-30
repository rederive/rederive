type Item =
  | { kind: 'prose'; marker: string; body: string }
  | { kind: 'fence'; lines: string[] };

const BEGIN = /<!--\s*rederive:begin\b(?:(?!<!--)[\s\S])*?-->/;
const END = /<!--\s*rederive:end\s*-->/;
const FENCE = /^\s*(?:```|~~~)/;
const FENCE_RUN = /^\s*(`{3,}|~{3,})/;
const ONELINE = /^\s*```.*```\s*$/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const LIST = /^\s*(\d+\.|[-*])\s+(.*)$/;
const MASK = /`[^`]*`/g;
const SPLIT = /(?<=[.!?]["')\]]?)\s+(?=[A-Z`(\u0000])/;
const UNMASK = /\u0000(\d+)\u0000/g;
const RAW = /[\u0000\u0001]/;
const CODESPAN = /(`[^`]*`)/;

function lfRead(t: string): string {
  return t.split('\n').map((l) => l.replace(/\r$/, '')).join('\n');
}

function linesOf(t: string): string[] {
  return t.split('\n').map((l) => l.replace(/\r$/, ''));
}

function isOneLine(line: string): boolean {
  return ONELINE.test(line) && line.trim().length > 6;
}

function runOf(line: string): string {
  const m = FENCE_RUN.exec(line);
  return m?.[1] ?? '';
}

function closes(opener: string, line: string): boolean {
  const r = runOf(line);
  const o = runOf(opener);
  if (r.length === 0) return false;
  if (r[0] !== o[0] || r.length < o.length) return false;
  return line.trim().slice(r.length).trim().length === 0;
}

function extractItems(text: string): Item[] {
  const items: Item[] = [];
  let prose: { marker: string; body: string } | null = null;
  let fence: string[] | null = null;
  const close = (): void => {
    if (prose !== null && prose.body.trim().length > 0) {
      items.push({ kind: 'prose', marker: prose.marker, body: prose.body });
    }
    prose = null;
  };
  for (const line of linesOf(text)) {
    if (fence !== null) {
      fence.push(line);
      if (closes(fence[0] ?? '', line)) {
        items.push({ kind: 'fence', lines: fence });
        fence = null;
      }
      continue;
    }
    const one = isOneLine(line);
    if (one) {
      close();
      items.push({ kind: 'fence', lines: [line] });
      continue;
    }
    if (FENCE.test(line)) {
      close();
      fence = [line];
      continue;
    }
    const h = HEADING.exec(line);
    if (h !== null) {
      close();
      items.push({ kind: 'prose', marker: h[1] ?? '', body: (h[2] ?? '').trim() });
      continue;
    }
    if (line.trim().length === 0) {
      close();
      continue;
    }
    const li = LIST.exec(line);
    if (li !== null) {
      close();
      prose = { marker: li[1] ?? '', body: li[2] ?? '' };
      continue;
    }
    if (prose !== null) {
      prose.body += ' ' + line.trim();
    } else {
      prose = { marker: '', body: line.trim() };
    }
  }
  close();
  if (fence !== null) items.push({ kind: 'fence', lines: fence });
  return items;
}

function fragments(body: string): string[] {
  if (RAW.test(body)) {
    const t = body.trim();
    return t.length > 0 ? [t] : [];
  }
  const spans: string[] = [];
  const masked = body.replace(MASK, (s) => {
    spans.push(s);
    return '\u0000' + String(spans.length - 1) + '\u0000';
  });
  return masked
    .split(SPLIT)
    .map((p) => p.replace(UNMASK, (_m, k: string) => spans[Number(k)] ?? '').trim())
    .filter((p) => p.length > 0);
}

function keyOf(fragment: string): string {
  if (RAW.test(fragment)) return '\u0002' + fragment;
  const parts = fragment.split(CODESPAN);
  const out = parts.map((p) =>
    p.length >= 2 && p.startsWith('`') && p.endsWith('`')
      ? '\u0001' + p.slice(1, -1) + '\u0001'
      : p.toLowerCase(),
  );
  return out.join('').replace(/\s+/g, ' ').trim();
}

function lineKey(l: string): string {
  return l.replace(/\s+/g, ' ').trim();
}

function keyLines(lines: string[]): string[] {
  const first = lines[0] ?? '';
  if (lines.length === 1) return isOneLine(first) ? [first] : [];
  if (lines.length > 1 && closes(first, lines[lines.length - 1] ?? '')) {
    return [first, ...lines.slice(1, -1).filter((l) => l.trim().length > 0)];
  }
  return [];
}

function blockKey(lines: string[]): string {
  return keyLines(lines).map(lineKey).join('\n');
}

export default function adopt_kept_content(unmanaged: string, managed: string): string[] {
  const u = lfRead(unmanaged).trim();
  let m = lfRead(managed);
  const b = BEGIN.exec(m);
  if (b !== null) m = m.slice(b.index + b[0].length);
  const e = END.exec(m);
  if (e !== null) m = m.slice(0, e.index);
  m = m.trim();

  const proseLists: string[][] = [];
  const blocks = new Set<string>();
  for (const it of extractItems(m)) {
    if (it.kind === 'prose') proseLists.push(fragments(it.body).map(keyOf));
    else blocks.add(blockKey(it.lines));
  }

  const result: string[] = [];
  for (const it of extractItems(u)) {
    if (it.kind === 'fence') {
      const kl = keyLines(it.lines);
      if (kl.length >= 1 && blocks.has(blockKey(it.lines))) continue;
      const first = it.lines[0] ?? '';
      result.push(it.lines.length === 1 && isOneLine(first) ? first.trim() : it.lines.join('\n'));
    } else {
      const keys = fragments(it.body).map(keyOf);
      let rep = false;
      if (keys.length >= 1) {
        for (const list of proseLists) {
          for (let s = 0; s + keys.length <= list.length && !rep; s++) {
            let ok = true;
            for (let j = 0; j < keys.length; j++) {
              if (list[s + j] !== keys[j]) {
                ok = false;
                break;
              }
            }
            if (ok) rep = true;
          }
          if (rep) break;
        }
      }
      if (rep) continue;
      result.push(it.marker.length > 0 ? it.marker + ' ' + it.body : it.body);
    }
  }
  return result;
}
