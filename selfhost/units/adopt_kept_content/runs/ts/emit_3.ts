type Item = { fence: false; marker: string; body: string } | { fence: true; lines: string[] };

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

function isFence(line: string): boolean {
  return FENCE.test(line) && !isOneLine(line);
}

function run(line: string): string {
  const m = FENCE_RUN.exec(line);
  return m ? m[1] ?? '' : '';
}

function closes(line: string, opener: string): boolean {
  const r = run(line);
  const o = run(opener);
  if (r.length === 0 || o.length === 0) return false;
  if (r[0] !== o[0] || r.length < o.length) return false;
  return line.trim().slice(r.length).trim() === '';
}

function extractItems(text: string): Item[] {
  const items: Item[] = [];
  let prose: { marker: string; body: string } | null = null;
  let fence: string[] | null = null;
  const close = (): void => {
    if (prose !== null && prose.body.trim().length > 0) {
      items.push({ fence: false, marker: prose.marker, body: prose.body });
    }
    prose = null;
  };
  for (const line of linesOf(text)) {
    if (fence !== null) {
      fence.push(line);
      if (closes(line, fence[0] ?? '')) {
        items.push({ fence: true, lines: fence });
        fence = null;
      }
      continue;
    }
    if (isOneLine(line)) {
      close();
      items.push({ fence: true, lines: [line.trim()] });
      continue;
    }
    if (isFence(line)) {
      close();
      fence = [line];
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      close();
      items.push({ fence: false, marker: h[1] ?? '', body: (h[2] ?? '').trim() });
      continue;
    }
    if (line.trim() === '') {
      close();
      continue;
    }
    const l = LIST.exec(line);
    if (l) {
      close();
      prose = { marker: l[1] ?? '', body: l[2] ?? '' };
      continue;
    }
    if (prose !== null) {
      prose.body += ' ' + line.trim();
    } else {
      prose = { marker: '', body: line.trim() };
    }
  }
  close();
  if (fence !== null) items.push({ fence: true, lines: fence });
  return items;
}

function fragments(body: string): string[] {
  if (RAW.test(body)) {
    const t = body.trim();
    return t === '' ? [] : [t];
  }
  const spans: string[] = [];
  const masked = body.replace(MASK, (s) => {
    spans.push(s);
    return '\u0000' + (spans.length - 1) + '\u0000';
  });
  return masked
    .split(SPLIT)
    .map((p) => p.replace(UNMASK, (_m, k: string) => spans[Number(k)] ?? '').trim())
    .filter((p) => p !== '');
}

function key(f: string): string {
  if (RAW.test(f)) return '\u0002' + f;
  const parts = f.split(CODESPAN).map((p) =>
    p.length >= 2 && p.startsWith('`') && p.endsWith('`')
      ? '\u0001' + p.slice(1, -1) + '\u0001'
      : p.toLowerCase(),
  );
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function lineKey(l: string): string {
  return l.replace(/\s+/g, ' ').trim();
}

function keyLines(lines: string[]): string[] {
  if (lines.length === 1) {
    const only = lines[0] ?? '';
    return isOneLine(only) ? [only] : [];
  }
  if (lines.length > 1 && closes(lines[lines.length - 1] ?? '', lines[0] ?? '')) {
    return [lines[0] ?? '', ...lines.slice(1, -1).filter((l) => l.trim() !== '')];
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
  if (b) m = m.slice(b.index + b[0].length);
  const e = END.exec(m);
  if (e) m = m.slice(0, e.index);
  m = m.trim();

  const lists: string[][] = [];
  const blocks = new Set<string>();
  for (const it of extractItems(m)) {
    if (it.fence) blocks.add(blockKey(it.lines));
    else lists.push(fragments(it.body).map(key));
  }

  const out: string[] = [];
  for (const it of extractItems(u)) {
    let rep = false;
    if (it.fence) {
      rep = keyLines(it.lines).length > 0 && blocks.has(blockKey(it.lines));
    } else {
      const ks = fragments(it.body).map(key);
      if (ks.length > 0) {
        for (const list of lists) {
          for (let s = 0; s + ks.length <= list.length && !rep; s++) {
            let ok = true;
            for (let i = 0; i < ks.length; i++) {
              if (list[s + i] !== ks[i]) {
                ok = false;
                break;
              }
            }
            if (ok) rep = true;
          }
          if (rep) break;
        }
      }
    }
    if (rep) continue;
    if (it.fence) out.push(it.lines.join('\n'));
    else out.push(it.marker !== '' ? it.marker + ' ' + it.body : it.body);
  }
  return out;
}
