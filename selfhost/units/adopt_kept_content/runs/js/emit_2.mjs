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
const runOf = (l) => FENCE_RUN.exec(l)?.[1] ?? '';
function closes(line, opener) {
  const r = runOf(line);
  const o = runOf(opener);
  return r !== '' && r[0] === o[0] && r.length >= o.length && line.trim().slice(r.length).trim() === '';
}

function extractItems(text) {
  const lines = linesOf(text);
  const items = [];
  let prose = null;
  let fence = null;
  const close = () => {
    if (prose && prose.body.trim() !== '') items.push(prose);
    prose = null;
  };
  for (const line of lines) {
    if (fence) {
      fence.push(line);
      if (closes(line, fence[0])) {
        items.push({ fence });
        fence = null;
      }
      continue;
    }
    if (isOne(line)) {
      close();
      items.push({ fence: [line.trim()] });
      continue;
    }
    if (isFence(line)) {
      close();
      fence = [line];
      continue;
    }
    const h = line.match(HEADING);
    if (h) {
      close();
      items.push({ marker: h[1], body: h[2].trim() });
      continue;
    }
    if (line.trim() === '') {
      close();
      continue;
    }
    const m = line.match(LIST);
    if (m) {
      close();
      prose = { marker: m[1], body: m[2] };
      continue;
    }
    if (prose) prose.body += ' ' + line.trim();
    else prose = { marker: '', body: line.trim() };
  }
  close();
  if (fence) items.push({ fence });
  return items;
}

function fragments(body) {
  if (RAW.test(body)) return [body.trim()].filter((s) => s !== '');
  const spans = [];
  const masked = body.replace(MASK, (s) => {
    spans.push(s);
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

function keyLines(fence) {
  if (fence.length === 1) return isOne(fence[0]) ? [fence[0]] : [];
  if (fence.length > 1 && closes(fence[fence.length - 1], fence[0])) {
    return [fence[0], ...fence.slice(1, -1).filter((l) => l.trim() !== '')];
  }
  return [];
}

const blockKey = (kl) => kl.map(lineKey).join('\n');

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
    if (it.fence) {
      const kl = keyLines(it.fence);
      if (kl.length > 0) blocks.add(blockKey(kl));
    } else {
      lists.push(fragments(it.body).map(keyOf));
    }
  }

  const out = [];
  for (const it of extractItems(u)) {
    let rep = false;
    if (it.fence) {
      const kl = keyLines(it.fence);
      rep = kl.length > 0 && blocks.has(blockKey(kl));
      if (!rep) out.push(it.fence.join('\n'));
    } else {
      const keys = fragments(it.body).map(keyOf);
      if (keys.length > 0) {
        for (const list of lists) {
          for (let s = 0; s + keys.length <= list.length && !rep; s++) {
            let ok = true;
            for (let k = 0; k < keys.length; k++) {
              if (list[s + k] !== keys[k]) {
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
