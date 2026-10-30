const BOM = String.fromCharCode(0xfeff);
const INV_SRC = "[\\u{9}-\\u{D}\\u{20}\\u{22}\\u{27}\\u{A0}\\u{AD}\\u{600}-\\u{605}\\u{61C}\\u{6DD}\\u{70F}\\u{890}-\\u{891}\\u{8E2}\\u{1680}\\u{180E}\\u{2000}-\\u{200F}\\u{2028}-\\u{202F}\\u{205F}-\\u{2064}\\u{2066}-\\u{206F}\\u{3000}\\u{FEFF}\\u{FFF9}-\\u{FFFB}\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}]";
const VISIBLE_RE = new RegExp("[^" + INV_SRC.slice(1, -1) + "]", "u");
const NAMEFORM = /^[A-Z][A-Z0-9-]*:?$/;
const OPENERS = new Set([" ", "\t", "(", "[", "{", ",", "=", ":", ";", "|", "<", ">", "!", "&", "-", "~"]);
const isSP = (c) => c === " " || c === "\t";

function trimSP(s) {
  let a = 0, b = s.length;
  while (a < b && isSP(s[a])) a++;
  while (b > a && isSP(s[b - 1])) b--;
  return s.slice(a, b);
}
function trimEndSP(s) {
  let b = s.length;
  while (b > 0 && isSP(s[b - 1])) b--;
  return s.slice(0, b);
}
function visible(s) {
  return VISIBLE_RE.test(s);
}
function spans(s) {
  const out = [];
  const n = s.length;
  let last = -2;
  let i = 0;
  while (i < n) {
    if (s[i] === '"' && (i === 0 || OPENERS.has(s[i - 1]) || i === last + 1)) {
      let k = i + 1, j = -1;
      while (k < n) {
        const c = s[k];
        if (c === "\\") {
          if (k + 1 >= n) { k = n; break; }
          const cp = s.codePointAt(k + 1);
          k += 1 + (cp > 0xffff ? 2 : 1);
        } else if (c === '"') { j = k; break; }
        else k++;
      }
      if (j < 0) break;
      out.push([i, j]);
      last = j;
      i = j + 1;
    } else i++;
  }
  return out;
}
const inside = (sp, p) => sp.some(([a, b]) => p > a && p <= b);

function cutComment(content) {
  const sp = spans(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] === "#" && isSP(content[i - 1]) && (i + 1 === content.length || isSP(content[i + 1])) && !inside(sp, i)) {
      return trimEndSP(content.slice(0, i));
    }
  }
  return content;
}

function analyze(piece) {
  const sp = spans(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const attrs = [];
  let m;
  while ((m = re.exec(piece)) !== null) {
    const wordStart = m.index + m[0].length - m[1].length;
    if (inside(sp, wordStart)) continue;
    attrs.push({ start: m.index, vStart: m.index + m[0].length });
  }
  const values = [];
  for (let i = 0; i < attrs.length; i++) {
    const end = i + 1 < attrs.length ? attrs[i + 1].start : piece.length;
    values.push(trimSP(piece.slice(attrs[i].vStart, end)));
  }
  const prefix = trimSP(attrs.length ? piece.slice(0, attrs[0].start) : piece);
  return { values, prefix };
}

export default function pin_lint(text) {
  const raw = text.split(/\r\n|\r|\n/);
  const pins = [];
  let cur = null;
  for (let k = 0; k < raw.length; k++) {
    let l = raw[k];
    let a = 0;
    while (a < l.length && (isSP(l[a]) || l[a] === BOM)) a++;
    l = l.slice(0, a).split(BOM).join("") + l.slice(a);
    l = trimEndSP(l);
    if (l === "") continue;
    let b = 0;
    while (b < l.length && isSP(l[b])) b++;
    const indent = l.slice(0, b);
    const content = l.slice(b);
    if (content[0] === "#") continue;
    const code = cutComment(content);
    let isDir = false, name = "", rest = "";
    if (indent === "") {
      let e = 0;
      while (e < code.length && !isSP(code[e])) e++;
      const nm = code.slice(0, e);
      if (NAMEFORM.test(nm)) {
        const bare = nm.endsWith(":") ? nm.slice(0, -1) : nm;
        if (bare !== "CITED") { isDir = true; name = bare; rest = code.slice(e); }
      }
    }
    if (isDir) {
      const an = analyze(rest);
      cur = { name, line: k + 1, text: l, vals: [...an.values], args: an.prefix, conts: [] };
      if (name === "PINNED" || name === "EARNED") pins.push(cur);
    } else if (cur) {
      const an = analyze(" " + code);
      cur.vals.push(...an.values);
      cur.conts.push(an.prefix);
    }
  }
  const hits = [];
  for (const p of pins) {
    let cited = p.vals.some(visible);
    if (!cited && p.name === "EARNED") cited = visible(p.args) || p.conts.some(visible);
    if (!cited) hits.push({ line: p.line, what: "pin without a citation", text: Array.from(p.text).slice(0, 96).join("") });
  }
  return { hits, pins: pins.length };
}
