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

const lfRead = (t) => t.split('\n').map((l) => l.replace(/\r$/, '')).join('\n');
const isOne = (l) => ONELINE.test(l) && l.trim().length > 6;
const runOf = (l) => FENCE_RUN.exec(l)?.[1] ?? '';
const closes = (l, opener) => {
  const r = runOf(l);
  const o = runOf(opener);
  return r !== '' && r[0] === o[0] && r.length >= o.length && l.trim().slice(r.length).trim() === '';
};

function fragments(body) {
  if (RAW.test(body)) return [body.trim()].filter((s) => s !== '');
  const spans = [];
  const masked = body.replace(MASK, (m) => {
    spans.push(m);
    return '\u0000' + (spans.length - 1) + '\u0000';
  });
  return masked
    .split(SPLIT)
    .map((p) => p.replace(UNMASK, (_, k) => spans[Number(k)]).trim())
    .filter((s) => s !== '');
}

function keyOf(f) {
  if (RAW.test(f)) return '\u0002' + f;
  return f
    .split(CODESPAN)
    .map((p) => (p.length >= 2 && p.startsWith('`') && p.endsWith('`') ? '\u0001' + p.slice(1, -1) + '\u0001' : p.toLowerCase()))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const lineKey = (l) => l.replace(/\s+/g, ' ').trim();

function items(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const out = [];
  let prose = null;
  let fence = null;
  const close = () => {
    if (prose && prose.body.trim().length > 0) out.push(prose);
    prose = null;
  };
  for (const line of lines) {
    if (fence) {
      fence.lines.push(line);
      if (closes(line, fence.lines[0])) {
        out.push(fence);
        fence = null;
      }
      continue;
    }
    if (isOne(line)) {
      close();
      out.push({ fence: true, one: true, lines: [line] });
      continue;
    }
    if (FENCE.test(line)) {
      close();
      fence = { fence: true, one: false, lines: [line] };
      continue;
    }
    let m = line.match(HEADING);
    if (m) {
      close();
      out.push({ fence: false, marker: m[1], body: m[2].trim() });
      continue;
    }
    if (line.trim() === '') {
      close();
      continue;
    }
    m = line.match(LIST);
    if (m) {
      close();
      prose = { fence: false, marker: m[1], body: m[2] };
      continue;
    }
    if (prose) prose.body += ' ' + line.trim();
    else prose = { fence: false, marker: '', body: line.trim() };
  }
  close();
  if (fence) out.push(fence);
  return out;
}

function keyLines(it) {
  const L = it.lines;
  if (L.length === 1 && it.one) return [L[0]];
  if (L.length > 1 && closes(L[L.length - 1], L[0])) {
    return [L[0], ...L.slice(1, -1).filter((l) => l.trim() !== '')];
  }
  return [];
}

const blockKey = (it) => keyLines(it).map(lineKey).join('\n');

export default function adopt_kept_content(unmanaged, managed) {
  let m = lfRead(managed);
  const b = m.match(BEGIN);
  if (b) m = m.slice(b.index + b[0].length);
  const e = m.match(END);
  if (e) m = m.slice(0, e.index);
  m = m.trim();
  const u = lfRead(unmanaged).trim();

  const lists = [];
  const blocks = new Set();
  for (const it of items(m)) {
    if (it.fence) blocks.add(blockKey(it));
    else lists.push(fragments(it.body).map(keyOf));
  }

  const represented = (it) => {
    if (it.fence) {
      return keyLines(it).length >= 1 && blocks.has(blockKey(it));
    }
    const keys = fragments(it.body).map(keyOf);
    if (keys.length === 0) return false;
    for (const list of lists) {
      for (let s = 0; s + keys.length <= list.length; s++) {
        let ok = true;
        for (let i = 0; i < keys.length; i++) {
          if (list[s + i] !== keys[i]) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
      }
    }
    return false;
  };

  const result = [];
  for (const it of items(u)) {
    if (represented(it)) continue;
    if (it.fence) result.push(it.one ? it.lines[0].trim() : it.lines.join('\n'));
    else result.push(it.marker !== '' ? it.marker + ' ' + it.body : it.body);
  }
  return result;
}
