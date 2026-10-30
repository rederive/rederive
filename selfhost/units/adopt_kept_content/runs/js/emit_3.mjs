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
const linesOf = (t) => t.split('\n').map((l) => l.replace(/\r$/, ''));
const isOne = (l) => ONELINE.test(l) && l.trim().length > 6;
const isFence = (l) => FENCE.test(l) && !isOne(l);
const run = (l) => FENCE_RUN.exec(l)?.[1] ?? '';
const closes = (l, opener) => {
  const r = run(l);
  const o = run(opener);
  return r !== '' && r[0] === o[0] && r.length >= o.length && l.trim().slice(r.length).trim() === '';
};

function extractItems(text) {
  const items = [];
  let prose = null;
  let fence = null;
  const close = () => {
    if (prose && prose.body.trim() !== '') items.push(prose);
    prose = null;
  };
  for (const line of linesOf(text)) {
    if (fence) {
      fence.push(line);
      if (closes(line, fence[0])) {
        items.push({ fence: true, lines: fence });
        fence = null;
      }
      continue;
    }
    if (isOne(line)) {
      close();
      items.push({ fence: true, lines: [line] });
      continue;
    }
    if (isFence(line)) {
      close();
      fence = [line];
      continue;
    }
    let m = line.match(HEADING);
    if (m) {
      close();
      items.push({ marker: m[1], body: m[2].trim() });
      continue;
    }
    if (line.trim() === '') {
      close();
      continue;
    }
    m = line.match(LIST);
    if (m) {
      close();
      prose = { marker: m[1], body: m[2] };
      continue;
    }
    if (prose) prose.body += ' ' + line.trim();
    else prose = { marker: '', body: line.trim() };
  }
  close();
  if (fence) items.push({ fence: true, lines: fence });
  return items;
}

function fragments(body) {
  if (RAW.test(body)) {
    const t = body.trim();
    return t === '' ? [] : [t];
  }
  const spans = [];
  const masked = body.replace(MASK, (s) => {
    spans.push(s);
    return '\u0000' + (spans.length - 1) + '\u0000';
  });
  return masked
    .split(SPLIT)
    .map((p) => p.replace(UNMASK, (_, k) => spans[Number(k)]).trim())
    .filter((p) => p !== '');
}

function keyOf(f) {
  if (RAW.test(f)) return '\u0002' + f;
  return f
    .split(CODESPAN)
    .map((p) =>
      p.length >= 2 && p.startsWith('`') && p.endsWith('`')
        ? '\u0001' + p.slice(1, -1) + '\u0001'
        : p.toLowerCase(),
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const lineKey = (l) => l.replace(/\s+/g, ' ').trim();

function keyLines(lines) {
  if (lines.length === 1 && isOne(lines[0])) return [lines[0]];
  if (lines.length > 1 && closes(lines[lines.length - 1], lines[0])) {
    return [lines[0], ...lines.slice(1, -1).filter((l) => l.trim() !== '')];
  }
  return [];
}

export default function adopt_kept_content(unmanaged, managed) {
  if (typeof managed !== 'string') throw new TypeError('managed must be a string');
  if (typeof unmanaged !== 'string') throw new TypeError('unmanaged must be a string');
  let m = lfRead(managed);
  const b = BEGIN.exec(m);
  if (b) m = m.slice(b.index + b[0].length);
  const e = END.exec(m);
  if (e) m = m.slice(0, e.index);
  m = m.trim();
  const u = lfRead(unmanaged).trim();

  const lists = [];
  const blocks = new Set();
  for (const it of extractItems(m)) {
    if (it.fence) blocks.add(keyLines(it.lines).map(lineKey).join('\n'));
    else lists.push(fragments(it.body).map(keyOf));
  }

  const out = [];
  for (const it of extractItems(u)) {
    if (it.fence) {
      const kl = keyLines(it.lines);
      if (!(kl.length > 0 && blocks.has(kl.map(lineKey).join('\n')))) {
        out.push(it.lines.length === 1 && isOne(it.lines[0]) ? it.lines[0].trim() : it.lines.join('\n'));
      }
    } else {
      const keys = fragments(it.body).map(keyOf);
      let rep = false;
      if (keys.length > 0) {
        for (const L of lists) {
          for (let s = 0; s + keys.length <= L.length && !rep; s++) {
            let ok = true;
            for (let i = 0; i < keys.length; i++) {
              if (L[s + i] !== keys[i]) {
                ok = false;
                break;
              }
            }
            if (ok) rep = true;
          }
          if (rep) break;
        }
      }
      if (!rep) out.push(it.marker !== '' ? it.marker + ' ' + it.body : it.body);
    }
  }
  return out;
}
